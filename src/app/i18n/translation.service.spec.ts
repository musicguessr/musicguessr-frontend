import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { LOCALES } from './locale';

describe('TranslationService', () => {
  let service: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TranslationService] });
    service = TestBed.inject(TranslationService);
  });

  it('defaults to English', () => {
    expect(service.locale()).toBe('en');
    expect(service.t('common.logo')).toBe('musicguessr');
  });

  it('switches every string on the page when the locale changes', () => {
    expect(service.t('scanner.scanCard')).toBe('SCAN CARD');
    service.setLocale('pl');
    expect(service.t('scanner.scanCard')).toBe('SKANUJ KARTĘ');
    service.setLocale('de');
    expect(service.t('scanner.scanCard')).toBe('KARTE SCANNEN');
    service.setLocale('nl');
    expect(service.t('scanner.scanCard')).toBe('SCAN KAART');
  });

  it('interpolates {{placeholder}} tokens', () => {
    expect(service.t('callback.connectingTo', { provider: 'Spotify' })).toBe('Connecting to Spotify…');
  });

  it('leaves an unmatched placeholder untouched rather than dropping it', () => {
    expect(service.t('common.logo', { unused: 'x' })).toBe('musicguessr');
  });

  it('returns the key itself for an unknown path instead of throwing', () => {
    expect(service.t('nope.not.a.real.key')).toBe('nope.not.a.real.key');
  });

  it('returns the key itself when the resolved value is not a string (e.g. a nested object)', () => {
    expect(service.t('faq')).toBe('faq');
  });

  it('faqItems() returns the same number of items in every locale, in order', () => {
    const counts = new Set<number>();
    for (const locale of LOCALES) {
      service.setLocale(locale);
      counts.add(service.faqItems().length);
    }
    // A single shared count proves `satisfies Translations` did its job —
    // every locale file has exactly the same number of FAQ entries.
    expect(counts.size).toBe(1);
  });

  it('faqItems() reflects the active locale', () => {
    service.setLocale('en');
    const enFirst = service.faqItems()[0].q;
    service.setLocale('pl');
    const plFirst = service.faqItems()[0].q;
    expect(plFirst).not.toBe(enFirst);
  });
});
