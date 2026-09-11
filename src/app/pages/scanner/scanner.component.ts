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

const QR_PATTERN = /hitstergame\.com\/[^/]+\/([a-zA-Z0-9]+)\/(\d+)/;
const SCAN_INTERVAL = 250;
const MAX_DIMENSION = 600;

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

  readonly scanning = signal(false);
  readonly loading = signal(false);
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
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  ngOnInit(): void {
    this.seo.set({ title: 'Scan QR Code', noindex: true });
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  ngOnDestroy(): void {
    this.stopScanner();
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
    } catch {
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
    if (this.stream) {
      // Torch turns off on its own once the track stops, but there's no
      // event for that — the signal reset above keeps UI state honest
      // without waiting on one.
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoTrack = null;
  }

  private scan(): void {
    const video = this.videoRef.nativeElement;
    if (video.readyState < 2) {
      return;
    }

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

    if (code && QR_PATTERN.test(code.data)) {
      this.stopScanner();
      this.onQRFound(code.data);
    }
  }

  private async onQRFound(url: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const track = await this.hitster.resolve(url, this.state.ytVariants());
      this.state.clearCustomDeck();
      this.state.currentTrack.set(track);
      this.router.navigate(['/game']);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to resolve track');
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
