import { YoutubePlayerService } from '../../services/youtube-player.service';
import { SpotifyService } from '../../services/spotify.service';
import { AppleMusicService } from '../../services/apple-music.service';
import { Provider, TrackInfo } from '../../services/game-state.service';

export type PreparePlayerResult = { ready: boolean; error: string | null };

export type PreparePlayerServices = {
  ytPlayer: YoutubePlayerService;
  spotify: SpotifyService;
  apple: AppleMusicService;
};

// Initializes whichever provider's player/SDK is active so onOverlayTap()'s
// play call can be synchronous — see CLAUDE.md's iOS Safari autoplay
// section. Pulled out of GameComponent as its own function since this is
// the one piece of per-provider branching substantial enough to be worth
// reading in isolation from the rest of the component's UI-state plumbing.
// Split one-per-provider below to keep each branch's own complexity low.
export async function preparePlayerFor(
  provider: Provider,
  ytId: string | null,
  track: TrackInfo | null,
  services: PreparePlayerServices,
): Promise<PreparePlayerResult> {
  const { ytPlayer, spotify, apple } = services;

  if (provider === 'youtube') {
    return prepareYoutube(ytPlayer, ytId, track);
  }
  if (provider === 'spotify') {
    return prepareSpotify(spotify, track);
  }
  if (provider === 'apple') {
    return prepareApple(apple, track);
  }
  return { ready: false, error: null };
}

async function prepareYoutube(
  ytPlayer: YoutubePlayerService,
  ytId: string | null,
  track: TrackInfo | null,
): Promise<PreparePlayerResult> {
  // Clear any error left over from a previous card so a stale message
  // doesn't leak into this one via the ytPlayer.error() effect.
  ytPlayer.error.set(null);
  ytPlayer.setRequestId(track?.request_id ?? null);
  if (!ytId) {
    return { ready: true, error: 'No YouTube video available for this card' };
  }
  try {
    await ytPlayer.loadAPI();
    // Pre-create the player so loadVideoById() in the tap handler is called
    // on a ready player — required for iOS Safari autoplay.
    await ytPlayer.preloadPlayer();
    return { ready: true, error: null };
  } catch (e: any) {
    // loadAPI() now surfaces a specific, actionable message (e.g. "may be
    // blocked by a browser extension") rather than always this generic
    // fallback — see its own comment for why that timeout exists.
    return { ready: true, error: e?.message || 'Failed to load YouTube player' };
  }
}

async function prepareSpotify(spotify: SpotifyService, track: TrackInfo | null): Promise<PreparePlayerResult> {
  spotify.error.set(null);
  spotify.setRequestId(track?.request_id ?? null);
  try {
    await spotify.initSDK();
    return { ready: true, error: null };
  } catch (e: any) {
    const message: string = e?.message ?? '';
    if (message.includes('not supported')) {
      // Web Playback SDK unavailable — always the case on iOS Safari
      // (WebKit blocks the Web Audio API it needs). Don't dead-end into
      // overlayError's "open externally" path: let the tap go through
      // normally, spotify.play() falls back to Spotify Connect (handing
      // playback to the user's phone app) instead.
      return { ready: true, error: null };
    }
    return { ready: true, error: message || 'Spotify failed to initialize' };
  }
}

async function prepareApple(apple: AppleMusicService, track: TrackInfo | null): Promise<PreparePlayerResult> {
  apple.error.set(null);
  try {
    await apple.init();
    // Pre-load the track queue so play() in the tap handler has no async
    // work before music.play() — required for iOS Safari autoplay.
    if (track?.artist && track?.title) {
      await apple.preloadTrack(track.artist, track.title);
    }
    return { ready: true, error: null };
  } catch (e: any) {
    return { ready: true, error: e?.message || 'Apple Music failed to initialize' };
  }
}
