import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameStateService } from './services/game-state.service';
import { TranslationService } from './i18n/translation.service';
import { Locale, LOCALES, localizedPath } from './i18n/locale';
import { localeResolver } from './i18n/locale-route';

// Redirects to `path` in whichever locale is currently active — reads it
// from TranslationService rather than the URL directly since the resolver
// that sets it (localeResolver) has already run by the time any guard on a
// child route executes. A guard that hardcoded `/play` would silently drop
// a Polish/German/Dutch player back onto the English route on every auth
// failure, which is worse than the English-only behavior this replaces:
// at least that was uniformly English, not "usually your language, but not
// when something goes wrong."
function redirectLocalized(path: string): boolean {
  const i18n = inject(TranslationService);
  const router = inject(Router);
  router.navigateByUrl(localizedPath(i18n.locale(), path));
  return false;
}

// The route definitions themselves, shared verbatim across the unprefixed
// (English) tree and every locale-prefixed tree below — a route's path and
// loadComponent don't change per locale, only which dictionary
// TranslationService serves while it's active.
const pageRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'play',
    loadComponent: () =>
      import('./pages/provider-select/provider-select.component').then((m) => m.ProviderSelectComponent),
  },
  {
    path: 'how-to-play',
    loadComponent: () => import('./pages/how-to-play/how-to-play.component').then((m) => m.HowToPlayComponent),
  },
  {
    path: 'faq',
    loadComponent: () => import('./pages/faq/faq.component').then((m) => m.FaqComponent),
  },
  {
    path: 'scan',
    loadComponent: () => import('./pages/scanner/scanner.component').then((m) => m.ScannerComponent),
    canActivate: [
      (): boolean => {
        const state = inject(GameStateService);
        // `provider()` alone isn't enough — it can be set (persisted to
        // localStorage) without a valid session, e.g. the user picked Spotify
        // then abandoned the OAuth redirect. hasAuth() checks the actual token.
        if (!state.provider() || !state.hasAuth()) {
          return redirectLocalized('/play');
        }
        return true;
      },
    ],
  },
  {
    path: 'game',
    loadComponent: () => import('./pages/game/game.component').then((m) => m.GameComponent),
    canActivate: [
      (): boolean => {
        const state = inject(GameStateService);
        if (!state.provider() || !state.hasAuth()) {
          return redirectLocalized('/play');
        }
        if (!state.currentTrack() && !state.isCustomDeckMode()) {
          return redirectLocalized('/scan');
        }
        return true;
      },
    ],
  },
  {
    path: 'callback',
    loadComponent: () => import('./pages/callback/callback.component').then((m) => m.CallbackComponent),
  },
  {
    path: 'create-deck',
    loadComponent: () => import('./pages/create-deck/create-deck.component').then((m) => m.CreateDeckComponent),
  },
  {
    path: 'deck',
    loadComponent: () => import('./pages/deck-list/deck-list.component').then((m) => m.DeckListComponent),
  },
  {
    path: 'deck/:id',
    loadComponent: () => import('./pages/deck-detail/deck-detail.component').then((m) => m.DeckDetailComponent),
  },
];

// One locale-prefixed branch per non-default locale (see locale.ts —
// English deliberately has none). `resolve` runs before any child route's
// own guards/components, so TranslationService is already serving the
// right dictionary by the time e.g. the `scan` guard above reads it.
function localizedRoutes(locale: Locale): Routes {
  return [
    {
      path: locale,
      resolve: { locale: localeResolver(locale) },
      children: pageRoutes,
    },
  ];
}

export const routes: Routes = [
  ...LOCALES.filter((l) => l !== 'en').flatMap(localizedRoutes),
  // A path:'' wrapper contributes zero URL segments of its own (so English
  // stays unprefixed, "/faq" not "/en/faq") but still runs its resolve
  // before pageRoutes' children — without this, navigating from a locale
  // branch (e.g. /pl/faq) straight to an unprefixed URL (e.g. /faq) would
  // leave TranslationService still serving Polish, since nothing would ever
  // reset it back to English.
  {
    path: '',
    resolve: { locale: localeResolver('en') },
    children: pageRoutes,
  },
  { path: '**', redirectTo: '' },
];
