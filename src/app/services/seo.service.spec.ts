import { TestBed } from '@angular/core/testing';
import { BrowserModule } from '@angular/platform-browser';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  let service: SeoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BrowserModule],
      providers: [SeoService],
    });
    service = TestBed.inject(SeoService);
  });

  it('sets document title with app name suffix', () => {
    service.set({ title: 'Create Deck' });
    expect(document.title).toBe('Create Deck — musicguessr');
  });

  it('uses only app name when no title provided', () => {
    service.set();
    expect(document.title).toBe('musicguessr');
  });

  it('updates description meta tag', () => {
    service.set({ description: 'Custom description here' });
    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toBe('Custom description here');
  });

  it('uses default description when none provided', () => {
    service.set({});
    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toBeTruthy();
  });

  it('sets robots to noindex,nofollow when noindex=true', () => {
    service.set({ noindex: true });
    const meta = document.querySelector('meta[name="robots"]');
    expect(meta?.getAttribute('content')).toBe('noindex,nofollow');
  });

  it('sets robots to index,follow by default', () => {
    service.set({});
    const meta = document.querySelector('meta[name="robots"]');
    expect(meta?.getAttribute('content')).toBe('index,follow');
  });

  it('updates og:title meta tag', () => {
    service.set({ title: 'My Page' });
    const meta = document.querySelector('meta[property="og:title"]');
    expect(meta?.getAttribute('content')).toBe('My Page — musicguessr');
  });

  it('updates twitter:title meta tag', () => {
    service.set({ title: 'My Page' });
    const meta = document.querySelector('meta[name="twitter:title"]');
    expect(meta?.getAttribute('content')).toBe('My Page — musicguessr');
  });
});
