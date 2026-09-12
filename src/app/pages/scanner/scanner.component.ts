import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import jsQR from 'jsqr';
import { HitsterService } from '../../services/hitster.service';
import { GameStateService } from '../../services/game-state.service';
import { SeoService } from '../../services/seo.service';
import { ClientErrorReporterService } from '../../services/client-error-reporter.service';
import { isHitsterCardUrl } from './hitster-url';

declare global {
  interface Window {
    // Shape Detection API — not yet in TS's DOM lib, and only implemented by
    // Chromium. Declared the same way window.YT/window.Spotify are elsewhere
    // in this codebase for other browser-only globals.
    BarcodeDetector?: {
      new (options: { formats: string[] }): {
        detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
      };
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

const SCAN_INTERVAL = 250;
const MAX_DIMENSION = 600;
const SCAN_STUCK_MS = 10_000;

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [TitleCasePipe],
  templateUrl: './scanner.component.html',
  styleUrl: './scanner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScannerComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;

  private router = inject(Router);
  private hitster = inject(HitsterService);
  private state = inject(GameStateService);
  private seo = inject(SeoService);
  private errorReporter = inject(ClientErrorReporterService);

  readonly scanning = signal(false);
  readonly loading = signal(false);
  readonly loadingMessage = signal('Looking up track…');
  readonly error = signal<string | null>(null);
  readonly provider = this.state.provider;

  // Torch (rear-camera LED flash) — only Android Chrome/derivatives expose
  // this via MediaStreamTrack capabilities; iOS Safari has no torch API at
  // all, so torchSupported stays false there and the button never renders.
  readonly torchSupported = signal(false);
  readonly torchOn = signal(false);

  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  // One-shot report if scanning is still running after SCAN_STUCK_MS with
  // nothing found — camera permission was granted and frames are flowing
  // (we're never in this state otherwise), so a QR genuinely in frame that
  // never decodes points at the detector itself failing silently, which is
  // exactly what happens on browsers that poison canvas pixel readback for
  // anti-fingerprinting (see the BarcodeDetector comment above). Gives us
  // real signal on that instead of only ever hearing about it via a
  // GitHub issue with no diagnostic information attached.
  private scanStuckTimer: ReturnType<typeof setTimeout> | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private loadingMessageTimers: ReturnType<typeof setTimeout>[] = [];
  // Native QR detection (Chromium only) reads straight from the <video>
  // element — no canvas pixel readback involved at all. Preferred over the
  // jsQR/canvas fallback below whenever available: some hardened/privacy
  // browsers (e.g. GrapheneOS Vanadium, Firefox forks with resistFingerprinting-
  // style protections) deliberately poison or block canvas.getImageData() as
  // an anti-fingerprinting measure, which silently breaks jsQR decoding while
  // the camera preview itself keeps working fine — reported as "camera works
  // but QR is never recognized" (see github.com/musicguessr/musicguessr-frontend/issues/7).
  private barcodeDetector: InstanceType<NonNullable<Window['BarcodeDetector']>> | null = null;
  // Guards against overlapping detect() calls — unlike jsQR's synchronous
  // decode, BarcodeDetector.detect() is async and its latency isn't
  // guaranteed to stay under SCAN_INTERVAL.
  private detecting = false;
  // A signal (not a plain field) so the template can show/hide the "Try
  // again" button — kept so a resolve failure (e.g. the backend being
  // briefly unreachable) can be retried directly, without the only recovery
  // path being to re-scan the physical card for what's often just a
  // transient network blip.
  readonly lastScannedUrl = signal<string | null>(null);

  ngOnInit(): void {
    this.seo.set({ title: 'Scan QR Code', noindex: true });
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    void this.setupBarcodeDetector();
  }

  // Capability doesn't change mid-session, so this only needs to run once
  // (not per startScanner() call) — a no-op quietly leaves barcodeDetector
  // null and scan() falls back to jsQR.
  private async setupBarcodeDetector(): Promise<void> {
    const BarcodeDetectorCtor = window.BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      return;
    }
    try {
      const formats = await BarcodeDetectorCtor.getSupportedFormats();
      if (formats.includes('qr_code')) {
        this.barcodeDetector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      }
    } catch {
      // Present but throws (e.g. blocked by a permissions policy) — jsQR
      // fallback covers this the same as "not supported at all".
    }
  }

  ngOnDestroy(): void {
    this.stopScanner();
    this.clearLoadingMessageTimers();
  }

  async startScanner(): Promise<void> {
    if (this.scanning()) {
      return;
    }
    this.error.set(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Camera not available in this browser');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
          // focusMode isn't in the standard MediaTrackConstraints type (only
          // Chromium-based browsers implement it) — requesting it up front,
          // in addition to the applyConstraints() call below, is what
          // actually gets it honored on some Android camera stacks that
          // ignore a post-hoc constraint change on an already-running track.
          ...({ focusMode: { ideal: 'continuous' } } as MediaTrackConstraints),
        },
      });

      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();

      this.videoTrack = this.stream.getVideoTracks()[0] ?? null;
      await this.setupContinuousFocus();
      this.setupTorchSupport();

      this.scanning.set(true);
      this.timer = setInterval(() => this.scan(), SCAN_INTERVAL);
      this.scanStuckTimer = setTimeout(() => this.reportScanStuck(), SCAN_STUCK_MS);
    } catch {
      // getUserMedia may have already granted a stream before a later step
      // (e.g. video.play() rejecting) threw — release it here, otherwise the
      // camera stays on with no indicator that it's ever stopped, and the
      // next startScanner() call overwrites this.stream, orphaning it.
      this.stopScanner();
      this.error.set('Camera access denied. Please allow camera permissions.');
    }
  }

  // Not every device/browser reports focusMode in getCapabilities() (iOS
  // Safari never does), and some that do still throw on applyConstraints —
  // treat both as "can't help here" rather than surfacing an error, since
  // autofocus is a nice-to-have, not something scanning depends on.
  private async setupContinuousFocus(): Promise<void> {
    const track = this.videoTrack;
    if (!track?.getCapabilities) {
      return;
    }
    const caps = track.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
    if (!caps.focusMode?.includes('continuous')) {
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
    } catch {
      // Capability advertised but constraint rejected — ignore, camera keeps
      // whatever focus mode it started with.
    }
  }

  private setupTorchSupport(): void {
    const track = this.videoTrack;
    if (!track?.getCapabilities) {
      this.torchSupported.set(false);
      return;
    }
    const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
    this.torchSupported.set(!!caps.torch);
  }

  async toggleTorch(): Promise<void> {
    const track = this.videoTrack;
    if (!track || !this.torchSupported()) {
      return;
    }
    const next = !this.torchOn();
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      this.torchOn.set(next);
    } catch {
      this.error.set('Could not turn on the flash on this device.');
    }
  }

  stopScanner(): void {
    this.scanning.set(false);
    this.torchOn.set(false);
    this.torchSupported.set(false);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.scanStuckTimer) {
      clearTimeout(this.scanStuckTimer);
      this.scanStuckTimer = null;
    }
    if (this.stream) {
      // Torch turns off on its own once the track stops, but there's no
      // event for that — the signal reset above keeps UI state honest
      // without waiting on one.
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoTrack = null;
  }

  private reportScanStuck(): void {
    if (!this.scanning()) {
      return;
    }
    const detector = this.barcodeDetector ? 'BarcodeDetector' : 'jsQR';
    this.errorReporter.report({
      message: `QR not detected after ${SCAN_STUCK_MS / 1000}s of active scanning (detector=${detector})`,
      context: 'scanner-timeout',
    });
  }

  private scan(): void {
    const video = this.videoRef.nativeElement;
    if (video.readyState < 2) {
      return;
    }

    if (this.barcodeDetector) {
      this.scanWithBarcodeDetector(video);
      return;
    }

    this.scanWithJsQR(video);
  }

  private scanWithBarcodeDetector(video: HTMLVideoElement): void {
    if (this.detecting || !this.barcodeDetector) {
      return;
    }
    this.detecting = true;
    this.barcodeDetector
      .detect(video)
      .then((codes) => {
        this.detecting = false;
        // detect() is async and may resolve after stopScanner() already ran
        // (e.g. component destroyed, or the timer's next tick already found
        // a match via a still-in-flight earlier call) — don't act on a stale
        // result.
        if (!this.scanning()) {
          return;
        }
        const match = codes.find((c) => isHitsterCardUrl(c.rawValue));
        if (match) {
          this.stopScanner();
          this.onQRFound(match.rawValue);
        }
      })
      .catch(() => {
        this.detecting = false;
      });
  }

  private scanWithJsQR(video: HTMLVideoElement): void {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      return;
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(vw, vh));
    const w = Math.floor(vw * scale);
    const h = Math.floor(vh * scale);

    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(video, 0, 0, w, h);

    const imageData = this.ctx.getImageData(0, 0, w, h);
    const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });

    if (code && isHitsterCardUrl(code.data)) {
      this.stopScanner();
      this.onQRFound(code.data);
    }
  }

  retryResolve(): void {
    const url = this.lastScannedUrl();
    if (url) {
      this.onQRFound(url);
    }
  }

  private async onQRFound(url: string): Promise<void> {
    this.lastScannedUrl.set(url);
    this.loading.set(true);
    this.error.set(null);
    // A brand-new (uncached) card genuinely can take several seconds — the
    // backend fans out to multiple metadata providers and runs a live
    // YouTube search. A single static "Looking up track…" for the whole
    // wait reads as stuck/frozen past a couple of seconds; these keep
    // confirming something is still happening without over-promising a
    // specific duration. Cards scanned again are cached server-side and
    // resolve near-instantly, so this path is the uncommon, worst case one.
    this.loadingMessage.set('Looking up track…');
    this.loadingMessageTimers = [
      setTimeout(() => this.loadingMessage.set('Checking a few sources for the best match…'), 2500),
      setTimeout(() => this.loadingMessage.set('Still going — new cards can take a few seconds…'), 6000),
    ];
    try {
      const track = await this.hitster.resolve(url, this.state.ytVariants());
      this.state.clearCustomDeck();
      this.state.currentTrack.set(track);
      this.router.navigate(['/game']);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to resolve track');
    } finally {
      this.loading.set(false);
      this.clearLoadingMessageTimers();
    }
  }

  private clearLoadingMessageTimers(): void {
    this.loadingMessageTimers.forEach(clearTimeout);
    this.loadingMessageTimers = [];
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
