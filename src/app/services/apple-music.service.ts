import { inject, Injectable, signal } from '@angular/core';
import { ConfigService } from './config.service';
import { GameStateService } from './game-state.service';

declare global {
  interface Window {
    MusicKit: any;
  }
}

@Injectable({ providedIn: 'root' })
export class AppleMusicService {
  readonly isReady = signal(false);
  readonly isPlaying = signal(false);
  readonly error = signal<string | null>(null);

  private music: any = null;

  private config = inject(ConfigService);
  private state = inject(GameStateService);

  private loadKit(): Promise<void> {
    if (window.MusicKit) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      s.onload = (): void => resolve();
      s.onerror = (): void => reject(new Error('Failed to load MusicKit'));
      document.head.appendChild(s);
    });
  }

  async init(): Promise<void> {
    const devToken = this.config.appleDevToken;
    if (!devToken) {
      this.error.set('Apple developer token not configured');
      return;
    }

    await this.loadKit();

    this.music = await window.MusicKit.configure({
      developerToken: devToken,
      app: { name: 'musicguessr', build: '1.0.0' },
    });

    const userToken = this.state.getAppleMusicToken();
    if (userToken) {
      this.isReady.set(true);
    }
  }

  async authorize(): Promise<void> {
    if (!this.music) await this.init();
    if (!this.music) throw new Error('MusicKit not initialized');

    const userToken = await this.music.authorize();
    this.state.setAppleMusicToken(userToken);
    this.isReady.set(true);
  }

  // Pre-loads the track queue before the user taps — required for iOS autoplay.
  // Separates the async API work (search + setQueue) from play() so that play()
  // can be called synchronously inside a user gesture without any preceding awaits.
  async preloadTrack(artist: string, title: string): Promise<void> {
    if (!this.music) throw new Error('MusicKit not ready');
    const query = encodeURIComponent(`${artist} ${title}`);
    const result = await this.music.api.music(
      // [C1] Fix: use this.music.storefrontId, not the literal "{{storefrontId}}"
      `/v1/catalog/${this.music.storefrontId}/search?term=${query}&types=songs&limit=1`,
    );
    const songs = result?.data?.results?.songs?.data;
    if (!songs?.length) throw new Error('Track not found on Apple Music');
    await this.music.setQueue({ song: songs[0].id });
  }

  // [C2] Fix: play() is now called as the very first operation inside the click
  // handler (no preceding awaits), so iOS attributes it to the user gesture.
  // Queue must be pre-loaded via preloadTrack() before this is called.
  async play(): Promise<void> {
    if (!this.music) throw new Error('MusicKit not ready');
    await this.music.play();
    this.isPlaying.set(true);
  }

  stop(): void {
    if (this.music) this.music.stop();
    this.isPlaying.set(false);
  }

  unauthorize(): void {
    if (this.music) this.music.unauthorize();
    this.state.clearAppleMusicToken();
    this.isReady.set(false);
    this.isPlaying.set(false);
  }
}
