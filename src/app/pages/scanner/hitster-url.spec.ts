import { isHitsterCardUrl } from './hitster-url';

describe('isHitsterCardUrl', () => {
  it('accepts a canonical card URL', () => {
    expect(isHitsterCardUrl('https://www.hitstergame.com/pl/AB1/42')).toBe(true);
  });

  it('accepts the scheme-less form physical cards actually encode', () => {
    expect(isHitsterCardUrl('www.hitstergame.com/pl/AB1/42')).toBe(true);
  });

  it('accepts the apex domain without a subdomain', () => {
    expect(isHitsterCardUrl('https://hitstergame.com/en/XYZ9/1')).toBe(true);
  });

  // The substring match this replaced accepted every one of these.
  it('rejects a lookalike host with a prefix', () => {
    expect(isHitsterCardUrl('https://evilhitstergame.com/en/AB1/42')).toBe(false);
  });

  it('rejects a lookalike host with a suffix', () => {
    expect(isHitsterCardUrl('https://hitstergame.com.evil.tld/en/AB1/42')).toBe(false);
  });

  it('rejects an unrelated host that merely mentions the domain in a query', () => {
    expect(isHitsterCardUrl('https://evil.tld/?next=hitstergame.com/en/AB1/42')).toBe(false);
  });

  it('rejects a non-numeric card segment', () => {
    expect(isHitsterCardUrl('https://www.hitstergame.com/pl/AB1/notacard')).toBe(false);
  });

  it('rejects a path with too few segments', () => {
    expect(isHitsterCardUrl('https://www.hitstergame.com/pl/AB1')).toBe(false);
  });

  it('rejects arbitrary non-URL text', () => {
    expect(isHitsterCardUrl('just some scanned text')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isHitsterCardUrl('')).toBe(false);
  });
});
