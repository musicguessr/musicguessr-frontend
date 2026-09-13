import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { LocaleSuggestionService } from './locale-suggestion.service';
import { TranslationService } from './translation.service';

describe('LocaleSuggestionService', () => {
  let events: Subject<unknown>;
  let router: { events: Subject<unknown>; url: string; navigateByUrl: jest.Mock };
  let i18n: TranslationService;
  let service: LocaleSuggestionService;
  let languagesSpy: jest.SpyInstance;

  function setBrowserLanguages(...langs: string[]): void {
    languagesSpy = jest.spyOn(navigator, 'languages', 'get').mockReturnValue(langs);
  }

  function fireNavigationEnd(): void {
    events.next(new NavigationEnd(1, '/', '/'));
  }

  beforeEach(() => {
    localStorage.clear();
    events = new Subject();
    router = { events, url: '/', navigateByUrl: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        LocaleSuggestionService,
        { provide: Router, useValue: router },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(LocaleSuggestionService);
    i18n = TestBed.inject(TranslationService);
  });

  afterEach(() => {
    localStorage.clear();
    languagesSpy?.mockRestore();
  });

  it('suggests a supported locale that matches the browser language', () => {
    setBrowserLanguages('pl-PL', 'en-US');
    service.init();
    fireNavigationEnd();

    expect(service.suggested()).toBe('pl');
  });

  it('does not suggest anything when the browser prefers English', () => {
    setBrowserLanguages('en-US');
    service.init();
    fireNavigationEnd();

    expect(service.suggested()).toBeNull();
  });

  it('does not suggest anything for an unsupported browser language', () => {
    setBrowserLanguages('fr-FR', 'es-ES');
    service.init();
    fireNavigationEnd();

    expect(service.suggested()).toBeNull();
  });

  it('does not suggest when already on a non-English locale', () => {
    setBrowserLanguages('pl-PL');
    i18n.setLocale('de');
    service.init();
    fireNavigationEnd();

    expect(service.suggested()).toBeNull();
  });

  it('only ever checks once per browser (localStorage-gated)', () => {
    setBrowserLanguages('pl-PL');
    service.init();
    fireNavigationEnd();
    expect(service.suggested()).toBe('pl');

    // Simulates a genuinely new page load (a new root injector, not just a
    // second init() call on the same instance) — TestBed.inject() alone
    // would hand back the same singleton, whose `suggested` signal still
    // holds 'pl' from above regardless of what init() does this time,
    // which wouldn't actually prove the localStorage gate works.
    TestBed.resetTestingModule();
    const freshEvents = new Subject<unknown>();
    TestBed.configureTestingModule({
      providers: [
        LocaleSuggestionService,
        { provide: Router, useValue: { events: freshEvents, url: '/', navigateByUrl: jest.fn() } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    const second = TestBed.inject(LocaleSuggestionService);
    second.init();
    freshEvents.next(new NavigationEnd(2, '/', '/'));

    expect(second.suggested()).toBeNull();
  });

  it('accept() clears the suggestion and navigates to the localized path', () => {
    setBrowserLanguages('de-DE');
    router.url = '/how-to-play';
    service.init();
    fireNavigationEnd();
    expect(service.suggested()).toBe('de');

    service.accept();

    expect(service.suggested()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/de/how-to-play');
  });

  it('dismiss() clears the suggestion without navigating', () => {
    setBrowserLanguages('nl-NL');
    service.init();
    fireNavigationEnd();
    expect(service.suggested()).toBe('nl');

    service.dismiss();

    expect(service.suggested()).toBeNull();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('markHandled() suppresses any future suggestion', () => {
    service.markHandled();

    setBrowserLanguages('pl-PL');
    service.init();
    fireNavigationEnd();

    expect(service.suggested()).toBeNull();
  });
});
