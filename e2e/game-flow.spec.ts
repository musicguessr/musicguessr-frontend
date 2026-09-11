import { expect, test } from '@playwright/test';
import { stubYouTubeIframeApi } from './support/fake-youtube';

// Exercises the single most important flow in the app (see CLAUDE.md's "iOS
// Safari autoplay" section): TAP TO PLAY overlay -> synchronous play call ->
// blurred card -> reveal. It seeds localStorage with a resolved track
// directly (the same shape /api/resolve returns and game-state.service
// persists) rather than driving a real camera + QR decode, which needs
// hardware and isn't meaningfully testable headlessly — this test's job is
// to catch the game screen itself silently breaking, not to re-test the
// scanner (see scanner.spec.ts for that).
const FAKE_TRACK = {
  spotify_id: 'abc123',
  spotify_url: 'https://open.spotify.com/track/abc123',
  artist: 'Test Artist',
  title: 'Test Title',
  year: 1999,
  artwork_url: '',
  youtube_video_id: 'dQw4w9WgXcQ',
  links: { youtube: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
};

test('golden path: tap to play then reveal shows the track', async ({ page }) => {
  await stubYouTubeIframeApi(page);

  await page.addInitScript(
    (state: { provider: string; track: typeof FAKE_TRACK }) => {
      localStorage.setItem('oh_provider', state.provider);
      localStorage.setItem('oh_current_track', JSON.stringify(state.track));
    },
    { provider: 'youtube', track: FAKE_TRACK },
  );

  await page.goto('/game');

  const overlay = page.locator('.play-overlay');
  await expect(overlay).toHaveClass(/visible/);
  await expect(page.locator('.play-label')).toHaveText('TAP TO PLAY');

  await overlay.click();
  await expect(overlay).not.toHaveClass(/visible/);

  // Card is blurred until revealed.
  await expect(page.locator('.track-title')).toHaveClass(/blurred/);
  await expect(page.locator('.year-value')).toHaveClass(/blurred/);

  await page.getByRole('button', { name: 'TAP TO REVEAL' }).click();

  await expect(page.locator('.track-title')).not.toHaveClass(/blurred/);
  await expect(page.locator('.track-title')).toHaveText('Test Title');
  await expect(page.locator('.track-artist')).toHaveText('Test Artist');
  await expect(page.locator('.year-value')).toHaveText('1999');

  // Streaming links only render once revealed and only for known providers —
  // FAKE_TRACK's youtube link should produce one.
  await expect(page.locator('.stream-btn--youtube')).toBeVisible();
});

test('a card with no error stays on TAP TO PLAY, not a stuck spinner', async ({ page }) => {
  await stubYouTubeIframeApi(page);
  await page.addInitScript(
    (state: { provider: string; track: typeof FAKE_TRACK }) => {
      localStorage.setItem('oh_provider', state.provider);
      localStorage.setItem('oh_current_track', JSON.stringify(state.track));
    },
    { provider: 'youtube', track: FAKE_TRACK },
  );

  await page.goto('/game');

  // preparePlayer() is async (loadAPI + preloadPlayer) — this asserts it
  // actually resolves to the ready state instead of leaving the overlay
  // spinning forever, which is exactly the class of bug a stub-free unit
  // test can't observe.
  await expect(page.locator('.play-label')).toHaveText('TAP TO PLAY', { timeout: 10_000 });
  await expect(page.locator('.play-circle')).toHaveClass(/ready/);
});
