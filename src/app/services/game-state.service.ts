import { computed, Injectable, signal } from '@angular/core';
import { DeckCard, Deck } from './deck.service';

export type Provider = 'youtube' | 'spotify' | 'apple' | null;
export type VideoBlur = 'hidden' | 'blurred' | 'visible';

export type TrackInfo = {
  spotify_id: string;
  spotify_url: string;
  artist?: string;
  title?: string;
  year?: number;
  artwork_url?: string;
  youtube_video_id?: string;
  links: Record<string, string>;
};

export interface CustomDeckState {
  deckId: string;
  deck: Deck;
  shuffleOrder: number[];
  currentIndex: number;
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
} as const;

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly provider = signal<Provider>(this.loadProvider());
  readonly locked = signal<boolean>(this.loadLocked());
  readonly videoBlur = signal<VideoBlur>(this.loadVideoBlur());
  readonly ytVariants = signal<boolean>(this.loadYtVariants());
  readonly currentTrack = signal<TrackInfo | null>(null);
  readonly customDeck = signal<CustomDeckState | null>(this.loadCustomDeck());

  readonly hasAuth = computed(() => {
    const p = this.provider();
    if (p === 'youtube') return true;
    if (p === 'spotify') return !!this.getSpotifyToken();
    if (p === 'apple') return !!this.getAppleMusicToken();
    return false;
  });

  readonly isCustomDeckMode = computed(() => !!this.customDeck());

  readonly currentCustomCard = computed((): DeckCard | null => {
    const state = this.customDeck();
    if (!state) return null;
    const idx = state.shuffleOrder[state.currentIndex];
    return state.deck.cards[idx] ?? null;
  });

  readonly customDeckProgress = computed(() => {
    const state = this.customDeck();
    if (!state) return null;
    return { current: state.currentIndex + 1, total: state.shuffleOrder.length };
  });

  readonly isCustomDeckFinished = computed(() => {
    const state = this.customDeck();
    if (!state) return false;
    return state.currentIndex >= state.shuffleOrder.length;
  });

  private loadProvider(): Provider {
    return (localStorage.getItem(KEYS.provider) as Provider) || null;
  }

  private loadLocked(): boolean {
    return localStorage.getItem(KEYS.locked) === 'true';
  }

  private loadVideoBlur(): VideoBlur {
    return (localStorage.getItem(KEYS.videoBlur) as VideoBlur) || 'hidden';
  }

  private loadYtVariants(): boolean {
    const val = localStorage.getItem(KEYS.ytVariants);
    return val === null ? true : val === 'true';
  }

  private loadCustomDeck(): CustomDeckState | null {
    try {
      const raw = localStorage.getItem(KEYS.customDeck);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setVideoBlur(v: VideoBlur): void {
    this.videoBlur.set(v);
    try { localStorage.setItem(KEYS.videoBlur, v); } catch { /* non-fatal */ }
  }

  setYtVariants(v: boolean): void {
    this.ytVariants.set(v);
    try { localStorage.setItem(KEYS.ytVariants, String(v)); } catch { /* non-fatal */ }
  }

  setProvider(p: Provider): void {
    this.provider.set(p);
    try {
      if (p) localStorage.setItem(KEYS.provider, p);
      else localStorage.removeItem(KEYS.provider);
    } catch { /* non-fatal */ }
  }

  lock(): void {
    this.locked.set(true);
    try { localStorage.setItem(KEYS.locked, 'true'); } catch { /* non-fatal */ }
  }

  unlock(): void {
    this.locked.set(false);
    localStorage.removeItem(KEYS.locked);
  }

  // --- Custom deck ---

  startCustomDeck(deck: Deck, shuffleOrder: number[]): void {
    const state: CustomDeckState = { deckId: deck.id, deck, shuffleOrder, currentIndex: 0 };
    this.customDeck.set(state);
    this.persistCustomDeck(state);
  }

  nextCustomCard(): void {
    const state = this.customDeck();
    if (!state) return;
    const next = { ...state, currentIndex: state.currentIndex + 1 };
    this.customDeck.set(next);
    this.persistCustomDeck(next);
  }

  restartCustomDeck(shuffleOrder: number[]): void {
    const state = this.customDeck();
    if (!state) return;
    const next = { ...state, shuffleOrder, currentIndex: 0 };
    this.customDeck.set(next);
    this.persistCustomDeck(next);
  }

  clearCustomDeck(): void {
    this.customDeck.set(null);
    localStorage.removeItem(KEYS.customDeck);
  }

  private persistCustomDeck(state: CustomDeckState): void {
    try {
      localStorage.setItem(KEYS.customDeck, JSON.stringify(state));
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
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }

  // --- Spotify ---

  setSpotifyToken(token: string, refresh: string, expiresIn: number): void {
    const expiry = Date.now() + expiresIn * 1000;
    try {
      localStorage.setItem(KEYS.spotifyToken, token);
      localStorage.setItem(KEYS.spotifyRefresh, refresh);
      localStorage.setItem(KEYS.spotifyExpiry, String(expiry));
    } catch { /* non-fatal — token lives in memory for this session */ }
  }

  getSpotifyToken(): string | null {
    const token = localStorage.getItem(KEYS.spotifyToken);
    const expiry = Number(localStorage.getItem(KEYS.spotifyExpiry) || 0);
    if (!token || Date.now() > expiry) return null;
    return token;
  }

  getSpotifyRefreshToken(): string | null {
    return localStorage.getItem(KEYS.spotifyRefresh);
  }

  clearSpotifyToken(): void {
    localStorage.removeItem(KEYS.spotifyToken);
    localStorage.removeItem(KEYS.spotifyRefresh);
    localStorage.removeItem(KEYS.spotifyExpiry);
  }

  // --- Apple Music ---

  setAppleMusicToken(token: string): void {
    try { localStorage.setItem(KEYS.appleMusicToken, token); } catch { /* non-fatal */ }
  }

  getAppleMusicToken(): string | null {
    return localStorage.getItem(KEYS.appleMusicToken);
  }

  clearAppleMusicToken(): void {
    localStorage.removeItem(KEYS.appleMusicToken);
  }
}
