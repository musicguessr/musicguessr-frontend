import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OAUTH_LOCALE_KEY, SpotifyService } from '../../services/spotify.service';
import { GameStateService } from '../../services/game-state.service';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { isLocale, localizedPath } from '../../i18n/locale';

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="callback-page">
      <div class="logo">{{ i18n.t('common.logo') }}</div>
      @if (!error()) {
        <span class="spinner large"></span>
        <p class="msg">{{ i18n.t('callback.connectingTo', { provider: provider() }) }}</p>
      } @else {
        <p class="error">{{ error() }}</p>
        <button class="btn btn-ghost" (click)="goHome()">{{ i18n.t('callback.goBack') }}</button>
      }
    </div>
  `,
  styles: [
    `
      .callback-page {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 32px;
      }
      .logo {
        font-family: var(--font-display);
        font-size: 1.8rem;
        letter-spacing: 2px;
        color: var(--accent);
        margin-bottom: 16px;
      }
      .msg {
        font-size: 0.9rem;
        color: var(--muted);
      }
      .error {
        color: #ff6b6b;
        font-size: 0.9rem;
        text-align: center;
      }
      .spinner.large {
        width: 36px;
        height: 36px;
        border-width: 3px;
        margin: 0;
      }
    `,
  ],
})
export class CallbackComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private spotify = inject(SpotifyService);
  private state = inject(GameStateService);
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  readonly error = signal<string | null>(null);
  readonly provider = signal<string>('Spotify');

  async ngOnInit(): Promise<void> {
    // Restore the language the player started the Spotify login from.
    const savedLocale = sessionStorage.getItem(OAUTH_LOCALE_KEY);
    sessionStorage.removeItem(OAUTH_LOCALE_KEY);
    if (savedLocale && isLocale(savedLocale)) {
      this.i18n.setLocale(savedLocale);
    }
    this.seo.set({ title: this.i18n.t('callback.seoTitle'), noindex: true });
    const params = this.route.snapshot.queryParams;
    const code = params['code'];
    const errorParam = params['error'];

    if (errorParam) {
      // Spotify error codes are short snake_case identifiers; anything else
      // is attacker-controlled text we shouldn't display verbatim.
      const reason = /^[a-z_]{1,40}$/.test(errorParam) ? errorParam : 'unknown_error';
      this.error.set(this.i18n.t('callback.errAuthDenied', { reason }));
      return;
    }

    if (code) {
      try {
        await this.spotify.handleCallback(code);
        this.state.setProvider('spotify');
        this.state.lock();
        this.router.navigateByUrl(localizedPath(this.i18n.locale(), '/scan'));
      } catch (e: any) {
        this.error.set(e.message || this.i18n.t('callback.errTokenExchange'));
      }
      return;
    }

    this.error.set(this.i18n.t('callback.errNoCode'));
  }

  goHome(): void {
    this.router.navigateByUrl(localizedPath(this.i18n.locale(), '/'));
  }
}
