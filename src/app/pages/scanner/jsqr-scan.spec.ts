import { JSQR_PLAN, planForTick, scaledSize } from './jsqr-scan';

describe('jsqr-scan', () => {
  it('cycles through every scale in order, one per tick', () => {
    const sides = Array.from({ length: JSQR_PLAN.length * 2 }, (_, i) => planForTick(i).maxSide);
    expect(sides).toEqual([600, 800, 1024, 600, 800, 1024]);
  });

  it('keeps the original 600px inverted-and-normal pass in the cycle', () => {
    // The scale this scanner always used must stay in the plan, so cycling can
    // only ever add ways to find a code, never remove one.
    expect(JSQR_PLAN).toContainEqual({ maxSide: 600, invert: true });
  });

  it('only the cheap scale pays for the inverted pass', () => {
    expect(JSQR_PLAN.filter((p) => p.invert).map((p) => p.maxSide)).toEqual([600]);
  });

  it('scales the longest side down to maxSide, keeping aspect ratio', () => {
    expect(scaledSize(720, 1280, 600)).toEqual({ w: 337, h: 600 });
    expect(scaledSize(1280, 720, 1024)).toEqual({ w: 1024, h: 576 });
  });

  it('never upscales a frame smaller than maxSide', () => {
    expect(scaledSize(640, 480, 1024)).toEqual({ w: 640, h: 480 });
  });
});
