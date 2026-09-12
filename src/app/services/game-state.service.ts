import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Deck, DeckCard } from './deck.service';

export type Provider = 'youtube' | 'spotify' | 'apple' | null;
export type VideoBlur = 'hidden' | 'blurred' | 'visible';

export type TrackInfo = {
  // Not guaranteed by the backend at runtime — a card may have no Spotify match.
  spotify_id?: string;
  spotify_url?: string;
  artist?: string;
  title?: string;
  year?: number;
  artwork_url?: string;
  youtube_video_id?: string;
  links: Record<string, string>;
  // Opaque per-request ID the backend generates for every /api/resolve call
  // (see internal/requestid) — surfaced so an error report about this card
  // can be tied straight back to that request's own server-side log line.
  request_id?: string;
};

export type CustomDeckState = {
  deckId: string;
  deck: Deck;
  shuffleOrder: number[];
  currentIndex: number;
};

const DEFAULT_VIDEO_BLUR: VideoBlur = 'hidden';
const DEFAULT_YT_VARIANTS = true;

// Resolves localStorage defensively. Two distinct things can go wrong, and
// both are real on the privacy-hardened browsers this app is played on:
//
//  1. Reading `localStorage` at all can throw SecurityError when site data
//     is blocked (Chrome with cookies blocked, Firefox forks with
//     dom.storage disabled). This is a *property access*, so it throws
//     before any try/catch around getItem/setItem could help.
//  2. It can exist and still throw on use (historically Safari private
//     mode), so presence alone isn't proof it works.
//
// Either one thrown from this service's field initializers would abort
// construction of a providedIn:'root' service during bootstrap — a blank
// page, and one GlobalErrorHandler can't report because it isn't running
// yet. Probing once here means the rest of the app just sees storage as
// unavailable and keeps working in memory for the session.
function resolveStorage(platformId: object): Storage | null {
  if (!isPlatformBrowser(platformId)) {
    return null;
  }
  try {
    const probeKey = '__oh_storage_probe__';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return localStorage;
  } catch {
    return null;
  }
}

const KEYS = {
  provider: 'oh_provider',
  locked: 'oh_locked',
  videoBlur: 'oh_video_blur',
  ytVariants: 'oh_yt_variants',
  spotifyToken: 'oh_sp_token',
  spotifyRefresh: 'oh_sp_refresh',
  spotifyExpiry: 'oh_sp_expiry',
  appleMusicToken: 'oh_am_token',
  customDeck: 'oh_custom_deck',
  currentTrack: 'oh_current_track',
} as const;

@Injectable({ providedIn: 'root' })
export class GameStateService {
  private platformId = inject(PLATFORM_ID);
  private storage: Storage | null = resolveStorage(this.platformId);

