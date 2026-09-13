import { TranslationService } from './translation.service';

// The backend answers errors in English ("card not found: deck=…", "playlist
// is empty or all videos are unavailable"). Showing those verbatim put English
// sentences into the Polish/German/Dutch UI, so known messages map to
// translated ones. Order matters: more specific patterns first.
const RULES: [RegExp, string][] = [
  [/too many requests/i, 'errors.rateLimited'],
  [/not a valid hitster url/i, 'errors.invalidCard'],
  [/card not found/i, 'errors.cardNotFound'],
  [/deck has expired/i, 'errors.deckExpired'],
  [/deck not found|invalid deck id|missing deck id/i, 'errors.deckNotFound'],
  [/playlist is empty/i, 'errors.playlistEmpty'],
  [/playlist not found|is private/i, 'errors.playlistNotFound'],
  [/try again shortly/i, 'errors.tryLater'],
  [/video not found|unavailable/i, 'errors.videoNotFound'],
  [/maximum \d+ cards/i, 'errors.tooManyCards'],
  [/youtube|invalid (video|playlist|url)|url too long|missing url/i, 'errors.invalidVideoUrl'],
];

export function localizeBackendError(i18n: TranslationService, message: string | null | undefined): string {
  if (message) {
    for (const [pattern, key] of RULES) {
      if (pattern.test(message)) {
        return i18n.t(key);
      }
    }
  }
  return i18n.t('errors.server');
}
