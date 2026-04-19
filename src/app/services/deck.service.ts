import { inject, Injectable } from '@angular/core';
import { ConfigService } from './config.service';

export type DeckTTL = '1week' | '1month' | '3months' | '6months' | '1year';

export type DeckCard = {
  yt_id: string;
  title?: string;
  artist?: string;
  year?: number;
  artwork?: string;
}

export type Deck = {
  id: string;
  created_at: string;
  expires_at: string;
  cards: DeckCard[];
}

export type CreateDeckResponse = {
  id: string;
  share_url: string;
  expires_at: string;
}

export type ValidateYtResponse = {
  valid: boolean;
  yt_id?: string;
  title?: string;
  artist?: string;
  year?: number;
  artwork?: string;
  error?: string;
}

export type CardInput = {
  yt_url: string;
  title?: string;
  artist?: string;
  year?: number;
}

export type ImportPlaylistResponse = {
  playlist_id: string;
  videos: ValidateYtResponse[];
  total: number;
}

const LOCAL_DECKS_KEY = 'mg_local_decks';

type LocalDeckEntry = {
  id: string;
  cardCount: number;
  expiresAt: string;
  savedAt: string;
}

@Injectable({ providedIn: 'root' })
export class DeckService {
  private config = inject(ConfigService);

  private get apiUrl(): string {
    return this.config.apiUrl;
  }

  async validateYt(url: string): Promise<ValidateYtResponse> {
    const res = await fetch(`${this.apiUrl}/api/deck/validate-yt?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { valid: false, error: err.error ?? `HTTP ${res.status}` };
    }
    return res.json();
  }

  async createDeck(cards: CardInput[], ttl: DeckTTL = '3months'): Promise<CreateDeckResponse> {
    const res = await fetch(`${this.apiUrl}/api/deck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards, ttl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  }

  async importPlaylist(url: string): Promise<ImportPlaylistResponse> {
    const res = await fetch(`${this.apiUrl}/api/deck/import-playlist?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getDeck(id: string): Promise<Deck> {
    const res = await fetch(`${this.apiUrl}/api/deck/${id}`);
    if (res.status === 404) {throw new Error('Deck not found');}
    if (res.status === 410) {throw new Error('Deck has expired');}
    if (!res.ok) {throw new Error(`HTTP ${res.status}`);}
    return res.json();
  }

  /** Fisher-Yates shuffle — always client-side */
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // --- localStorage deck registry ---

  saveLocalDeckEntry(deck: Deck): void {
    try {
      const entries = this.getLocalDeckEntries();
      const existing = entries.findIndex((e) => e.id === deck.id);
      const entry: LocalDeckEntry = {
        id: deck.id,
        cardCount: deck.cards.length,
        expiresAt: deck.expires_at,
        savedAt: new Date().toISOString(),
      };
      if (existing >= 0) {
        entries[existing] = entry;
      } else {
        entries.unshift(entry);
      }
      localStorage.setItem(LOCAL_DECKS_KEY, JSON.stringify(entries.slice(0, 50)));
    } catch {
      // localStorage full — non-fatal
    }
  }

  getLocalDeckEntries(): LocalDeckEntry[] {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_DECKS_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  cacheDeck(deck: Deck): void {
    try {
      localStorage.setItem(`mg_deck_${deck.id}`, JSON.stringify(deck));
    } catch {
      // localStorage full — non-fatal
    }
  }

  getCachedDeck(id: string): Deck | null {
    try {
      const raw = localStorage.getItem(`mg_deck_${id}`);
      if (!raw) {return null;}
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
