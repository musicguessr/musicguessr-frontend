// Shape Detection API — not yet in TS's DOM lib, and only implemented by
// Chromium. Declared the same way window.YT/window.Spotify are elsewhere in
// this codebase for other browser-only globals.
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): {
        detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
      };
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

export type BarcodeDetectorInstance = InstanceType<NonNullable<Window['BarcodeDetector']>>;

// Native QR detection (Chromium only) — no canvas pixel readback involved.
// Preferred whenever available: canvas.getImageData() is unusable for QR
// decoding on some hardened/privacy browsers (see webcodecs-qr.ts and
// github.com/musicguessr/musicguessr-frontend/issues/7). A no-op (returning
// null) quietly leaves the caller to fall back to WebCodecs/jsQR.
export async function setupBarcodeDetector(): Promise<BarcodeDetectorInstance | null> {
  const BarcodeDetectorCtor = window.BarcodeDetector;
  if (!BarcodeDetectorCtor) {
    return null;
  }
  try {
    const formats = await BarcodeDetectorCtor.getSupportedFormats();
    return formats.includes('qr_code') ? new BarcodeDetectorCtor({ formats: ['qr_code'] }) : null;
  } catch {
    // Present but throws (e.g. blocked by a permissions policy) — the same
    // as "not supported at all" to callers.
    return null;
  }
}
