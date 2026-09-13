// Draws one known-color pixel and reads it straight back — a normal canvas
// returns exactly what was drawn, resistFingerprinting-style noise (Firefox,
// and hardened forks that inherit it — see webcodecs-qr.ts,
// github.com/musicguessr/musicguessr-frontend/issues/7) won't. Cheap and
// synchronous, so callers can run it unconditionally rather than waiting for
// a real scan attempt to fail first.
export function detectCanvasPoisoning(): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext('2d');
    if (!ctx) {
      return false;
    }
    ctx.fillStyle = 'rgb(12, 34, 56)';
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return r !== 12 || g !== 34 || b !== 56;
  } catch {
    // Not the noise case this checks for — a thrown getImageData is a
    // different, unrelated failure.
    return false;
  }
}
