import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { TrackInfo } from './game-state.service';
import { SessionIdService } from './session-id.service';

@Injectable({ providedIn: 'root' })
export class HitsterService {
  private http = inject(HttpClient);
  private config = inject(ConfigService);
  private sessionId = inject(SessionIdService);

  async resolve(qrUrl: string, ytVariants = true): Promise<TrackInfo> {
    let url = `${this.config.apiUrl}/api/resolve?url=${encodeURIComponent(qrUrl)}`;
    if (ytVariants) {
      url += '&yt_variants=1';
    }
    try {
      const headers = new HttpHeaders({ 'X-Session-Id': this.sessionId.id });
      const data = await firstValueFrom(this.http.get<TrackInfo & { error?: string }>(url, { headers }));
      if (data.error) {
        throw new Error(data.error);
      }
      return data;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        // status 0 means the request never reached the server (offline, DNS
        // failure, CORS-blocked, or the backend itself is down) — the browser
        // gives no further detail, so this is the only case worth naming
        // specifically rather than echoing a generic HTTP status.
        if (e.status === 0) {
          throw new Error("Can't reach the server. Check your connection and try again.", { cause: e });
        }
        throw new Error(e.error?.error || `Server error (${e.status}). Please try again.`, { cause: e });
      }
      throw e;
    }
  }
}
