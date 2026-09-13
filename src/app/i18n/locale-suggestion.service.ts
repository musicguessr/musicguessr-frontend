import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { DEFAULT_LOCALE, isLocale, Locale, localizedPath, stripLocalePrefix } from './locale';
import { TranslationService } from './translation.service';

// Whether this browser has ever been shown (or was never eligible for) the
// suggestion, regardless of outcome — set the moment it's decided, so it
// never asks twice.
const STORAGE_KEY = 'oh_locale_prompted';

// Suggests switching language based on navigator.language — but only ever
// suggests, never redirects automatically. Google explicitly recommends
// against auto-redirecting on perceived language/location: it stops both
// users *and* crawlers from reaching the exact page they asked for, which
// would also undermine the whole point of the hreflang/locale-routing setup
// elsewhere in this app (see SeoService). This is client-side-only UX on
// top of that, not a replacement for it.
@Injectable({ providedIn: 'root' })
export class LocaleSuggestionService {
  private platformId = inject(PLATFORM_ID);
  private i18n = inject(TranslationService);
  private router = inject(Router);

  readonly suggested = signal<Locale | null>(null);

  // Called once from AppComponent.ngOnInit(). Waits for the first completed
  // navigation rather than checking immediately: the active locale is set by
  // a route resolver (see locale-route.ts), which hasn't necessarily run yet
  // when the root component's own ngOnInit fires — checking too early would
  // always see the signal's initial 'en' default, even for someone who
  // followed a link straight to /pl/faq.
  init(): void {
    if (!isPlatformBrowser(this.platformId) || this.alreadyPrompted()) {
      return;
    }
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => this.checkOnce());
  }

  private checkOnce(): void {
    if (this.i18n.locale() !== DEFAULT_LOCALE) {
      // Already on a non-English page — arrived via a bookmarked locale
      // URL, a locale-specific search result, or the manual switcher.
      // Nothing to suggest either way.
      this.markPrompted();
      return;
    }
    const preferred = this.preferredSupportedLocale();
    if (preferred) {
      this.suggested.set(preferred);
    }
    // Marked regardless of whether a match was found — a browser with no
    // supported preferred language shouldn't be re-checked every visit.
    this.markPrompted();
  }

  private preferredSupportedLocale(): Locale | null {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const primary = lang.split('-')[0].toLowerCase();
      if (isLocale(primary) && primary !== DEFAULT_LOCALE) {
        return primary;
      }
    }
    return null;
  }

  accept(): void {
    const locale = this.suggested();
    if (!locale) {
      return;
    }
    this.suggested.set(null);
    const currentPath = stripLocalePrefix(this.router.url.split(/[?#]/)[0]);
    this.router.navigateByUrl(localizedPath(locale, currentPath));
  }

  dismiss(): void {
    this.suggested.set(null);
  }

  // Called by LanguageSwitcherComponent on every manual click — someone who
  // has already found and used the switcher has no need for the suggestion,
  // now or on a future visit.
  markHandled(): void {
    this.suggested.set(null);
    this.markPrompted();
  }

  private alreadyPrompted(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Storage unavailable (see GameStateService's resolveStorage for the
      // same reasoning) — fail toward not pestering the user rather than
      // showing the banner on every single visit.
      return true;
    }
  }

  private markPrompted(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* non-fatal — worst case this asks again next visit */
    }
  }
}
