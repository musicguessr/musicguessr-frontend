import {
  Component, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import jsQR from 'jsqr';
import { HitsterService } from '../../services/hitster.service';
import { GameStateService } from '../../services/game-state.service';

const QR_PATTERN = /hitstergame\.com\/[^/]+\/([a-zA-Z0-9]+)\/(\d+)/;
const SCAN_INTERVAL = 250;
const MAX_DIMENSION = 600;

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [TitleCasePipe],
  templateUrl: './scanner.component.html',
  styleUrl: './scanner.component.scss'
})
export class ScannerComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;

  private router = inject(Router);
  private hitster = inject(HitsterService);
  private state = inject(GameStateService);

  readonly scanning = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly provider = this.state.provider;

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  ngOnInit(): void {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  ngOnDestroy(): void {
    this.stopScanner();
  }

  async startScanner(): Promise<void> {
    if (this.scanning()) {return;}
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
          height: { ideal: 1280 }
        }
      });

      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();

      this.scanning.set(true);
      this.timer = setInterval(() => this.scan(), SCAN_INTERVAL);
    } catch {
      this.error.set('Camera access denied. Please allow camera permissions.');
    }
  }

  stopScanner(): void {
    this.scanning.set(false);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  private scan(): void {
    const video = this.videoRef.nativeElement;
    if (video.readyState < 2) {return;}

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {return;}

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
      this.state.currentTrack.set(track);
      this.router.navigate(['/game']);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to resolve track');
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
