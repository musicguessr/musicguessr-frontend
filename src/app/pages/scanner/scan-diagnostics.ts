import { ClientErrorReport } from '../../services/client-error-reporter.service';

export type ScanDetails = Record<string, string | number | boolean>;

// Values the component knows and this module doesn't.
export type ScanExtra = { detector: string; torchOn: boolean; webCodecsBroken: boolean };

// What we can tell from a QR that decoded but isn't a card, without keeping
// anything private. A hitstergame URL in a shape isHitsterCardUrl rejects (a new edition
// or an unexpected path) is public and the single most useful thing to see, so
// it is kept whole; anything else is reduced to its host or scheme.
export function describeRejected(raw: string): string {
  if (/hitster/i.test(raw)) {
    return raw.slice(0, 120);
  }
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.slice(0, 80) : u.protocol;
  } catch {
    return 'text';
  }
}

// Measurements for one scanning session, turned into the `details` of the
// scanner's client reports. The "QR not detected after 10s" report alone can't
// tell a camera that never focuses from a scan loop that barely runs, a frame
// that's too small, or a person pointing at the wrong code; these can.
export class ScanDiagnostics {
  private startedAt = 0;
  private ticks = 0;
  private attempts = 0;
  private attemptMs = 0;
  private attemptMaxMs = 0;
  private perScale = new Map<number, number>();
  private rejectedCount = 0;
  private rejectedLast = '';
  private camera: ScanDetails = {};
  // Survive across scanner restarts within one page view, so a person who
  // keeps retrying shows up as such.
  private starts = 0;
  private timeouts = 0;

  /** A new scanning session just started; the camera is live. */
  begin(video: HTMLVideoElement, track: MediaStreamTrack | null, canvasPoisoned: boolean): void {
    this.startedAt = performance.now();
    this.ticks = 0;
    this.attempts = 0;
    this.attemptMs = 0;
    this.attemptMaxMs = 0;
    this.perScale.clear();
    this.rejectedCount = 0;
    this.rejectedLast = '';
    this.starts++;
    this.camera = cameraDetails(video, track, canvasPoisoned);
  }

  /** The scan loop ran once with a frame available. */
  tick(): void {
    this.ticks++;
  }

  /** One jsQR decode attempt at the given scale took `ms`. */
  attempt(maxSide: number, ms: number): void {
    this.attempts++;
    this.attemptMs += ms;
    this.attemptMaxMs = Math.max(this.attemptMaxMs, ms);
    this.perScale.set(maxSide, (this.perScale.get(maxSide) ?? 0) + 1);
  }

  /** A QR decoded but wasn't a Hitster card. */
  rejected(raw: string): void {
    this.rejectedCount++;
    this.rejectedLast = describeRejected(raw);
  }

  elapsedMs(): number {
    return this.startedAt ? Math.round(performance.now() - this.startedAt) : 0;
  }

  snapshot(extra: ScanExtra): ScanDetails {
    const elapsed = this.elapsedMs();
    const d: ScanDetails = {
      ...this.camera,
      detector: extra.detector,
      elapsed_ms: elapsed,
      ticks: this.ticks,
      // How often the loop really ran (it's meant to be 4/s). Far below that
      // means the page or device is too slow, not that the code is unreadable.
      ticks_per_s: elapsed > 0 ? Math.round((this.ticks / elapsed) * 10000) / 10 : 0,
      torch_on: extra.torchOn,
      webcodecs_broken: extra.webCodecsBroken,
      visibility: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      starts: this.starts,
      timeouts: this.timeouts,
      rejected_count: this.rejectedCount,
    };
    if (this.rejectedLast) {
      d['rejected_last'] = this.rejectedLast;
    }
    if (this.attempts > 0) {
      d['js_attempts'] = this.attempts;
      d['js_avg_ms'] = Math.round(this.attemptMs / this.attempts);
      d['js_max_ms'] = Math.round(this.attemptMaxMs);
      for (const [side, n] of this.perScale) {
        d[`js_n_${side}`] = n;
      }
    }
    return d;
  }

  stuckReport(seconds: number, extra: ScanExtra): ClientErrorReport {
    this.timeouts++;
    return {
      // The message format is unchanged, so existing queries still match.
      message: `QR not detected after ${seconds}s of active scanning (detector=${extra.detector})`,
      context: 'scanner-timeout',
      details: this.snapshot(extra),
    };
  }

  /** A card was found; sent as an event so timeouts can be read as a rate. */
  successReport(extra: ScanExtra): ClientErrorReport {
    return {
      message: 'QR decoded',
      context: 'scanner-success',
      level: 'info',
      details: { ...this.snapshot(extra), time_to_scan_ms: this.elapsedMs() },
    };
  }
}

function cameraDetails(video: HTMLVideoElement, track: MediaStreamTrack | null, canvasPoisoned: boolean): ScanDetails {
  const d: ScanDetails = {
    video_w: video.videoWidth,
    video_h: video.videoHeight,
    canvas_poisoned: canvasPoisoned,
    dpr: typeof window !== 'undefined' ? Math.round(window.devicePixelRatio * 100) / 100 : 0,
  };
  try {
    const s = track?.getSettings?.();
    if (s) {
      if (s.frameRate) {
        d['cam_fps'] = Math.round(s.frameRate);
      }
      if (s.facingMode) {
        d['cam_facing'] = s.facingMode;
      }
      const zoom = (s as MediaTrackSettings & { zoom?: number }).zoom;
      if (zoom) {
        d['cam_zoom'] = zoom;
      }
    }
    // Camera name, e.g. "Back Ultra Wide Camera" vs "Back Camera": a wide lens
    // can't focus on a card held close, a common cause on iPhones.
    if (track?.label) {
      d['cam_label'] = track.label.slice(0, 80);
    }
    const caps = track?.getCapabilities?.() as
      (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean }) | undefined;
    if (caps) {
      d['cam_focus_continuous'] = !!caps.focusMode?.includes('continuous');
      d['cam_torch'] = !!caps.torch;
    }
  } catch {
    // Diagnostics must never break scanning.
  }
  return d;
}

export function cameraErrorReport(e: unknown): ClientErrorReport {
  const name = e instanceof Error ? e.name : typeof e;
  return {
    message: `Camera could not start (${name})`,
    context: 'scanner-camera-error',
    details: {
      error_name: name.slice(0, 40),
      error_message: (e instanceof Error ? e.message : String(e)).slice(0, 120),
    },
  };
}

export function resolveFailedReport(e: unknown): ClientErrorReport {
  // HitsterService wraps the HttpErrorResponse as `cause`; status 0 is a
  // network failure that never reached the backend (so no backend log exists).
  const status = (e as { cause?: { status?: number } })?.cause?.status;
  return {
    message: 'Card lookup failed after a successful scan',
    context: 'scanner-resolve-failed',
    details: { http_status: typeof status === 'number' ? status : -1 },
  };
}
