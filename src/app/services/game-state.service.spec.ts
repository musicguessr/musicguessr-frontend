import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { GameStateService } from './game-state.service';
import type { Deck } from './deck.service';

const mockDeck: Deck = {
  id: 'deck123',
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  cards: [
    { yt_id: 'vid1', title: 'Song A' },
    { yt_id: 'vid2', title: 'Song B' },
    { yt_id: 'vid3', title: 'Song C' },
  ],
};

describe('GameStateService', () => {
  let service: GameStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [GameStateService, { provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(GameStateService);
  });

  afterEach(() => localStorage.clear());

  // ── Default state ──────────────────────────────────────────────────────────

  it('provider is null by default', () => expect(service.provider()).toBeNull());
  it('is not locked by default', () => expect(service.locked()).toBe(false));
  it('videoBlur defaults to "hidden"', () => expect(service.videoBlur()).toBe('hidden'));
  it('ytVariants defaults to true', () => expect(service.ytVariants()).toBe(true));
  it('currentTrack is null by default', () => expect(service.currentTrack()).toBeNull());

  // ── setProvider() ──────────────────────────────────────────────────────────

  describe('setProvider()', () => {
    it('updates the signal', () => {
      service.setProvider('youtube');
      expect(service.provider()).toBe('youtube');
    });

    it('persists to localStorage', () => {
      service.setProvider('spotify');
      expect(localStorage.getItem('oh_provider')).toBe('spotify');
    });

    it('removes localStorage entry on null', () => {
      service.setProvider('youtube');
      service.setProvider(null);
      expect(localStorage.getItem('oh_provider')).toBeNull();
    });
  });

  // ── lock / unlock ──────────────────────────────────────────────────────────

  describe('lock() / unlock()', () => {
    it('lock() sets locked to true', () => {
      service.lock();
      expect(service.locked()).toBe(true);
    });

    it('unlock() sets locked to false', () => {
      service.lock();
      service.unlock();
      expect(service.locked()).toBe(false);
    });
  });

  // ── hasAuth computed ───────────────────────────────────────────────────────

  describe('hasAuth', () => {
    it('is true for youtube without any token', () => {
      service.setProvider('youtube');
      expect(service.hasAuth()).toBe(true);
    });

    it('is false for spotify without a token', () => {
      service.setProvider('spotify');
      expect(service.hasAuth()).toBe(false);
    });

    it('is true for spotify with a valid token', () => {
      service.setProvider('spotify');
      service.setSpotifyToken('tok', 'refresh', 3600);
      expect(service.hasAuth()).toBe(true);
    });

    it('is false for apple without a token', () => {
      service.setProvider('apple');
      expect(service.hasAuth()).toBe(false);
    });

    it('is true for apple with a token', () => {
      service.setProvider('apple');
      service.setAppleMusicToken('am_tok');
      expect(service.hasAuth()).toBe(true);
    });

    it('is false when provider is null', () => {
      expect(service.hasAuth()).toBe(false);
    });
  });

  // ── Spotify token ──────────────────────────────────────────────────────────

  describe('Spotify token', () => {
    it('returns null before any token is set', () => {
      expect(service.getSpotifyToken()).toBeNull();
    });

    it('returns access token within expiry window', () => {
      service.setSpotifyToken('access_tok', 'refresh_tok', 3600);
      expect(service.getSpotifyToken()).toBe('access_tok');
    });

    it('returns null when token has expired', () => {
      service.setSpotifyToken('access_tok', 'refresh_tok', -1);
      expect(service.getSpotifyToken()).toBeNull();
    });

    it('getSpotifyRefreshToken() returns stored refresh token', () => {
      service.setSpotifyToken('access_tok', 'refresh_tok', 3600);
      expect(service.getSpotifyRefreshToken()).toBe('refresh_tok');
    });

    it('clearSpotifyToken() removes all Spotify keys', () => {
      service.setSpotifyToken('access_tok', 'refresh_tok', 3600);
      service.clearSpotifyToken();
      expect(service.getSpotifyToken()).toBeNull();
      expect(service.getSpotifyRefreshToken()).toBeNull();
    });
  });

  // ── Apple Music token ──────────────────────────────────────────────────────

  describe('Apple Music token', () => {
    it('returns null before any token is set', () => {
      expect(service.getAppleMusicToken()).toBeNull();
    });

    it('returns stored token', () => {
      service.setAppleMusicToken('am_token_xyz');
      expect(service.getAppleMusicToken()).toBe('am_token_xyz');
    });

    it('clearAppleMusicToken() removes the token', () => {
      service.setAppleMusicToken('am_token_xyz');
      service.clearAppleMusicToken();
      expect(service.getAppleMusicToken()).toBeNull();
    });
  });

  // ── Custom deck ────────────────────────────────────────────────────────────

  describe('Custom deck', () => {
    it('customDeck is null by default', () => {
      expect(service.customDeck()).toBeNull();
      expect(service.isCustomDeckMode()).toBe(false);
    });

    it('startCustomDeck() activates deck mode', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      expect(service.isCustomDeckMode()).toBe(true);
      expect(service.customDeck()?.currentIndex).toBe(0);
    });

    it('currentCustomCard returns card at shuffled index', () => {
      service.startCustomDeck(mockDeck, [2, 0, 1]);
      expect(service.currentCustomCard()?.yt_id).toBe('vid3');
    });

    it('nextCustomCard() advances the index', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      service.nextCustomCard();
      expect(service.customDeck()?.currentIndex).toBe(1);
      expect(service.currentCustomCard()?.yt_id).toBe('vid2');
    });

    it('customDeckProgress reflects current position', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      service.nextCustomCard();
      expect(service.customDeckProgress()).toEqual({ current: 2, total: 3 });
    });

    it('isCustomDeckFinished is false mid-deck', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      service.nextCustomCard();
      expect(service.isCustomDeckFinished()).toBe(false);
    });

    it('isCustomDeckFinished is true after last card', () => {
      service.startCustomDeck(mockDeck, [0]);
      service.nextCustomCard();
      expect(service.isCustomDeckFinished()).toBe(true);
    });

    it('previousCustomCard() rewinds the index', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      service.nextCustomCard();
      service.nextCustomCard();
      service.previousCustomCard();
      expect(service.customDeck()?.currentIndex).toBe(1);
      expect(service.currentCustomCard()?.yt_id).toBe('vid2');
    });

    it('previousCustomCard() does not go below index 0', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      service.previousCustomCard();
      expect(service.customDeck()?.currentIndex).toBe(0);
    });

    it('restartCustomDeck() resets index and applies new shuffle order', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      service.nextCustomCard();
      service.restartCustomDeck([2, 1, 0]);
      expect(service.customDeck()?.currentIndex).toBe(0);
      expect(service.customDeck()?.shuffleOrder).toEqual([2, 1, 0]);
    });

    it('clearCustomDeck() removes deck state', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      service.clearCustomDeck();
      expect(service.customDeck()).toBeNull();
      expect(localStorage.getItem('oh_custom_deck')).toBeNull();
    });

    it('startCustomDeck() persists to localStorage', () => {
      service.startCustomDeck(mockDeck, [0, 1, 2]);
      expect(localStorage.getItem('oh_custom_deck')).not.toBeNull();
    });
  });

  // ── reset() ────────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('clears signals and localStorage', () => {
      service.setProvider('youtube');
      service.lock();
      service.setSpotifyToken('tok', 'ref', 3600);
      service.reset();

      expect(service.provider()).toBeNull();
      expect(service.locked()).toBe(false);
      expect(service.currentTrack()).toBeNull();
      expect(localStorage.getItem('oh_provider')).toBeNull();
      expect(localStorage.getItem('oh_sp_token')).toBeNull();
    });

    it('restores preference signals to their defaults', () => {
      service.setVideoBlur('visible');
      service.setYtVariants(false);
      service.reset();

      // reset() wipes the stored preferences, so the in-memory signals have
      // to match what a fresh load would produce — otherwise the app sits in
      // a state no reload can reproduce.
      expect(service.videoBlur()).toBe('hidden');
      expect(service.ytVariants()).toBe(true);
    });
  });
});

