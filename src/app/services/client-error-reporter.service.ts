import { inject, Injectable } from '@angular/core';
import { ConfigService } from './config.service';
import { SessionIdService } from './session-id.service';

export type ClientErrorReport = {
  message: string;
  stack?: string;
  context?: string;
  // The /api/resolve request_id this report relates to, if any (e.g. a
  // YouTube-blocked report for the card that request resolved) — lets a
  // maintainer grep straight to that request's own backend log line.
  requestId?: string;
  // "info" marks a diagnostic event rather than a failure (e.g. a successful
  // scan, so failure rates have a denominator). The backend logs it as a
  // "client event" at INFO instead of a "client error report" at WARN.
  level?: 'info';
  // Flat, measured diagnostics — become queryable fields (details.<key>) in
  // the logs. Keys must be snake_case; nested values are dropped server-side.
  details?: Record<string, string | number | boolean>;
};

// A no-cost stand-in for a real error-tracking service: without this, a
// client-only failure (an uncaught exception, or the scanner's camera
// working but QR detection silently never succeeding on some hardened/
// privacy browsers — see musicguessr-frontend#7) leaves zero trace anywhere
// we can see, since nothing about it ever reaches the backend on its own.
@Injectable({ providedIn: 'root' })
export class ClientErrorReporterService {
  private config = inject(ConfigService);
  private sessionId = inject(SessionIdService);

  // Fire-and-forget by design: reporting a bug must never itself throw,
  // block the caller, or surface a new error. `keepalive` lets the request
  // survive a report fired right before navigation (e.g. the user tapping
  // "SCAN CARD" again right as a scanner timeout fires).
  report(payload: ClientErrorReport): void {
    try {
      const { requestId, ...rest } = payload;
      const body = JSON.stringify({
        ...rest,
        url: typeof location !== 'undefined' ? location.href : undefined,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        request_id: requestId,
      });
      fetch(`${this.config.apiUrl}/api/client-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': this.sessionId.id },
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
