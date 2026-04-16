import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { GameStateService, Provider, VideoBlur } from '../../services/game-state.service';
import { SpotifyService } from '../../services/spotify.service';
import { AppleMusicService } from '../../services/apple-music.service';
import { ConfigService } from '../../services/config.service';

type ProviderOption = {
  id: Provider;
  label: string;
  icon: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
};

@Component({
  selector: 'app-provider-select',
  standalone: true,
  imports: [TitleCasePipe],
  templateUrl: './provider-select.component.html',
  styleUrl: './provider-select.component.scss',
})
export class ProviderSelectComponent implements OnInit {
  private router = inject(Router);
  private state = inject(GameStateService);
  private spotify = inject(SpotifyService);
  private apple = inject(AppleMusicService);
  private config = inject(ConfigService);

  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly selected = signal<Provider>(null);
  readonly videoBlur = this.state.videoBlur;
  readonly ytVariants = this.state.ytVariants;

  readonly blurOptions: { value: VideoBlur; label: string; icon: string }[] = [
    { value: 'hidden', label: 'Hidden', icon: '🙈' },
    { value: 'blurred', label: 'Blurred', icon: '👁' },
    { value: 'visible', label: 'Visible', icon: '👀' },
  ];

  providers: ProviderOption[] = [];

  ngOnInit(): void {
    this.providers = [
      {
        id: 'youtube',
        label: 'YouTube',
        icon: '▶',
        description: 'Free · No login required · Works everywhere',
        available: true,
      },
      {
        id: 'spotify',
        label: 'Spotify',
        icon: '♫',
        description: 'Requires Spotify Premium',
        available: !!this.config.spotifyClientId,
        unavailableReason: 'Spotify not configured on this instance',
      },
      {
        id: 'apple',
        label: 'Apple Music',
        icon: '',
        description: 'Requires Apple Music subscription',
        available: !!this.config.appleDevToken,
        unavailableReason: 'Apple Music not configured on this instance',
      },
    ];

    // Pre-select if returning
    const p = this.state.provider();
    if (p) {
      this.selected.set(p);
    }
  }

  select(p: Provider): void {
    if (!p) {
      return;
    }
    const opt = this.providers.find((x) => x.id === p);
    if (!opt?.available) {
      return;
    }
    this.selected.set(p);
  }

  async confirm(): Promise<void> {
    const p = this.selected();
    if (!p) {
      return;
    }
    this.errorMsg.set(null);
    this.loading.set(true);

    try {
      this.state.setProvider(p);

      if (p === 'youtube') {
        this.state.lock();
        this.router.navigate(['/scan']);
        return;
      }

      if (p === 'spotify') {
        const token = this.state.getSpotifyToken();
        if (token) {
          this.state.lock();
          this.router.navigate(['/scan']);
        } else {
          await this.spotify.authorize(); // redirects away
        }
        return;
      }

      if (p === 'apple') {
        const token = this.state.getAppleMusicToken();
        if (token) {
          this.state.lock();
          this.router.navigate(['/scan']);
        } else {
          await this.apple.authorize();
          this.state.lock();
          this.router.navigate(['/scan']);
        }
        return;
      }
    } catch (e: any) {
      this.errorMsg.set(e.message || 'Something went wrong');
    } finally {
      this.loading.set(false);
    }
  }

  setBlur(v: VideoBlur): void {
    this.state.setVideoBlur(v);
  }

  toggleYtVariants(): void {
    this.state.setYtVariants(!this.state.ytVariants());
  }

  changeProvider(): void {
    this.state.unlock();
    this.state.setProvider(null);
    this.selected.set(null);
  }

  isLocked(): boolean {
    return this.state.locked() && !!this.state.provider();
  }

  get currentProvider(): Provider {
    return this.state.provider();
  }
  get isAuthed(): boolean {
    return this.state.hasAuth();
  }
}
