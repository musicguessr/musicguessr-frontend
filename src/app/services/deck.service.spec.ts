import { TestBed } from '@angular/core/testing';
import { DeckService } from './deck.service';
import { ConfigService } from './config.service';
import type { Deck } from './deck.service';

const makeDeck = (id: string, cardCount = 2, daysUntilExpiry = 30): Deck => ({
  id,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + daysUntilExpiry * 86_400_000).toISOString(),
  cards: Array.from({ length: cardCount }, (_, i) => ({ yt_id: `vid${i}` })),
});

describe('DeckService', () => {
  let service: DeckService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [DeckService, { provide: ConfigService, useValue: { apiUrl: 'http://localhost:8080' } }],
    });
    service = TestBed.inject(DeckService);
  });

  afterEach(() => localStorage.clear());

  // ── shuffle() ──────────────────────────────────────────────────────────────

  describe('shuffle()', () => {
    it('returns an array with the same elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = service.shuffle(arr);
      expect(result).toHaveLength(arr.length);
      expect([...result].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b));
    });

    it('does not mutate the original array', () => {
      const arr = [1, 2, 3, 4];
      service.shuffle(arr);
      expect(arr).toEqual([1, 2, 3, 4]);
    });

    it('handles empty array', () => {
      expect(service.shuffle([])).toEqual([]);
    });

    it('handles single-element array', () => {
      expect(service.shuffle([42])).toEqual([42]);
    });
  });

  // ── Deck registry (localStorage) ──────────────────────────────────────────

  describe('getLocalDeckEntries()', () => {
    it('returns empty array when nothing is saved', () => {
      expect(service.getLocalDeckEntries()).toEqual([]);
    });

    it('tolerates corrupted localStorage data', () => {
      localStorage.setItem('mg_local_decks', 'not-json');
      expect(service.getLocalDeckEntries()).toEqual([]);
    });
  });

  describe('saveLocalDeckEntry()', () => {
    it('stores a deck entry with correct fields', () => {
      const deck = makeDeck('abc123', 5);
      service.saveLocalDeckEntry(deck);

      const entries = service.getLocalDeckEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('abc123');
      expect(entries[0].cardCount).toBe(5);
    });

    it('prepends newer entries (most recent first)', () => {
      service.saveLocalDeckEntry(makeDeck('first'));
      service.saveLocalDeckEntry(makeDeck('second'));

      const entries = service.getLocalDeckEntries();
      expect(entries[0].id).toBe('second');
      expect(entries[1].id).toBe('first');
    });

    it('updates an existing entry instead of duplicating', () => {
      service.saveLocalDeckEntry(makeDeck('same_id', 2));
      service.saveLocalDeckEntry(makeDeck('same_id', 10));

      const entries = service.getLocalDeckEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].cardCount).toBe(10);
    });
  });

  // ── Deck cache ─────────────────────────────────────────────────────────────

  describe('deck cache', () => {
    it('getCachedDeck() returns null for unknown id', () => {
      expect(service.getCachedDeck('unknown')).toBeNull();
    });

    it('cacheDeck() stores and getCachedDeck() retrieves the deck', () => {
      const deck = makeDeck('cached_deck', 3);
      service.cacheDeck(deck);

      const retrieved = service.getCachedDeck('cached_deck');
      expect(retrieved?.id).toBe('cached_deck');
      expect(retrieved?.cards).toHaveLength(3);
    });

    it('getCachedDeck() returns null on corrupted data', () => {
      localStorage.setItem('mg_deck_bad', 'not-json');
      expect(service.getCachedDeck('bad')).toBeNull();
    });
  });
});