  // Every storage access goes through these three. Beyond keeping the
  // try/catch in one place, they matter because storage can start working
  // and then stop mid-session (quota exhausted, permissions revoked in a
  // background tab) — a throw from any single call must never escape into
  // a caller that has no way to handle it.
  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      /* non-fatal — state stays in memory for this session */
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      /* non-fatal */
    }
  }

  readonly provider = signal<Provider>(this.loadProvider());
  readonly locked = signal<boolean>(this.loadLocked());
  readonly videoBlur = signal<VideoBlur>(this.loadVideoBlur());
  readonly ytVariants = signal<boolean>(this.loadYtVariants());
  readonly currentTrack = signal<TrackInfo | null>(this.loadCurrentTrack());
  readonly customDeck = signal<CustomDeckState | null>(this.loadCustomDeck());

  // Bumped whenever a Spotify/Apple token is written or cleared, so hasAuth()
  // recomputes even when `provider` itself doesn't change (e.g. re-authenticating
  // with the same provider is a no-op `signal.set()` under Object.is equality) —
  // token presence otherwise lives in localStorage, invisible to Angular's
  // reactivity graph.
  private readonly authVersion = signal(0);

  readonly hasAuth = computed(() => {
    this.authVersion();
    const p = this.provider();
    if (p === 'youtube') {
      return true;
    }
    if (p === 'spotify') {
      return !!this.getSpotifyToken();
    }
    if (p === 'apple') {
      return !!this.getAppleMusicToken();
    }
    return false;
  });

  constructor() {
    // Persist currentTrack alongside provider/locked/customDeck so a refresh on
    // /game doesn't drop the in-progress round while the provider stays locked.
    effect(() => {
      const track = this.currentTrack();
      if (track) {
        this.write(KEYS.currentTrack, JSON.stringify(track));
      } else {
        this.remove(KEYS.currentTrack);
      }
    });
  }

  readonly isCustomDeckMode = computed(() => !!this.customDeck());

  readonly currentCustomCard = computed((): DeckCard | null => {
    const state = this.customDeck();
    if (!state) {
      return null;
    }
    const idx = state.shuffleOrder[state.currentIndex];
    return state.deck.cards[idx] ?? null;
  });

  readonly customDeckProgress = computed(() => {
    const state = this.customDeck();
    if (!state) {
      return null;
    }
    return { current: state.currentIndex + 1, total: state.shuffleOrder.length };
  });

  readonly isCustomDeckFinished = computed(() => {
    const state = this.customDeck();
    if (!state) {
      return false;
    }
    return state.currentIndex >= state.shuffleOrder.length;
  });

  private loadProvider(): Provider {
    return (this.read(KEYS.provider) as Provider) || null;
  }

  private loadLocked(): boolean {
    return this.read(KEYS.locked) === 'true';
  }

  private loadVideoBlur(): VideoBlur {
    return (this.read(KEYS.videoBlur) as VideoBlur) || DEFAULT_VIDEO_BLUR;
  }

  private loadYtVariants(): boolean {
    const val = this.read(KEYS.ytVariants);
    return val === null ? DEFAULT_YT_VARIANTS : val === 'true';
  }

  private loadCustomDeck(): CustomDeckState | null {
    try {
      const raw = this.read(KEYS.customDeck);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.deckId !== 'string' ||
        !parsed.deck ||
        !Array.isArray(parsed.deck.cards) ||
        !Array.isArray(parsed.shuffleOrder) ||
        typeof parsed.currentIndex !== 'number'
      ) {
        // Shape doesn't match CustomDeckState (stale schema / corrupted entry) —
        // fall back cleanly instead of letting downstream computed()s throw.
        return null;
      }
      return parsed as CustomDeckState;
    } catch {
      return null;
    }
  }

  private loadCurrentTrack(): TrackInfo | null {
    try {
      const raw = this.read(KEYS.currentTrack);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.links !== 'object') {
        return null;
      }
      return parsed as TrackInfo;
    } catch {
      return null;
    }
  }

  setVideoBlur(v: VideoBlur): void {
    this.videoBlur.set(v);
    this.write(KEYS.videoBlur, v);
  }

  setYtVariants(v: boolean): void {
    this.ytVariants.set(v);
    this.write(KEYS.ytVariants, String(v));
  }

  setProvider(p: Provider): void {
    this.provider.set(p);
    if (p) {
      this.write(KEYS.provider, p);
    } else {
      this.remove(KEYS.provider);
    }
  }

  lock(): void {
    this.locked.set(true);
    this.write(KEYS.locked, 'true');
  }

  unlock(): void {
    this.locked.set(false);
    this.remove(KEYS.locked);
  }

  // --- Custom deck ---

  startCustomDeck(deck: Deck, shuffleOrder: number[]): void {
    const state: CustomDeckState = { deckId: deck.id, deck, shuffleOrder, currentIndex: 0 };
    this.customDeck.set(state);
    this.persistCustomDeck(state);
  }

  nextCustomCard(): void {
    const state = this.customDeck();
    if (!state) {
      return;
    }
    const next = { ...state, currentIndex: state.currentIndex + 1 };
    this.customDeck.set(next);
    this.persistCustomDeck(next);
  }

  // Reverts nextCustomCard() — backs the swipe-to-skip gesture's undo
  // affordance, since a swipe (unlike the physical-card Hitster flow) can
  // move past a card the player didn't mean to skip, with nothing external
  // (a real card) marking where they actually were.
  previousCustomCard(): void {
    const state = this.customDeck();
    if (!state || state.currentIndex <= 0) {
      return;
    }
    const prev = { ...state, currentIndex: state.currentIndex - 1 };
    this.customDeck.set(prev);
    this.persistCustomDeck(prev);
  }

  restartCustomDeck(shuffleOrder: number[]): void {
    const state = this.customDeck();
    if (!state) {
      return;
    }
    const next = { ...state, shuffleOrder, currentIndex: 0 };
    this.customDeck.set(next);
    this.persistCustomDeck(next);
  }

  clearCustomDeck(): void {
    this.customDeck.set(null);
    this.remove(KEYS.customDeck);
  }

  private persistCustomDeck(state: CustomDeckState): void {
    this.write(KEYS.customDeck, JSON.stringify(state));
  }

  // --- Reset ---

  reset(): void {
    this.provider.set(null);
    this.locked.set(false);
    this.currentTrack.set(null);
    this.customDeck.set(null);
    // Preferences are cleared from storage below, so the in-memory signals
    // have to go back to the same defaults a fresh load would pick — leaving
    // them as-is made reset() produce a state no reload could reproduce.
    this.videoBlur.set(DEFAULT_VIDEO_BLUR);
    this.ytVariants.set(DEFAULT_YT_VARIANTS);
    Object.values(KEYS).forEach((k) => this.remove(k));
  }

  // --- Spotify ---

  setSpotifyToken(token: string, refresh: string, expiresIn: number): void {
    const expiry = Date.now() + expiresIn * 1000;
    this.write(KEYS.spotifyToken, token);
    this.write(KEYS.spotifyRefresh, refresh);
    this.write(KEYS.spotifyExpiry, String(expiry));
    this.authVersion.update((v) => v + 1);
  }

  getSpotifyToken(): string | null {
    const token = this.read(KEYS.spotifyToken);
    const expiry = Number(this.read(KEYS.spotifyExpiry));
    // Number('NaN-ish'/missing) can be NaN — `Date.now() > NaN` is always false,
    // which would make a malformed expiry look permanently valid.
    if (!token || !Number.isFinite(expiry) || Date.now() > expiry) {
      return null;
    }
    return token;
  }

  getSpotifyRefreshToken(): string | null {
    return this.read(KEYS.spotifyRefresh);
  }

  clearSpotifyToken(): void {
    this.remove(KEYS.spotifyToken);
    this.remove(KEYS.spotifyRefresh);
    this.remove(KEYS.spotifyExpiry);
    this.authVersion.update((v) => v + 1);
  }

  // --- Apple Music ---

  setAppleMusicToken(token: string): void {
    this.write(KEYS.appleMusicToken, token);
    this.authVersion.update((v) => v + 1);
  }

  getAppleMusicToken(): string | null {
    return this.read(KEYS.appleMusicToken);
  }

  clearAppleMusicToken(): void {
    this.remove(KEYS.appleMusicToken);
    this.authVersion.update((v) => v + 1);
  }
}
