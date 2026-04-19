import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';

type FaqItem = { q: string; a: string; open: boolean };

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqComponent implements OnInit {
  private seo = inject(SeoService);

  readonly items = signal<FaqItem[]>([
    {
      q: 'Can I play Hitster without Spotify?',
      a: 'Yes. musicguessr supports YouTube as a free playback option — no Spotify account or Premium subscription required. Simply choose YouTube when starting a game.',
      open: true,
    },
    {
      q: 'How do I use musicguessr to play Hitster cards?',
      a: 'Open musicguessr in your browser, select a music service (YouTube, Spotify, or Apple Music), then scan the QR code on any Hitster card with your camera. The track plays automatically.',
      open: false,
    },
    {
      q: 'Does musicguessr work on iPhone and Android?',
      a: 'Yes. musicguessr is a Progressive Web App optimised for iOS Safari and Android Chrome. It works directly in the browser — no app download required. You can also install it on your home screen from the browser menu.',
      open: false,
    },
    {
      q: 'Does it work with all Hitster editions?',
      a: 'Yes. musicguessr reads the QR code on any Hitster card from any edition — Original, 80s, Party, Kids, and regional editions. As long as the card has a QR code, it works.',
      open: false,
    },
    {
      q: 'Can I create my own Hitster-style music quiz?',
      a: 'Yes. Use the Create Deck page to build a custom music quiz from YouTube videos or an entire YouTube playlist. Share it with friends via a link or QR code — no account needed.',
      open: false,
    },
    {
      q: 'Is musicguessr free?',
      a: 'musicguessr is completely free and open source. YouTube playback requires no subscription. Spotify playback requires a Spotify Premium account. Apple Music playback requires an Apple Music subscription.',
      open: false,
    },
    {
      q: 'Why does Spotify not work on my iPhone?',
      a: 'Apple restricts third-party Web Audio on iOS Safari, which prevents the Spotify Web Playback SDK from working. Tapping play will open the track in the Spotify app instead. Use YouTube for in-browser playback on iPhone.',
      open: false,
    },
    {
      q: 'Is my data stored anywhere?',
      a: "No user accounts, no cookies, no tracking. Game state is stored in your browser's localStorage only. Custom decks are stored on the server temporarily (they expire after the TTL you choose) but are not linked to any user.",
      open: false,
    },
    {
      q: 'Can I install musicguessr on my phone?',
      a: 'Yes. In Chrome or Safari, tap the browser menu and choose "Add to Home Screen" or "Install App". musicguessr is a Progressive Web App (PWA) and works offline for previously loaded decks.',
      open: false,
    },
    {
      q: 'Is musicguessr affiliated with Jumbo or the official Hitster game?',
      a: 'No. musicguessr is an independent open-source project and is not affiliated with Jumbo B.V., Slättaratindur AB, or any official Hitster publisher.',
      open: false,
    },
  ]);

  ngOnInit(): void {
    this.seo.set({
      title: 'FAQ — Hitster Online, YouTube Playback & Custom Decks',
      description:
        'Frequently asked questions about playing Hitster online with musicguessr. Learn how to use YouTube instead of Spotify, create custom decks, and more.',
      breadcrumbs: [
        { name: 'musicguessr', path: '/' },
        { name: 'FAQ', path: '/faq' },
      ],
    });
  }

  toggle(index: number): void {
    this.items.update((list) => list.map((item, i) => (i === index ? { ...item, open: !item.open } : item)));
  }
}
