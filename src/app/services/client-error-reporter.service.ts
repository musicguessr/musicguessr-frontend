import { inject, Injectable } from '@angular/core';
import { ConfigService } from './config.service';

export type ClientErrorReport = {
  message: string;
  stack?: string;
  context?: string;
};

// A no-cost stand-in for a real error-tracking service: without this, a
// client-only failure (an uncaught exception, or the scanner's camera
// working but QR detection silently never succeeding on some hardened/
// privacy browsers — see musicguessr-frontend#7) leaves zero trace anywhere
// we can see, since nothing about it ever reaches the backend on its own.
@Injectable({ providedIn: 'root' })
export class ClientErrorReporterService {
  private config = inject(ConfigService);

  // Fire-and-forget by design: reporting a bug must never itself throw,
  // block the caller, or surface a new error. `keepalive` lets the request
  // survive a report fired right before navigation (e.g. the user tapping
  // "SCAN CARD" again right as a scanner timeout fires).
  report(payload: ClientErrorReport): void {
    try {
      const body = JSON.stringify({
        ...payload,
        url: typeof location !== 'undefined' ? location.href : undefined,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      fetch(`${this.config.apiUrl}/api/client-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        /* best-effort — nothing to do if the report itself fails */
      });
    } catch {
      /* non-fatal */
    }
  }
}
