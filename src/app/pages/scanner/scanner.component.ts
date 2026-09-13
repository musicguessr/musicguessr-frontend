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
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { localizedPath } from '../../i18n/locale';
import { decodeQRViaWebCodecs, webCodecsSupported } from './webcodecs-qr';
import { detectCanvasPoisoning } from './canvas-poisoning';
import { BarcodeDetectorInstance, setupBarcodeDetector } from './barcode-detector';

const SCAN_INTERVAL = 250;
const MAX_DIMENSION = 600;
const SCAN_STUCK_MS = 10_000;

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [TitleCasePipe, LanguageSwitcherComponent],
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
  i18n = inject(TranslationService);

  readonly scanning = signal(false);
  readonly loading = signal(false);
  readonly loadingMessage = signal('');
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
  // nothing found — camera permission was granted and frames are flowing,
  // so a QR genuinely in frame that never decodes points at the detector
  // itself failing silently (see the BarcodeDetector comment above).
  private scanStuckTimer: ReturnType<typeof setTimeout> | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private loadingMessageTimers: ReturnType<typeof setTimeout>[] = [];
  // See barcode-detector.ts — preferred detection tier whenever available.
  private barcodeDetector: BarcodeDetectorInstance | null = null;
  // Guards overlapping async detect()/decode calls (BarcodeDetector and
  // WebCodecs below) — shared, the two are mutually exclusive in practice.
  private detecting = false;
  // Set once decodeQRViaWebCodecs() fails — stops retrying a broken API
  // every SCAN_INTERVAL and falls back to canvas/jsQR. See webcodecs-qr.ts.
  private webCodecsBroken = false;
  // See canvas-poisoning.ts — jsQR can never decode when true, so scan()
  // skips straight to an error instead of spinning silently.
  private canvasPoisoned = false;
  // Shown under the scan frame after SCAN_STUCK_MS (used to be telemetry-only).
  readonly stuckHint = signal(false);
  // A signal (not a plain field) so the template can show/hide the "Try
  // again" button — kept so a resolve failure (e.g. the backend being
  // briefly unreachable) can be retried directly, without the only recovery
  // path being to re-scan the physical card for what's often just a
  // transient network blip.
  readonly lastScannedUrl = signal<string | null>(null);

  ngOnInit(): void {
    this.seo.set({ title: this.i18n.t('scanner.seoTitle'), noindex: true });
    this.loadingMessage.set(this.i18n.t('scanner.loadingLookingUp'));
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.canvasPoisoned = detectCanvasPoisoning();
    void setupBarcodeDetector().then((detector) => {
      this.barcodeDetector = detector;
    });
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
    this.stuckHint.set(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(this.i18n.t('scanner.errCameraUnavailable'));
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
      this.error.set(this.i18n.t('scanner.errCameraDenied'));
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
      this.error.set(this.i18n.t('scanner.errTorch'));
    }
  }

  stopScanner(): void {
    this.scanning.set(false);
    this.torchOn.set(false);
    this.torchSupported.set(false);
    this.stuckHint.set(false);
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
    this.stuckHint.set(true);
    const detector = this.barcodeDetector
      ? 'BarcodeDetector'
      : webCodecsSupported && !this.webCodecsBroken
        ? 'WebCodecs'
        : 'jsQR';
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

    if (webCodecsSupported && !this.webCodecsBroken) {
      this.scanWithWebCodecs(video);
      return;
    }

    if (this.canvasPoisoned) {
      // jsQR would spin forever here — surface it now instead of after
      // SCAN_STUCK_MS of silent, doomed attempts.
      this.stopScanner();
      this.error.set(this.i18n.t('scanner.errCanvasBlocked'));
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

  private scanWithWebCodecs(video: HTMLVideoElement): void {
    if (this.detecting) {
      return;
    }
    this.detecting = true;
    decodeQRViaWebCodecs(video)
      .then((data) => {
        this.detecting = false;
        // Async — may resolve after stopScanner() already ran, same as above.
        if (this.scanning() && data && isHitsterCardUrl(data)) {
          this.stopScanner();
          this.onQRFound(data);
        }
      })
      .catch(() => {
        // Not usable in this browser/session — stop retrying every tick and
        // fall back to canvas/jsQR.
        this.detecting = false;
        this.webCodecsBroken = true;
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
    this.loadingMessage.set(this.i18n.t('scanner.loadingLookingUp'));
    this.loadingMessageTimers = [
      setTimeout(() => this.loadingMessage.set(this.i18n.t('scanner.loadingCheckingSources')), 2500),
      setTimeout(() => this.loadingMessage.set(this.i18n.t('scanner.loadingStillGoing')), 6000),
    ];
    try {
      const track = await this.hitster.resolve(url, this.state.ytVariants());
      this.state.clearCustomDeck();
      this.state.currentTrack.set(track);
      this.router.navigateByUrl(localizedPath(this.i18n.locale(), '/game'));
    } catch (e: any) {
      this.error.set(e.message || this.i18n.t('scanner.errFailedToResolve'));
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
    this.router.navigateByUrl(localizedPath(this.i18n.locale(), '/'));
  }
}
