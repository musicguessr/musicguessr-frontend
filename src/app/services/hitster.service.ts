import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { TrackInfo } from './game-state.service';
import { SessionIdService } from './session-id.service';
import { TranslationService } from '../i18n/translation.service';
import { localizeBackendError } from '../i18n/backend-error';

// Transient failures worth a couple of quick retries before giving up: 0
// means the request never reached the server at all (a flaky mobile network
// dropping the connection, a cold-starting backend), and 5xx means the
// server itself hit a problem that's often momentary (e.g. a metadata
// provider timing out). 4xx (not found, bad request, rate limit) is the
// backend telling us something concrete — retrying it would just repeat the
// same answer.
const RETRYABLE_STATUSES = new Set([0, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = [500, 1500];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class HitsterService {
  private http = inject(HttpClient);
  private config = inject(ConfigService);
  private sessionId = inject(SessionIdService);
  private i18n = inject(TranslationService);

  async resolve(qrUrl: string, ytVariants = true): Promise<TrackInfo> {
    let url = `${this.config.apiUrl}/api/resolve?url=${encodeURIComponent(qrUrl)}`;
    if (ytVariants) {
      url += '&yt_variants=1';
    }
    const headers = new HttpHeaders({ 'X-Session-Id': this.sessionId.id });

    let attempt = 0;
    for (;;) {
      try {
        const data = await firstValueFrom(this.http.get<TrackInfo & { error?: string }>(url, { headers }));
        if (data.error) {
          throw new Error(localizeBackendError(this.i18n, data.error));
        }
        return data;
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          if (RETRYABLE_STATUSES.has(e.status) && attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY_MS[attempt]);
            attempt++;
            continue;
          }
          if (e.status === 0) {
            throw new Error(this.i18n.t('errors.network'), { cause: e });
          }
          throw new Error(localizeBackendError(this.i18n, e.error?.error), { cause: e });
        }
        throw e;
      }
    }
  }
}
