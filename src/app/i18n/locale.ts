// English has no URL prefix (musicguessr.app/faq) since it's the language
// the app was originally built and indexed in — changing that would mean
// re-earning every bit of existing SEO standing under a new URL. Every other
// locale gets a path prefix (musicguessr.app/pl/faq): the conventional,
// Google-recommended way to make each language its own crawlable URL
// without ccTLDs, subdomains, or a second deployment.
export type Locale = 'en' | 'pl' | 'de' | 'nl';

export const DEFAULT_LOCALE: Locale = 'en';

// Order here is display order in the language switcher.
export const LOCALES: Locale[] = ['en', 'pl', 'de', 'nl'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  nl: 'Nederlands',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

// Builds a URL path for `path` (e.g. "/faq", "/") in the given locale.
// English gets no prefix; every other locale gets "/{locale}" prepended,
// with the root path collapsing to just "/{locale}" rather than
// "/{locale}/" — both this function and the router's route definitions
// (see app.routes.ts) need to agree on that exact shape.
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === '/' ? '' : path;
  return locale === DEFAULT_LOCALE ? clean || '/' : `/${locale}${clean}`;
}

// Inverse of localizedPath: given the router's current URL (which may carry
// a locale prefix), returns the unprefixed path family so the language
// switcher can rebuild it under a different locale. Only strips a prefix
// that's actually a known non-default locale — "/design-tips" doesn't lose
// its first segment just because it happens to start with a two-letter
// sequence that isn't one.
export function stripLocalePrefix(path: string): string {
  const match = /^\/([a-z]{2})(\/.*)?$/.exec(path);
  if (match && isLocale(match[1]) && match[1] !== DEFAULT_LOCALE) {
    return match[2] ?? '/';
  }
  return path;
}
