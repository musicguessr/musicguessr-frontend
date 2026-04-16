import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { TrackInfo } from './game-state.service';

@Injectable({ providedIn: 'root' })
export class HitsterService {
  private http = inject(HttpClient);
  private config = inject(ConfigService);

  async resolve(qrUrl: string, ytVariants = true): Promise<TrackInfo> {
    let url = `${this.config.apiUrl}/api/resolve?url=${encodeURIComponent(qrUrl)}`;
    if (ytVariants) url += '&yt_variants=1';
    const data = await firstValueFrom(this.http.get<TrackInfo & { error?: string }>(url));
    if ((data as any).error) {
      throw new Error((data as any).error);
    }
    return data;
  }
}
