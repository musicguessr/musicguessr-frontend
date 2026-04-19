import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  describe('in browser', () => {
    let service: ConfigService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          ConfigService,
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      });
      service = TestBed.inject(ConfigService);
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('returns default apiUrl before load()', () => {
      expect(service.apiUrl).toBe('http://localhost:8080');
    });

    it('returns empty spotifyClientId by default', () => {
      expect(service.spotifyClientId).toBe('');
    });

    it('load() fetches /config.json and updates values', async () => {
      const promise = service.load();
      const req = httpMock.expectOne('/config.json');
      req.flush({ apiUrl: 'https://api.example.com', spotifyClientId: 'sp_id', appleDevToken: 'ap_tok' });
      await promise;

      expect(service.apiUrl).toBe('https://api.example.com');
      expect(service.spotifyClientId).toBe('sp_id');
      expect(service.appleDevToken).toBe('ap_tok');
    });

    it('load() keeps defaults on HTTP error', async () => {
      const promise = service.load();
      const req = httpMock.expectOne('/config.json');
      req.flush(null, { status: 404, statusText: 'Not Found' });
      await promise;

      expect(service.apiUrl).toBe('http://localhost:8080');
    });

    it('load() merges partial config with defaults', async () => {
      const promise = service.load();
      const req = httpMock.expectOne('/config.json');
      req.flush({ apiUrl: 'https://custom.api' });
      await promise;

      expect(service.apiUrl).toBe('https://custom.api');
      expect(service.spotifyClientId).toBe('');
    });
  });

  describe('on server (SSR)', () => {
    let service: ConfigService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          ConfigService,
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: PLATFORM_ID, useValue: 'server' },
        ],
      });
      service = TestBed.inject(ConfigService);
    });

    it('load() makes no HTTP request on server', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      await service.load();
      httpMock.expectNone('/config.json');
    });

    it('returns default values on server', () => {
      expect(service.apiUrl).toBe('http://localhost:8080');
    });
  });
});
