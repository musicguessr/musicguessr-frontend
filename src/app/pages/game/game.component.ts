import { Component, OnDestroy, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GameStateService, TrackInfo } from '../../services/game-state.service';
import { YoutubePlayerService } from '../../services/youtube-player.service';
import { SpotifyService } from '../../services/spotify.service';
import { AppleMusicService } from '../../services/apple-music.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss'
})
export class GameComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private state = inject(GameStateService);
  private ytPlayer = inject(YoutubePlayerService);
  private spotify = inject(SpotifyService);
  private apple = inject(AppleMusicService);

  readonly track = this.state.currentTrack;
  readonly provider = this.state.provider;
  readonly videoBlur = this.state.videoBlur;
  readonly revealed = signal(false);
  readonly showOverlay = signal(true);
  readonly overlayReady = signal(false);
  readonly overlayError = signal<string | null>(null);
  readonly playerError = signal<string | null>(null);
  readonly isPlaying = signal(false);

  ngOnInit(): void {
    if (!this.track()) {
      this.router.navigate(['/scan']);
      return;
    }
    this.preparePlayer();
  }

  ngOnDestroy(): void {
    const p = this.provider();
    if (p === 'youtube') this.ytPlayer.destroy();
    if (p === 'spotify') this.spotify.stop();
    if (p === 'apple') this.apple.stop();
  }

  private async preparePlayer(): Promise<void> {
    const p = this.provider();
    const t = this.track()!;

    if (p === 'youtube') {
      if (t.youtube_video_id) {
        try {
          await this.ytPlayer.loadAPI();
          this.overlayReady.set(true);
        } catch {
          this.overlayError.set('Failed to load YouTube player');
          this.overlayReady.set(true);
        }
      } else {
        this.overlayError.set('No YouTube match found for this track');
        this.overlayReady.set(true);
      }
      return;
    }

    if (p === 'spotify') {
      try {
        await this.spotify.initSDK();
        this.overlayReady.set(true);
      } catch (e: any) {
        this.overlayError.set(e.message || 'Spotify failed to initialize');
        this.overlayReady.set(true);
      }
      return;
    }

    if (p === 'apple') {
      try {
        await this.apple.init();
        this.overlayReady.set(true);
      } catch (e: any) {
        this.overlayError.set(e.message || 'Apple Music failed to initialize');
        this.overlayReady.set(true);
      }
      return;
    }
  }

  // Called synchronously inside click handler — required for iOS autoplay
  onOverlayTap(): void {
    const p = this.provider();
    const t = this.track()!;

    this.showOverlay.set(false);

    if (p === 'youtube') {
      if (t.youtube_video_id) {
        this.ytPlayer.playVideo(t.youtube_video_id);
        this.isPlaying.set(true);
      } else if (this.overlayError()) {
        const link = this.getFallbackLink(t);
        if (link) window.open(link, '_blank', 'noopener');
      }
      return;
    }

    if (p === 'spotify') {
      this.spotify.play(t.spotify_id)
        .then(() => this.isPlaying.set(true))
        .catch((e: Error) => this.playerError.set(e.message));
      return;
    }

    if (p === 'apple') {
      this.apple.play({ artist: t.artist, title: t.title, appleMusicUrl: t.apple_music_url })
        .then(() => this.isPlaying.set(true))
        .catch((e: Error) => this.playerError.set(e.message));
      return;
    }
  }

  reveal(): void { this.revealed.set(true); }
  hide(): void { this.revealed.set(false); }

  scanNext(): void {
    this.ytPlayer.destroy();
    this.spotify.stop();
    this.apple.stop();
    this.state.currentTrack.set(null);
    this.router.navigate(['/scan']);
  }

  endGame(): void {
    this.ytPlayer.destroy();
    this.spotify.stop();
    this.apple.stop();
    this.state.currentTrack.set(null);
    this.state.unlock();
    this.state.setProvider(null);
    this.router.navigate(['/']);
  }

  private getFallbackLink(t: TrackInfo): string | null {
    const p = this.provider();
    if (p === 'spotify') return t.spotify_url;
    if (p === 'apple') return t.apple_music_url;
    return t.links?.['youtube_music'] || null;
  }

  get overlayLabel(): string {
    if (!this.overlayReady()) return 'LOADING…';
    if (this.overlayError()) return 'TAP TO OPEN';
    return 'TAP TO PLAY';
  }

  get overlaySub(): string {
    const p = this.provider();
    if (this.overlayError()) return this.overlayError()!;
    if (p === 'youtube') return 'Playing via YouTube';
    if (p === 'spotify') return 'Playing via Spotify';
    if (p === 'apple') return 'Playing via Apple Music';
    return '';
  }
}
