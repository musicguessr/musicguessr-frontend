// jsdom (the test environment) doesn't implement WebCodecs at all, so
// webCodecsSupported must come back false there — this doubles as a
// regression check that the feature-detect doesn't throw in an environment
// without a global VideoFrame, which is exactly the failure mode a naive
// `window.VideoFrame` reference (without a `typeof` guard) would hit.
describe('webCodecsSupported', () => {
  it('is false in an environment without VideoFrame (e.g. jsdom, or SSR)', async () => {
    const { webCodecsSupported } = await import('./webcodecs-qr');
    expect(webCodecsSupported).toBe(false);
  });
});

describe('decodeQRViaWebCodecs', () => {
  // Minimal stand-in for the real VideoFrame — enough surface for
  // decodeQRViaWebCodecs to drive, with a spy on close() to verify it always
  // runs (frames are an explicitly resource-managed WebCodecs type; leaking
  // one every ~250ms would be a real, cumulative browser-resource leak, not
  // just untidy code).
  function installFakeVideoFrame(behavior: {
    displayWidth?: number;
    displayHeight?: number;
    copyTo?: (dest: Uint8ClampedArray) => Promise<unknown>;
  }): { closeSpy: jest.Mock } {
    const closeSpy = jest.fn();
    class FakeVideoFrame {
      displayWidth = behavior.displayWidth ?? 4;
      displayHeight = behavior.displayHeight ?? 4;
      allocationSize(): number {
        return this.displayWidth * this.displayHeight * 4;
      }
      copyTo(dest: Uint8ClampedArray): Promise<unknown> {
        return behavior.copyTo ? behavior.copyTo(dest) : Promise.resolve([]);
      }
      close = closeSpy;
    }
    (globalThis as unknown as { VideoFrame: unknown }).VideoFrame = FakeVideoFrame;
    return { closeSpy };
  }

  afterEach(() => {
    delete (globalThis as unknown as { VideoFrame?: unknown }).VideoFrame;
    jest.resetModules();
  });

  it('returns null when the frame decodes cleanly but contains no QR code', async () => {
    installFakeVideoFrame({});
    const { decodeQRViaWebCodecs } = await import('./webcodecs-qr');

    const result = await decodeQRViaWebCodecs({} as HTMLVideoElement);

    expect(result).toBeNull();
  });

  it('always closes the frame, even when copyTo rejects', async () => {
    const { closeSpy } = installFakeVideoFrame({
      copyTo: () => Promise.reject(new Error('format not supported')),
    });
    const { decodeQRViaWebCodecs } = await import('./webcodecs-qr');

    await expect(decodeQRViaWebCodecs({} as HTMLVideoElement)).rejects.toThrow('format not supported');
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects rather than returning null when the frame has zero dimensions', async () => {
    const { closeSpy } = installFakeVideoFrame({ displayWidth: 0, displayHeight: 0 });
    const { decodeQRViaWebCodecs } = await import('./webcodecs-qr');

    // A caller distinguishes "this tier doesn't work" (reject) from "it
    // worked and found nothing" (null) to decide whether to keep using it —
    // a frame with no dimensions is the former, not a clean negative result.
    await expect(decodeQRViaWebCodecs({} as HTMLVideoElement)).rejects.toThrow();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
