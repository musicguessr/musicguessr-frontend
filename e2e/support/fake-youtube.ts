import type { Page } from '@playwright/test';

// Stub for https://www.youtube.com/iframe_api matching the surface
// youtube-player.service.ts actually calls (see its events.onReady /
// onStateChange / onError and player.loadVideoById / stopVideo / destroy /
// unMute). Keeps the game-flow test hermetic — no dependency on youtube.com
// actually being reachable or embeddable from CI, and no real network call.
const FAKE_YT_API_JS = `
  function FakePlayer(containerId, config) {
    this.config = config || {};
    setTimeout(() => {
      if (this.config.events && this.config.events.onReady) {
        this.config.events.onReady({ target: this });
      }
    }, 0);
  }
  FakePlayer.prototype.loadVideoById = function () {
    if (this.config.events && this.config.events.onStateChange) {
      this.config.events.onStateChange({ data: 1 });
    }
  };
  FakePlayer.prototype.stopVideo = function () {};
  FakePlayer.prototype.destroy = function () {};
  FakePlayer.prototype.unMute = function () {};

  window.YT = { Player: FakePlayer };
  if (typeof window.onYouTubeIframeAPIReady === 'function') {
    window.onYouTubeIframeAPIReady();
  }
`;

export async function stubYouTubeIframeApi(page: Page): Promise<void> {
  await page.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FAKE_YT_API_JS }),
  );
}
