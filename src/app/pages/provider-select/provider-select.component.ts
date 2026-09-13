import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameStateService, Provider, VideoBlur } from '../../services/game-state.service';
import { SpotifyService } from '../../services/spotify.service';
import { AppleMusicService } from '../../services/apple-music.service';
import { YoutubePlayerService } from '../../services/youtube-player.service';
import { ConfigService } from '../../services/config.service';
import { DeckService } from '../../services/deck.service';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';
import { localizedPath } from '../../i18n/locale';
import { isIOSDevice } from '../../services/platform';

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
  imports: [TitleCasePipe, RouterLink, FormsModule, LanguageSwitcherComponent, LocalizePathPipe],
  templateUrl: './provider-select.component.html',
  styleUrl: './provider-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProviderSelectComponent implements OnInit {
  private router = inject(Router);
  private state = inject(GameStateService);
  private spotify = inject(SpotifyService);
  private apple = inject(AppleMusicService);
  private ytPlayer = inject(YoutubePlayerService);
  private config = inject(ConfigService);
  private deckService = inject(DeckService);
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly selected = signal<Provider>(null);
  readonly videoBlur = this.state.videoBlur;
  readonly ytVariants = this.state.ytVariants;

  // Custom deck entry
  readonly deckInput = signal('');
  readonly deckLoading = signal(false);
  readonly deckError = signal<string | null>(null);

  // computed (not a static field) so a language switch while still on this
  // page — before confirm() locks anything in — updates the labels shown.
  readonly blurOptions = computed((): { value: VideoBlur; label: string; icon: string }[] => [
    { value: 'hidden', label: this.i18n.t('providerSelect.blurHidden'), icon: '🙈' },
    { value: 'blurred', label: this.i18n.t('providerSelect.blurBlurred'), icon: '👁' },
    { value: 'visible', label: this.i18n.t('providerSelect.blurVisible'), icon: '👀' },
  ]);

  readonly providers = computed((): ProviderOption[] => [
    {
      id: 'youtube',
      label: this.i18n.t('providerSelect.ytLabel'),
      icon: '▶',
      description: this.i18n.t('providerSelect.ytDesc'),
      available: true,
    },
    {
      id: 'spotify',
      label: this.i18n.t('providerSelect.spotifyLabel'),
      icon: '♫',
      description: this.i18n.t('providerSelect.spotifyDesc'),
      available: !!this.config.spotifyClientId,
      unavailableReason: this.i18n.t('providerSelect.unavailable'),
    },
    {
      id: 'apple',
      label: this.i18n.t('providerSelect.appleLabel'),
      icon: '♪',
      description: this.i18n.t('providerSelect.appleDesc'),
      available: !!this.config.appleDevToken,
      unavailableReason: this.i18n.t('providerSelect.unavailable'),
    },
  ]);

  // Web Playback SDK never works on iOS Safari (WebKit blocks the Web Audio
  // API it needs) — Spotify playback there is instead handed off via
  // Spotify Connect to the real app, which only works if that app is
  // already running. There's no way to check or force that from the
  // browser, so the best we can do is warn up front instead of a silent
  // "nothing happened" after the card is scanned.
  readonly isIOS = isIOSDevice();

  ngOnInit(): void {
    this.seo.set({
      title: this.i18n.t('providerSelect.seoTitle'),
      description: this.i18n.t('providerSelect.seoDescription'),
      noindex: true,
    });

    // Pre-select if returning
    const p = this.state.provider();
    if (p) {
      this.selected.set(p);
    }
  }

  private goTo(path: string): void {
    this.router.navigateByUrl(localizedPath(this.i18n.locale(), path));
  }

  select(p: Provider): void {
    if (!p) {
      return;
    }
    const opt = this.providers().find((x) => x.id === p);
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
        // Fire-and-forget: start the YouTube IFrame API script loading now
        // instead of waiting until the game page mounts after a card is
        // scanned. The script doesn't depend on which video will play, only
        // on which provider was chosen — by the time preparePlayer() calls
        // loadAPI() again there, it's often already resolved (dedup makes
        // the second call a no-op), shaving the "LOADING…" wait after tap.
        void this.ytPlayer.loadAPI().catch(() => {
          /* speculative — the real attempt in preparePlayer() surfaces any error */
        });
        this.goTo('/scan');
        return;
      }

      if (p === 'spotify') {
        const token = this.state.getSpotifyToken();
        if (token) {
          this.state.lock();
          // Same idea as YouTube above — get the Web Playback SDK connecting
          // now rather than waiting until the game page mounts.
          void this.spotify.initSDK().catch(() => {
            /* speculative — the real attempt in preparePlayer() surfaces any error */
          });
          this.goTo('/scan');
        } else {
          await this.spotify.authorize(); // redirects away
        }
        return;
      }

      if (p === 'apple') {
        const token = this.state.getAppleMusicToken();
        if (token) {
          this.state.lock();
          void this.apple.init().catch(() => {
            /* speculative — the real attempt in preparePlayer() surfaces any error */
          });
          this.goTo('/scan');
        } else {
          await this.apple.authorize();
          this.state.lock();
          this.goTo('/scan');
        }
        return;
      }
    } catch (e: any) {
      this.errorMsg.set(e.message || this.i18n.t('providerSelect.errSomethingWrong'));
    } finally {
      this.loading.set(false);
    }
  }

  // Best-effort convenience for the iOS Connect-handoff notice below — opens
  // the Spotify app if installed (does nothing harmful if it isn't). Can't
  // detect success or bring the user back to this tab automatically; they
  // have to switch back themselves.
  openSpotifyApp(): void {
    window.location.href = 'spotify:';
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
    this.state.clearCustomDeck();
    this.selected.set(null);
  }

  async loadCustomDeck(): Promise<void> {
    const raw = this.deckInput().trim();
    if (!raw) {
      return;
    }

    // Accept full URL or bare ID
    // Tolerates a pasted share URL with a trailing slash, query or fragment.
    const id = raw.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() ?? raw;

    this.deckLoading.set(true);
    this.deckError.set(null);
    try {
      // Try cache first
      let deck = this.deckService.getCachedDeck(id);
      if (!deck || new Date(deck.expires_at) < new Date()) {
        deck = await this.deckService.getDeck(id);
        this.deckService.cacheDeck(deck);
        this.deckService.saveLocalDeckEntry(deck);
      }
      this.goTo(`/deck/${id}`);
    } catch (e: any) {
      this.deckError.set(e.message ?? this.i18n.t('providerSelect.errFailedToLoadDeck'));
    } finally {
      this.deckLoading.set(false);
    }
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
