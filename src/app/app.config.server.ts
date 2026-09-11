import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, RenderMode, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(
      withRoutes([
        { path: '', renderMode: RenderMode.Prerender },
        { path: 'create-deck', renderMode: RenderMode.Prerender },
        // Static, indexable content — good prerender candidates (see
        // prerender-routes.txt). Previously only '' and 'create-deck' were
        // actually prerendered here even though these two were also listed
        // as prerendered in prerender-routes.txt/documentation, so search
        // engines were only ever served the client-rendered shell for them.
        { path: 'how-to-play', renderMode: RenderMode.Prerender },
        { path: 'faq', renderMode: RenderMode.Prerender },
        { path: '**', renderMode: RenderMode.Client },
      ]),
    ),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
