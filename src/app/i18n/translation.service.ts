import { computed, Injectable, signal } from '@angular/core';
import { DEFAULT_LOCALE, Locale } from './locale';
import { en, Translations } from './translations/en';
import { pl } from './translations/pl';
import { de } from './translations/de';
import { nl } from './translations/nl';

const DICTIONARIES: Record<Locale, Translations> = { en, pl, de, nl };

// Interpolates {{placeholder}} tokens — the only templating this app's
// strings need (a count, a provider name, a reason). Not a general ICU
// engine: pluralization is handled by picking between two whole dictionary
// keys (e.g. cardsCountOne/cardsCountMany) at the call site instead, since
// only Polish among these four languages needs more than a singular/plural
// split and even that's a deliberate simplification — see pl.ts's comment
// on cardsCountMany.
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

// Locale is set once per navigation, synchronously, before any component
// under that route renders — see localeResolver in locale-route.ts, the
// only intended caller of setLocale(). It's a plain writable signal rather
// than something derived from the router's own state so translation.t()
// keeps working the same way whether the active route came from Angular's
// router or (in tests) was never routed at all.
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly _locale = signal<Locale>(DEFAULT_LOCALE);
  readonly locale = this._locale.asReadonly();

  private readonly dict = computed(() => DICTIONARIES[this._locale()]);

  setLocale(locale: Locale): void {
    this._locale.set(locale);
  }

  // Reads a dot-path key (e.g. "landing.heroTitle") out of the active
  // locale's dictionary. Called from templates as `i18n.t('...')`; since it
  // reads the `dict` computed (itself reading the `_locale` signal), Angular
  // tracks the read the same way it would a direct signal call in an
  // OnPush template, so a locale change re-renders every t() call on screen.
  //
  // Untyped by key on purpose: a typed overload for every nested path in
  // Translations would need a mapped-type path-string generator, which is a
  // lot of machinery for an app with a few dozen call sites — the payoff
  // (catching a typo'd key at compile time) is smaller here than
  // `satisfies Translations` already gives by catching a missing
  // *translation*, which is the failure mode that actually costs someone an
  // English string appearing on a Polish page.
  t(path: string, params?: Record<string, string | number>): string {
    const value = path.split('.').reduce<unknown>((node, segment) => {
      if (node && typeof node === 'object' && segment in node) {
        return (node as Record<string, unknown>)[segment];
      }
      return undefined;
    }, this.dict());
    if (typeof value !== 'string') {
      // Never throw from a template — a missing/mistyped key should degrade
      // to a visibly-wrong-but-harmless string, not take down the page.
      return path;
    }
    return params ? interpolate(value, params) : value;
  }

  // Typed accessor for array content (FAQ items) that t()'s string-only
  // return can't express — used directly rather than through t().
  faqItems(): Translations['faq']['items'] {
    return this.dict().faq.items;
  }
}
