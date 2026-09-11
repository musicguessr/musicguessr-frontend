import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-how-to-play',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './how-to-play.component.html',
  styleUrl: './how-to-play.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowToPlayComponent implements OnInit {
  private seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.set({
      title: 'How to Play Hitster Online with YouTube — Step by Step',
      description:
        'Learn how to play Hitster card game online using YouTube, Spotify, or Apple Music. Scan QR codes, hear the song, guess the year. No Spotify required.',
      breadcrumbs: [
        { name: 'musicguessr', path: '/' },
        { name: 'How to Play', path: '/how-to-play' },
      ],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to play Hitster online with YouTube',
          description: 'Use musicguessr to play Hitster card game in your browser using YouTube — no Spotify required.',
          step: [
            {
              '@type': 'HowToStep',
              position: 1,
              name: 'Choose a music service',
              text: 'Open musicguessr and select YouTube (free, no login), Spotify, or Apple Music as your playback provider.',
            },
            {
              '@type': 'HowToStep',
              position: 2,
              name: 'Scan a Hitster card',
              text: 'Point your camera at the QR code on any Hitster card. The app identifies the track instantly.',
            },
            {
              '@type': 'HowToStep',
              position: 3,
              name: 'Tap to play',
              text: 'Tap the play button. The song starts in your browser — no app switching needed.',
            },
            {
              '@type': 'HowToStep',
              position: 4,
              name: 'Guess the year',
              text: 'Listen to the track, guess the release year, then tap to reveal the answer and place the card on your timeline.',
            },
          ],
          tool: [
            { '@type': 'HowToTool', name: 'Hitster card game' },
            { '@type': 'HowToTool', name: 'Smartphone with camera' },
          ],
        },
      ],
    });
  }
}
