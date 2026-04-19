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
    });
  }
}
