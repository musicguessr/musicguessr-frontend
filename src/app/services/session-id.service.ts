import { Injectable } from '@angular/core';

// A random ID generated once per page load, held only in memory — never
// written to localStorage/cookies/sessionStorage, never survives a reload
// or a new tab. Lets backend logs correlate multiple actions within one
// browsing session (e.g. a scanner timeout, followed by a successful
// resolve, followed by a playback error) without persisting any identifier
// across visits — a persistent ID would be exactly the kind of tracking
// this app's own FAQ promises it doesn't do ("No user accounts, no
// cookies, no tracking"). This never identifies a returning visitor and
// carries no PII; it's discarded the moment the tab closes or reloads.
@Injectable({ providedIn: 'root' })
export class SessionIdService {
  readonly id = generateId();
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.randomUUID() requires a secure context (HTTPS) — a plain random
  // string still serves the same non-persistent correlation purpose for
  // the rare browser/dev-server combo that lacks it.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
