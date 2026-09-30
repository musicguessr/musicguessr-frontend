import jsQR from 'jsqr';

// One scan attempt per tick, cycling through these: [longest canvas side in
// px, whether to also try an inverted image]. A single fixed downscale is one
// of the weakest choices, because jsQR's success isn't monotonic in
// resolution: it needs a few pixels per module (a card held at arm's length
// is ~3-5 px/module at 600px, so it is marginal), but the largest frames
// decode worst too (sensor noise breaks its local thresholding). Each scale
// fails on different frames, and a live camera supplies a slightly different
// frame every tick, so varying the scale finds a code sooner.
//
// Measured on 18 synthetic 720x1280 frames (code 15-55% of the width, three
// blur levels, sensor noise): 600px alone decoded 9, cycling these three 14;
// under the harshest (nearest-neighbour) downscale 4 vs 6. 800/1024 skip the
// inverted pass, which halves a failed attempt's cost (worst case ~260ms vs
// ~500ms) — Hitster codes are dark on light, and 600 still covers inverted.
export const JSQR_PLAN: readonly { maxSide: number; invert: boolean }[] = [
  { maxSide: 600, invert: true },
  { maxSide: 800, invert: false },
  { maxSide: 1024, invert: false },
];

export function planForTick(tick: number): { maxSide: number; invert: boolean } {
  return JSQR_PLAN[tick % JSQR_PLAN.length];
}

export function scaledSize(videoWidth: number, videoHeight: number, maxSide: number): { w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(videoWidth, videoHeight));
  return { w: Math.floor(videoWidth * scale), h: Math.floor(videoHeight * scale) };
}

/** Draws the current video frame at this tick's scale and runs jsQR on it. */
export function decodeFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  tick: number,
): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return null;
  }
  const { maxSide, invert } = planForTick(tick);
  const { w, h } = scaledSize(vw, vh, maxSide);
  if (w === 0 || h === 0) {
    return null;
  }

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const code = jsQR(imageData.data, w, h, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' });
  return code ? code.data : null;
}
