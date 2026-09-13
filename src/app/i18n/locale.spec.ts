import { isLocale, localizedPath, stripLocalePrefix } from './locale';

describe('localizedPath', () => {
  it('leaves English unprefixed, including the root path', () => {
    expect(localizedPath('en', '/faq')).toBe('/faq');
    expect(localizedPath('en', '/')).toBe('/');
  });

  it('prefixes every other locale', () => {
    expect(localizedPath('pl', '/faq')).toBe('/pl/faq');
    expect(localizedPath('de', '/create-deck')).toBe('/de/create-deck');
  });

  it('collapses the root path to just the bare locale segment, not a trailing slash', () => {
    expect(localizedPath('nl', '/')).toBe('/nl');
  });
});

describe('stripLocalePrefix', () => {
  it('removes a known locale prefix', () => {
    expect(stripLocalePrefix('/pl/faq')).toBe('/faq');
    expect(stripLocalePrefix('/de/create-deck')).toBe('/create-deck');
  });

  it('reduces a bare locale segment to the root path', () => {
    expect(stripLocalePrefix('/nl')).toBe('/');
  });

  it('leaves an already-unprefixed path untouched', () => {
    expect(stripLocalePrefix('/faq')).toBe('/faq');
  });

  // The whole point of checking isLocale() before stripping: a path that
  // merely starts with two letters isn't necessarily under a locale prefix.
  it('does not strip a two-letter first segment that is not an actual locale', () => {
    expect(stripLocalePrefix('/xx/faq')).toBe('/xx/faq');
  });

  it('never strips the English "locale" (it has no prefix to strip)', () => {
    expect(stripLocalePrefix('/en/faq')).toBe('/en/faq');
  });

  it('round-trips with localizedPath for every non-default locale', () => {
    for (const locale of ['pl', 'de', 'nl'] as const) {
      const path = '/how-to-play';
      expect(stripLocalePrefix(localizedPath(locale, path))).toBe(path);
    }
  });
});

describe('isLocale', () => {
  it('accepts every configured locale', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('pl')).toBe(true);
    expect(isLocale('de')).toBe(true);
    expect(isLocale('nl')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});
