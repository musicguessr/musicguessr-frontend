import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { HitsterService } from './hitster.service';
import { ConfigService } from './config.service';

describe('HitsterService', () => {
  let service: HitsterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HitsterService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: { apiUrl: 'http://localhost:8080' } },
      ],
    });
    service = TestBed.inject(HitsterService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('builds URL with encoded QR param and yt_variants=1 by default', async () => {
    const qrUrl = 'https://hitstergame.com/en/ABC/42';
    const promise = service.resolve(qrUrl);

    const req = httpMock.expectOne((r) => r.url.includes('/api/resolve'));
    expect(req.request.url).toContain(encodeURIComponent(qrUrl));
    expect(req.request.url).toContain('yt_variants=1');
    req.flush({ spotify_id: 'track_abc', spotify_url: 'https://open.spotify.com/track/track_abc', links: {} });

    const result = await promise;
    expect(result.spotify_id).toBe('track_abc');
  });

  it('omits yt_variants param when called with false', async () => {
    const promise = service.resolve('https://hitstergame.com/en/ABC/1', false);

    const req = httpMock.expectOne((r) => r.url.includes('/api/resolve'));
    expect(req.request.url).not.toContain('yt_variants');
    req.flush({ spotify_id: 'track_xyz', spotify_url: '', links: {} });

    await promise;
  });

  it('includes all response fields in returned TrackInfo', async () => {
    const promise = service.resolve('https://hitstergame.com/en/ABC/1');

    const req = httpMock.expectOne((r) => r.url.includes('/api/resolve'));
    req.flush({
      spotify_id: 'id1',
      spotify_url: 'https://spotify.com',
      artist: 'Daft Punk',
      title: 'Get Lucky',
      year: 2013,
      artwork_url: 'https://example.com/art.jpg',
      youtube_video_id: 'dQw4w9WgXcQ',
      links: { youtube: 'https://youtube.com' },
    });

    const result = await promise;
    expect(result.artist).toBe('Daft Punk');
    expect(result.title).toBe('Get Lucky');
    expect(result.year).toBe(2013);
    expect(result.youtube_video_id).toBe('dQw4w9WgXcQ');
  });

  it('throws when response contains an error field', async () => {
    const promise = service.resolve('https://hitstergame.com/en/ABC/99');

    const req = httpMock.expectOne((r) => r.url.includes('/api/resolve'));
    req.flush({ error: 'card not found', spotify_id: '', spotify_url: '', links: {} });

    await expect(promise).rejects.toThrow('card not found');
  });
});
