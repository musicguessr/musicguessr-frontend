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
};

export type CustomDeckState = {
  deckId: string;
  deck: Deck;
  shuffleOrder: number[];
  currentIndex: number;
};

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
  private storage: Storage | null = isPlatformBrowser(this.platformId) ? localStorage : null;

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
      try {
        if (track) {
          this.storage?.setItem(KEYS.currentTrack, JSON.stringify(track));
        } else {
          this.storage?.removeItem(KEYS.currentTrack);
        }
      } catch {
        /* non-fatal */
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
    return (this.storage?.getItem(KEYS.provider) as Provider) || null;
  }

  private loadLocked(): boolean {
    return this.storage?.getItem(KEYS.locked) === 'true';
  }

  private loadVideoBlur(): VideoBlur {
    return (this.storage?.getItem(KEYS.videoBlur) as VideoBlur) || 'hidden';
  }

  private loadYtVariants(): boolean {
    const val = this.storage?.getItem(KEYS.ytVariants) ?? null;
    return val === null ? true : val === 'true';
  }

  private loadCustomDeck(): CustomDeckState | null {
    try {
      const raw = this.storage?.getItem(KEYS.customDeck);
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
      const raw = this.storage?.getItem(KEYS.currentTrack);
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
    try {
      this.storage?.setItem(KEYS.videoBlur, v);
    } catch {
      /* non-fatal */
    }
  }

  setYtVariants(v: boolean): void {
    this.ytVariants.set(v);
    try {
      this.storage?.setItem(KEYS.ytVariants, String(v));
    } catch {
      /* non-fatal */
    }
  }

  setProvider(p: Provider): void {
    this.provider.set(p);
    try {
      if (p) {
        this.storage?.setItem(KEYS.provider, p);
      } else {
        this.storage?.removeItem(KEYS.provider);
      }
    } catch {
      /* non-fatal */
    }
  }

  lock(): void {
    this.locked.set(true);
    try {
      this.storage?.setItem(KEYS.locked, 'true');
    } catch {
      /* non-fatal */
    }
  }

  unlock(): void {
    this.locked.set(false);
    this.storage?.removeItem(KEYS.locked);
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
    this.storage?.removeItem(KEYS.customDeck);
  }

  private persistCustomDeck(state: CustomDeckState): void {
    try {
      this.storage?.setItem(KEYS.customDeck, JSON.stringify(state));
    } catch {
      // localStorage full — non-fatal
    }
  }

  // --- Reset ---

  reset(): void {
    this.provider.set(null);
    this.locked.set(false);
    this.currentTrack.set(null);
    this.customDeck.set(null);
    Object.values(KEYS).forEach((k) => this.storage?.removeItem(k));
  }

  // --- Spotify ---

  setSpotifyToken(token: string, refresh: string, expiresIn: number): void {
    const expiry = Date.now() + expiresIn * 1000;
    try {
      this.storage?.setItem(KEYS.spotifyToken, token);
      this.storage?.setItem(KEYS.spotifyRefresh, refresh);
      this.storage?.setItem(KEYS.spotifyExpiry, String(expiry));
    } catch {
      /* non-fatal — token lives in memory for this session */
    }
    this.authVersion.update((v) => v + 1);
  }

  getSpotifyToken(): string | null {
    const token = this.storage?.getItem(KEYS.spotifyToken) ?? null;
    const expiry = Number(this.storage?.getItem(KEYS.spotifyExpiry));
    // Number('NaN-ish'/missing) can be NaN — `Date.now() > NaN` is always false,
    // which would make a malformed expiry look permanently valid.
    if (!token || !Number.isFinite(expiry) || Date.now() > expiry) {
      return null;
    }
    return token;
  }

  getSpotifyRefreshToken(): string | null {
    return this.storage?.getItem(KEYS.spotifyRefresh) ?? null;
  }

  clearSpotifyToken(): void {
    this.storage?.removeItem(KEYS.spotifyToken);
    this.storage?.removeItem(KEYS.spotifyRefresh);
    this.storage?.removeItem(KEYS.spotifyExpiry);
    this.authVersion.update((v) => v + 1);
  }

  // --- Apple Music ---

  setAppleMusicToken(token: string): void {
    try {
      this.storage?.setItem(KEYS.appleMusicToken, token);
    } catch {
      /* non-fatal */
    }
    this.authVersion.update((v) => v + 1);
  }

  getAppleMusicToken(): string | null {
    return this.storage?.getItem(KEYS.appleMusicToken) ?? null;
  }

  clearAppleMusicToken(): void {
    this.storage?.removeItem(KEYS.appleMusicToken);
    this.authVersion.update((v) => v + 1);
  }
}
