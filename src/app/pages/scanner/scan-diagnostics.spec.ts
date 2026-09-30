import {
  cameraErrorReport,
  describeRejected,
  resolveFailedReport,
  ScanDiagnostics,
  ScanExtra,
} from './scan-diagnostics';

const extra: ScanExtra = { detector: 'jsQR', torchOn: false, webCodecsBroken: false };

function fakeVideo(w = 720, h = 1280): HTMLVideoElement {
  return { videoWidth: w, videoHeight: h } as HTMLVideoElement;
}

function fakeTrack(): MediaStreamTrack {
  return {
    label: 'Back Ultra Wide Camera',
    getSettings: () => ({ frameRate: 29.97, facingMode: 'environment', zoom: 1 }),
    getCapabilities: () => ({ focusMode: ['manual', 'continuous'], torch: true }),
  } as unknown as MediaStreamTrack;
}

describe('describeRejected', () => {
  it('keeps a hitstergame URL whole, since it is public and is what a maintainer needs to see', () => {
    expect(describeRejected('https://www.hitstergame.com/en/aaaa0097/00308/extra')).toBe(
      'https://www.hitstergame.com/en/aaaa0097/00308/extra',
    );
    expect(describeRejected('HITSTERGAME.com/xx?weird')).toBe('HITSTERGAME.com/xx?weird');
  });

  it('truncates a very long hitster string', () => {
    expect(describeRejected('hitster' + 'x'.repeat(500)).length).toBe(120);
  });

  it('reduces other web links to the host only, dropping path and query', () => {
    expect(describeRejected('https://example.com/private/path?token=secret')).toBe('example.com');
  });

  it('reduces non-web schemes to the scheme, never the content', () => {
    expect(describeRejected('WIFI:S:HomeNet;T:WPA;P:hunter2;;')).toBe('wifi:');
    expect(describeRejected('mailto:someone@example.com')).toBe('mailto:');
  });

  it('labels anything that is not a URL as text, never echoing it', () => {
    expect(describeRejected('just some words 12345')).toBe('text');
  });
});

describe('ScanDiagnostics', () => {
  it('reports camera facts, frame size and loop stats in a snapshot', () => {
    const d = new ScanDiagnostics();
    d.begin(fakeVideo(), fakeTrack(), false);
    for (let i = 0; i < 8; i++) {
      d.tick();
    }
    d.attempt(600, 40);
    d.attempt(800, 120);
    d.attempt(600, 20);

    const s = d.snapshot(extra);
    expect(s).toMatchObject({
      video_w: 720,
      video_h: 1280,
      cam_fps: 30,
      cam_facing: 'environment',
      cam_label: 'Back Ultra Wide Camera',
      cam_focus_continuous: true,
      cam_torch: true,
      canvas_poisoned: false,
      detector: 'jsQR',
      ticks: 8,
      js_attempts: 3,
      js_avg_ms: 60,
      js_max_ms: 120,
      js_n_600: 2,
      js_n_800: 1,
      torch_on: false,
      webcodecs_broken: false,
      rejected_count: 0,
      starts: 1,
    });
    expect(s['rejected_last']).toBeUndefined();
  });

  it('omits jsQR stats when jsQR never ran (BarcodeDetector sessions)', () => {
    const d = new ScanDiagnostics();
    d.begin(fakeVideo(), null, false);
    const s = d.snapshot({ ...extra, detector: 'BarcodeDetector' });
    expect(s['js_attempts']).toBeUndefined();
    expect(s['detector']).toBe('BarcodeDetector');
  });

  it('counts rejected QR codes and keeps the latest description', () => {
    const d = new ScanDiagnostics();
    d.begin(fakeVideo(), null, false);
    d.rejected('https://example.com/a');
    d.rejected('https://www.hitstergame.com/en/bad');
    const s = d.snapshot(extra);
    expect(s['rejected_count']).toBe(2);
    expect(s['rejected_last']).toBe('https://www.hitstergame.com/en/bad');
  });

  it('resets per-session counters on begin() but remembers starts and timeouts across restarts', () => {
    const d = new ScanDiagnostics();
    d.begin(fakeVideo(), null, false);
    d.tick();
    d.attempt(600, 10);
    d.stuckReport(10, extra);
    d.begin(fakeVideo(), null, false);

    const s = d.snapshot(extra);
    expect(s['ticks']).toBe(0);
    expect(s['js_attempts']).toBeUndefined();
    expect(s['starts']).toBe(2);
    expect(s['timeouts']).toBe(1);
  });

  it('keeps the timeout message format that existing log queries rely on', () => {
    const d = new ScanDiagnostics();
    d.begin(fakeVideo(), null, false);
    const r = d.stuckReport(10, { ...extra, detector: 'WebCodecs' });
    expect(r.message).toBe('QR not detected after 10s of active scanning (detector=WebCodecs)');
    expect(r.context).toBe('scanner-timeout');
    expect(r.level).toBeUndefined();
    expect(r.details?.['detector']).toBe('WebCodecs');
  });

  it('sends a successful scan as an info event with its time to scan', () => {
    const d = new ScanDiagnostics();
    d.begin(fakeVideo(), null, false);
    const r = d.successReport(extra);
    expect(r).toMatchObject({ context: 'scanner-success', level: 'info' });
    expect(typeof r.details?.['time_to_scan_ms']).toBe('number');
  });

  it('never throws on a track whose getSettings/getCapabilities misbehave', () => {
    const bad = {
      label: '',
      getSettings: () => {
        throw new Error('nope');
      },
    } as unknown as MediaStreamTrack;
    const d = new ScanDiagnostics();
    expect(() => d.begin(fakeVideo(), bad, false)).not.toThrow();
    expect(d.snapshot(extra)['video_w']).toBe(720);
  });

  it('only emits details the backend will keep: flat string/number/boolean values with snake_case keys', () => {
    const d = new ScanDiagnostics();
    d.begin(fakeVideo(), fakeTrack(), false);
    d.attempt(600, 12);
    d.rejected('https://example.com');
    for (const [k, v] of Object.entries(d.snapshot(extra))) {
      expect(k).toMatch(/^[a-z0-9_]{1,40}$/);
      expect(['string', 'number', 'boolean']).toContain(typeof v);
      if (typeof v === 'string') {
        expect(v.length).toBeLessThanOrEqual(160);
      }
    }
  });
});

describe('error reports', () => {
  it('names the camera failure without leaking more than the error itself', () => {
    const e = new DOMException('Permission denied', 'NotAllowedError');
    expect(cameraErrorReport(e)).toEqual({
      message: 'Camera could not start (NotAllowedError)',
      context: 'scanner-camera-error',
      details: { error_name: 'NotAllowedError', error_message: 'Permission denied' },
    });
  });

  it('records the HTTP status of a failed lookup, and -1 when there is none', () => {
    expect(resolveFailedReport(new Error('x', { cause: { status: 0 } })).details).toEqual({ http_status: 0 });
    expect(resolveFailedReport(new Error('x', { cause: { status: 503 } })).details).toEqual({ http_status: 503 });
    expect(resolveFailedReport(new Error('x')).details).toEqual({ http_status: -1 });
  });
});
