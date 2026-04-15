import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface AppConfig {
  apiUrl: string;
  spotifyClientId: string;
  appleDevToken: string;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private config: AppConfig = {
    apiUrl: 'http://localhost:8080',
    spotifyClientId: '',
    appleDevToken: ''
  };

  constructor(private http: HttpClient) {}

  async load(): Promise<void> {
    try {
      const cfg = await firstValueFrom(
        this.http.get<AppConfig>('/config.json')
      );
      this.config = { ...this.config, ...cfg };
    } catch {
      console.warn('config.json not found, using defaults');
    }
  }

  get apiUrl(): string { return this.config.apiUrl; }
  get spotifyClientId(): string { return this.config.spotifyClientId; }
  get appleDevToken(): string { return this.config.appleDevToken; }
}
