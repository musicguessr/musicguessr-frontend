import { expect, test } from '@playwright/test';

// Verifies the actual premise behind the scanner's WebCodecs tier
// (src/app/pages/scanner/webcodecs-qr.ts): that canvas.getImageData() is
// genuinely unusable for QR decoding under Firefox's resistFingerprinting
// (privacy.resistFingerprinting), which the "firefox-rfp" project in
// playwright.config.ts enables for real, not as a mock.
//
// This draws a known, solid color into a canvas and reads it straight back —
// no video, no camera, no QR involved, so it isolates exactly the primitive
// jsQR/BarcodeDetector-on-canvas ultimately depend on. A decoder needs
// pixels that reflect what was actually drawn; this proves whether that
// holds at all, in each engine this suite runs against.
test('canvas readback reflects what was actually drawn', async ({ page }, testInfo) => {
  await page.goto('/');

  const pixel = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(10, 20, 30)';
    ctx.fillRect(0, 0, 4, 4);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2]];
  });

  if (testInfo.project.name === 'firefox-rfp') {
    // The whole point of resistFingerprinting: readback must NOT match what
    // was drawn. If this ever starts passing, Firefox changed its noise
    // injection (or the pref stopped applying) and webcodecs-qr.ts's reason
    // for existing needs re-checking.
    expect(pixel).not.toEqual([10, 20, 30]);
  } else {
    expect(pixel).toEqual([10, 20, 30]);
  }
});
