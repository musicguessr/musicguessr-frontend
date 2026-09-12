const DECK_SEGMENT = /^[a-zA-Z0-9]+$/;
const CARD_SEGMENT = /^\d+$/;

// Mirrors the backend's parseHitsterURL: parse the URL properly and check
// the host exactly, rather than matching "hitstergame.com/..." as a bare
// substring. The substring form this replaces accepted spoofed hosts —
// "evilhitstergame.com/en/AB1/42", "hitstergame.com.evil.tld/...", or any
// URL merely *containing* that text in a query parameter. The backend
// re-validates and would reject those anyway, so this isn't the security
// boundary; it's about not accepting a card here that can only fail later,
// which surfaces to the player as a confusing lookup error instead of the
// scanner simply not recognising a non-Hitster code.
export function isHitsterCardUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // Physical Hitster cards encode scheme-less URLs ("www.hitstergame.com/pl/AB1/42"),
    // which the URL constructor rejects outright.
    try {
      u = new URL(`https://${raw}`);
    } catch {
      return false;
    }
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'hitstergame.com' && !host.endsWith('.hitstergame.com')) {
    return false;
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 3) {
    return false;
  }
  return DECK_SEGMENT.test(parts[1]) && CARD_SEGMENT.test(parts[2]);
}
