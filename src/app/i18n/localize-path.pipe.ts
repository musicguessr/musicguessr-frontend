import { inject, Pipe, PipeTransform } from '@angular/core';
import { localizedPath } from './locale';
import { TranslationService } from './translation.service';

// `routerLink="/faq"` is an absolute path — Angular's Router navigates
// there exactly as written, dropping any locale prefix the current page is
// under. Used as `[routerLink]="'/faq' | localize"` everywhere an in-app
// link would otherwise silently bounce a Polish/German/Dutch visitor back
// to English on every click.
//
// impure (not `pure: true`) so it re-evaluates when the locale signal
// changes rather than only when its string input changes — the input here
// ("/faq") is usually a template-literal constant that never changes on its
// own, so a pure pipe would never re-run after the first render even though
// the *output* needs to.
@Pipe({ name: 'localize', standalone: true, pure: false })
export class LocalizePathPipe implements PipeTransform {
  private i18n = inject(TranslationService);

  transform(path: string): string {
    return localizedPath(this.i18n.locale(), path);
  }
}
