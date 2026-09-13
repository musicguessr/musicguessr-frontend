import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Locale } from './locale';
import { TranslationService } from './translation.service';

// Sets the active locale before any component under a locale-prefixed route
// branch (see app.routes.ts) renders. A resolver runs and completes before
// the route activates, so this is synchronous from every component's point
// of view — no flash of the wrong language, no need for components to read
// the locale from anywhere except TranslationService.
export function localeResolver(locale: Locale): ResolveFn<void> {
  return () => {
    inject(TranslationService).setLocale(locale);
  };
}
