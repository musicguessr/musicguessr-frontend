import { ErrorHandler, inject, Injectable, NgZone } from '@angular/core';
import { AppErrorService } from './app-error.service';
import { ClientErrorReporterService } from './client-error-reporter.service';
import { TranslationService } from '../i18n/translation.service';

// Chunk-load failures are the single most common uncaught error in a
// deployed SPA: a tab stays open across a deploy, then navigates to a
// lazy-loaded route whose content-hashed JS filename no longer exists on
// the server (the old index.html is still cached). The fix isn't a bug fix,
// it's a reload — so this case gets its own, more actionable message.
const CHUNK_LOAD_PATTERN = /Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError/i;

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private appError = inject(AppErrorService);
  private zone = inject(NgZone);
  private reporter = inject(ClientErrorReporterService);
  private i18n = inject(TranslationService);

  handleError(error: unknown): void {
    // Always log to the console — devtools / a real error-tracking SDK
    // dropped in later both hook in here regardless of what the UI does.
    console.error(error);

    const message = error instanceof Error ? error.message : String(error);
    this.reporter.report({
      message,
      stack: error instanceof Error ? error.stack : undefined,
      context: 'global-error-handler',
    });
    // Only a chunk-load failure is truly unrecoverable without a reload.
    // Blocking the whole app for every other uncaught error (a rejected
    // clipboard write, a late callback from a destroyed player) turned
    // harmless background failures into a full-screen dead end; those are
    // still logged and reported above.
    if (!CHUNK_LOAD_PATTERN.test(message)) {
      return;
    }
    // handleError can be invoked from outside Angular's zone (e.g. a
    // rejected promise from a non-patched async callback) — run inside the
    // zone explicitly so the signal write reliably triggers change detection.
    this.zone.run(() => this.appError.reportFatal(this.i18n.t('app.fatalNewVersion')));
  }
}
