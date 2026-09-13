import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { localizeBackendError } from './backend-error';

describe('localizeBackendError', () => {
  let i18n: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TranslationService] });
    i18n = TestBed.inject(TranslationService);
  });

  it.each([
    ['card not found: deck=aaaa0002 card=00040', 'errors.cardNotFound'],
    ['not a valid Hitster URL', 'errors.invalidCard'],
    ['too many requests, please slow down', 'errors.rateLimited'],
    ['deck has expired', 'errors.deckExpired'],
    ['deck not found', 'errors.deckNotFound'],
    // Contains "unavailable" — must not fall through to the video rule.
    ['playlist is empty or all videos are unavailable', 'errors.playlistEmpty'],
    ['playlist not found or is private', 'errors.playlistNotFound'],
    ['could not verify video right now, try again shortly', 'errors.tryLater'],
    ['video not found or unavailable', 'errors.videoNotFound'],
    ['maximum 300 cards per deck', 'errors.tooManyCards'],
    ['not a youtube.com or youtu.be url', 'errors.invalidVideoUrl'],
  ])('maps "%s" to %s', (backendMessage, key) => {
    expect(localizeBackendError(i18n, backendMessage)).toBe(i18n.t(key));
  });

  it('falls back to a generic message for unknown or missing errors', () => {
    expect(localizeBackendError(i18n, 'failed to save deck')).toBe(i18n.t('errors.server'));
    expect(localizeBackendError(i18n, undefined)).toBe(i18n.t('errors.server'));
  });

  it('returns the message in the active locale', () => {
    i18n.setLocale('pl');
    expect(localizeBackendError(i18n, 'card not found: deck=x card=1')).toBe(
      'Nie znaleźliśmy tej karty — ta edycja może jeszcze nie być obsługiwana.',
    );
  });
});
