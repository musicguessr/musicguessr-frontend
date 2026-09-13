import { Pipe, PipeTransform } from '@angular/core';

// Brand names, not title-cased ids — `titlecase` rendered "Youtube".
const NAMES: Record<string, string> = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  apple: 'Apple Music',
};

@Pipe({ name: 'providerName', standalone: true })
export class ProviderNamePipe implements PipeTransform {
  transform(provider: string | null | undefined): string {
    return provider ? (NAMES[provider] ?? provider) : '';
  }
}
