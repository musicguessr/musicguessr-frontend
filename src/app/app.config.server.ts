import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, RenderMode, withRoutes } from '@angular/ssr';
import { ServerRoute } from '@angular/ssr';
import { appConfig } from './app.config';
import { LOCALES } from './i18n/locale';

// Static, indexable content — good prerender candidates (see
// prerender-routes.txt). Kept as the single list both the unprefixed
// (English) and every locale-prefixed route below are generated from, so a
// route added here automatically gets prerendered in all four languages
// instead of someone having to remember to duplicate it three more times.
const INDEXABLE_ROUTES = ['', 'create-deck', 'how-to-play', 'faq'];

function prerenderRoutes(prefix: string): ServerRoute[] {
  return INDEXABLE_ROUTES.map((route) => ({
    path: prefix ? (route ? `${prefix}/${route}` : prefix) : route,
    renderMode: RenderMode.Prerender,
  }));
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(
      withRoutes([
        ...prerenderRoutes(''),
        ...LOCALES.filter((l) => l !== 'en').flatMap((l) => prerenderRoutes(l)),
        { path: '**', renderMode: RenderMode.Client },
      ]),
    ),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
