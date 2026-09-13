import { inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { AppErrorService } from './app-error.service';
import { TranslationService } from '../i18n/translation.service';

// Without this, a service worker is a liability rather than a feature: a
// client pins itself to the app version it loaded and would otherwise keep
// serving it from cache indefinitely, so a deployed fix might never reach
// someone who keeps the tab or installed PWA around.
//
// That same version pinning is what fixes the chunk-load failures this app
// already handles in GlobalErrorHandler — the worker keeps serving the
// version a client booted with, so a lazy route loaded after a deploy still
// resolves to the chunks that client's index.html expects, instead of
// 404ing against freshly hashed filenames.
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private swUpdate = inject(SwUpdate);
  private appError = inject(AppErrorService);
  private i18n = inject(TranslationService);

  // Drives an unobtrusive prompt rather than reloading on its own: a forced
  // reload mid-round would yank the page out from under someone who is
  // partway through a card.
  readonly updateAvailable = signal(false);

  init(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') {
        this.updateAvailable.set(true);
      }
    });

    // The cached files this client is pinned to are gone and can't be
    // re-fetched (cache evicted under storage pressure, or the version was
    // cleaned up server-side). Nothing works from here without a reload, so
    // this is the one case that warrants the fatal overlay.
    this.swUpdate.unrecoverable.subscribe(() => {
      this.appError.reportFatal(this.i18n.t('app.fatalNewVersion'));
    });
  }

  async applyUpdate(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // Activation failing shouldn't block the reload — the fresh load will
      // pick up the new version regardless.
    }
    window.location.reload();
  }
}
