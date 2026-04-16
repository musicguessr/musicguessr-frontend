import { computed, Injectable, signal } from '@angular/core';

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

const KEYS = {
  provider: 'oh_provider',
  locked: 'oh_locked',
  videoBlur: 'oh_video_blur',
  ytVariants: 'oh_yt_variants',
  spotifyToken: 'oh_sp_token',
  spotifyRefresh: 'oh_sp_refresh',
  spotifyExpiry: 'oh_sp_expiry',
  appleMusicToken: 'oh_am_token',
} as const;

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly provider = signal<Provider>(this.loadProvider());
  readonly locked = signal<boolean>(this.loadLocked());
  readonly videoBlur = signal<VideoBlur>(this.loadVideoBlur());
  readonly ytVariants = signal<boolean>(this.loadYtVariants());
  readonly currentTrack = signal<TrackInfo | null>(null);

  readonly hasAuth = computed(() => {
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

  private loadProvider(): Provider {
    return (localStorage.getItem(KEYS.provider) as Provider) || null;
  }

  private loadLocked(): boolean {
    return localStorage.getItem(KEYS.locked) === 'true';
  }

  private loadVideoBlur(): VideoBlur {
    return (localStorage.getItem(KEYS.videoBlur) as VideoBlur) || 'hidden';
  }

  setVideoBlur(v: VideoBlur): void {
    this.videoBlur.set(v);
    localStorage.setItem(KEYS.videoBlur, v);
  }

  private loadYtVariants(): boolean {
    const val = localStorage.getItem(KEYS.ytVariants);
    return val === null ? true : val === 'true'; // default ON
  }

  setYtVariants(v: boolean): void {
    this.ytVariants.set(v);
    localStorage.setItem(KEYS.ytVariants, String(v));
  }

  setProvider(p: Provider): void {
    this.provider.set(p);
    if (p) {
      localStorage.setItem(KEYS.provider, p);
    } else {
      localStorage.removeItem(KEYS.provider);
    }
  }

  lock(): void {
    this.locked.set(true);
    localStorage.setItem(KEYS.locked, 'true');
  }

  unlock(): void {
    this.locked.set(false);
    localStorage.removeItem(KEYS.locked);
  }

  reset(): void {
    this.provider.set(null);
    this.locked.set(false);
    this.currentTrack.set(null);
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }

  // Spotify
  setSpotifyToken(token: string, refresh: string, expiresIn: number): void {
    const expiry = Date.now() + expiresIn * 1000;
    localStorage.setItem(KEYS.spotifyToken, token);
    localStorage.setItem(KEYS.spotifyRefresh, refresh);
    localStorage.setItem(KEYS.spotifyExpiry, String(expiry));
  }

  getSpotifyToken(): string | null {
    const token = localStorage.getItem(KEYS.spotifyToken);
    const expiry = Number(localStorage.getItem(KEYS.spotifyExpiry) || 0);
    if (!token || Date.now() > expiry) {
      return null;
    }
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

  // Apple Music
  setAppleMusicToken(token: string): void {
    localStorage.setItem(KEYS.appleMusicToken, token);
  }

  getAppleMusicToken(): string | null {
    return localStorage.getItem(KEYS.appleMusicToken);
  }

  clearAppleMusicToken(): void {
    localStorage.removeItem(KEYS.appleMusicToken);
  }
}
