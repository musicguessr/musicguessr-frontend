import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Locale, LOCALE_LABELS, LOCALES, localizedPath, stripLocalePrefix } from './locale';
import { TranslationService } from './translation.service';
import { LocaleSuggestionService } from './locale-suggestion.service';

// Preserves the current page across a language switch (landing -> landing,
// faq -> faq, ...) rather than always sending the user back home — computed
// from the router's own current URL (with any existing locale prefix
// stripped) instead of each page passing its path in, so this drops into
// any page's header with zero per-page wiring.
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="lang-switcher">
      @for (l of locales; track l; let last = $last) {
        <a [class.active]="l === i18n.locale()" [routerLink]="pathFor(l)" (click)="localeSuggestion.markHandled()">{{
          labelFor(l)
        }}</a>
        @if (!last) {
          <span class="lang-sep">·</span>
        }
      }
    </div>
  `,
  styles: [
    `
      .lang-switcher {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
      }
      a {
        color: var(--muted, #888);
        text-decoration: none;
      }
      a.active {
        color: var(--text, #fff);
        font-weight: 600;
      }
      .lang-sep {
        color: var(--muted, #888);
        opacity: 0.5;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcherComponent {
  i18n = inject(TranslationService);
  localeSuggestion = inject(LocaleSuggestionService);
  private router = inject(Router);
  readonly locales = LOCALES;

  labelFor(l: Locale): string {
    return LOCALE_LABELS[l];
  }

  pathFor(l: Locale): string {
    const current = this.router.url.split(/[?#]/)[0];
    return localizedPath(l, stripLocalePrefix(current));
  }
}
