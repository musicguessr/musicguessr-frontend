import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { SpotifyService } from './spotify.service';
import { GameStateService } from './game-state.service';

// Playback on iOS never runs in the browser — the Web Playback SDK can't
// produce audio there, so it's handed off to the user's Spotify app via
// Connect. That makes every teardown path (End game, Next card, leaving
// /game) depend on pausing over the Web API rather than on a local player
// object, which is what these cover.
describe('SpotifyService.stop()', () => {
  let service: SpotifyService;
  let state: GameStateService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [SpotifyService, GameStateService, provideHttpClient(), { provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(SpotifyService);
    state = TestBed.inject(GameStateService);

    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  function pauseCalls(): [string, Record<string, unknown>][] {
    return fetchMock.mock.calls.filter((c) => String(c[0]).includes('/me/player/pause'));
  }

  it("doesn't pause the user's active device when playback was never handed off", async () => {
    // A stale Spotify token from an earlier session must not pause whatever
    // the user is listening to elsewhere while this game plays via YouTube.
    state.setSpotifyToken('tok', 'ref', 3600);

    service.stop();
    await Promise.resolve();

    expect(pauseCalls()).toHaveLength(0);
    expect(service.isPlaying()).toBe(false);
  });

  it('targets the device playback was handed off to', async () => {
    state.setSpotifyToken('tok', 'ref', 3600);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [{ id: 'phone-123', is_active: true }] }) })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    await service.play('track1');
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    service.stop();
    await Promise.resolve();

    const calls = pauseCalls();
    expect(calls).toHaveLength(1);
    expect(String(calls[0][0])).toContain('device_id=phone-123');
  });

  it('does nothing without a token rather than firing an unauthenticated call', async () => {
    service.stop();
    await Promise.resolve();

    expect(pauseCalls()).toHaveLength(0);
  });

  it('never throws when the pause request fails', async () => {
    state.setSpotifyToken('tok', 'ref', 3600);
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(() => service.stop()).not.toThrow();
    await Promise.resolve();
    expect(service.isPlaying()).toBe(false);
  });
});
