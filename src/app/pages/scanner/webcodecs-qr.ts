import jsQR from 'jsqr';

// Attempts to decode a QR code straight from the camera's frame pipeline via
// WebCodecs' VideoFrame, rather than through a 2D canvas.
//
// This exists because canvas.getImageData() is not a viable QR-decode path
// at all on Firefox with resistFingerprinting enabled: confirmed (not
// assumed) that mode returns fully randomized pixel data on every single
// read, unconditionally — it isn't a permission gate you can prompt past,
// it's noise by design, so jsQR/BarcodeDetector-on-canvas can never decode
// anything there (github.com/musicguessr/musicguessr-frontend/issues/7).
// VideoFrame is a different, newer API that reads the frame directly rather
// than through canvas readback, so it isn't covered by that protection.
//
// Unconfirmed whether this actually fixes the reported case: WebCodecs
// mobile support trails desktop, and there's no way to test against the
// affected device directly. Callers should treat this as a best-effort extra
// tier ahead of the existing canvas/jsQR path — any failure (unsupported,
// format refused, etc.) should fall straight through to canvas exactly as
// before this existed, so a browser this doesn't help is no worse off.
export const webCodecsSupported = typeof VideoFrame === 'function';

// Rejects (doesn't just return null) on anything that means this tier isn't
// usable right now — an unreadable video element, an unsupported pixel
// format, the browser refusing the copy — so the caller can tell "this
// didn't work, stop trying it" apart from "it worked and found nothing".
export async function decodeQRViaWebCodecs(video: HTMLVideoElement): Promise<string | null> {
  let frame: VideoFrame | undefined;
  try {
    frame = new VideoFrame(video, { timestamp: performance.now() });
    const { displayWidth: width, displayHeight: height } = frame;
    if (!width || !height) {
      throw new Error('VideoFrame reported zero dimensions');
    }
    const buffer = new Uint8ClampedArray(frame.allocationSize({ format: 'RGBA' }));
    await frame.copyTo(buffer, { format: 'RGBA' });
    const code = jsQR(buffer, width, height, { inversionAttempts: 'attemptBoth' });
    return code?.data ?? null;
  } finally {
    frame?.close();
  }
}
