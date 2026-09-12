import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

type AppConfig = {
  apiUrl: string;
  spotifyClientId: string;
  appleDevToken: string;
};

@Injectable({ providedIn: 'root' })
export class ConfigService {
  // apiUrl defaults to same-origin (callers build "${apiUrl}/api/..."), not
  // localhost: this value only ever applies when /config.json fails to load,
  // and in that situation a localhost default is wrong everywhere it
  // matters. On musicguessr.app it points the browser at the user's own
  // machine and is blocked as mixed content besides, turning one failed
  // config fetch into "nothing works" with only a console warning. Deployed
  // setups serve the API on the same origin anyway, so same-origin is the
  // default most likely to still work. Local dev is unaffected — it reads
  // the real http://localhost:8080 from src/config.json, which is served as
  // a static asset (see angular.json).
  private config: AppConfig = {
    apiUrl: '',
    spotifyClientId: '',
    appleDevToken: '',
  };

  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);

  async load(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      const cfg = await firstValueFrom(this.http.get<AppConfig>('/config.json'));
      this.config = { ...this.config, ...cfg };
    } catch {
      console.warn('config.json not found, using defaults');
    }
  }

  get apiUrl(): string {
    return this.config.apiUrl;
  }
  get spotifyClientId(): string {
    return this.config.spotifyClientId;
  }
  get appleDevToken(): string {
    return this.config.appleDevToken;
  }
}