// Privacy-hardened browsers can block site data outright, which makes
// `localStorage` throw on *property access* — before any try/catch around
// getItem could run. This service is providedIn:'root' and reads storage in
// its field initializers, so an unguarded throw there aborts bootstrap
// entirely (blank page, and GlobalErrorHandler isn't up yet to report it).
describe('GameStateService with unavailable localStorage', () => {
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('access denied', 'SecurityError');
      },
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('constructs without throwing', () => {
    TestBed.configureTestingModule({
      providers: [GameStateService, { provide: PLATFORM_ID, useValue: 'browser' }],
    });
    expect(() => TestBed.inject(GameStateService)).not.toThrow();
  });

  it('falls back to in-memory state that still drives the game', () => {
    TestBed.configureTestingModule({
      providers: [GameStateService, { provide: PLATFORM_ID, useValue: 'browser' }],
    });
    const svc = TestBed.inject(GameStateService);

    expect(svc.provider()).toBeNull();
    expect(svc.videoBlur()).toBe('hidden');

    // Writes must not throw either, and the signals must still update — the
    // session just won't survive a reload.
    expect(() => svc.setProvider('youtube')).not.toThrow();
    expect(svc.provider()).toBe('youtube');
    expect(() => svc.lock()).not.toThrow();
    expect(svc.locked()).toBe(true);
    expect(() => svc.setSpotifyToken('tok', 'ref', 3600)).not.toThrow();
    expect(() => svc.reset()).not.toThrow();
  });
});
