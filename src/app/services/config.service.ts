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
  private config: AppConfig = {
    apiUrl: 'http://localhost:8080',
    spotifyClientId: '',
    appleDevToken: '',
  };

  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);

  async load(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
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
