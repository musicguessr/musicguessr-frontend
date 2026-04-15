## MusicGuessr — Frontend

Angular frontend for a QR-based music guessing game.

Overview
MusicGuessr is a client-side Angular application that lets users select a playback provider (YouTube, Spotify or Apple Music), scan a QR code (from hitstergame.com), resolve a matching track and play it.

Key features
- Provider selection with persistent state
- QR scanner using the device camera and `jsqr`
- Playback via YouTube IFrame API, Spotify Web Playback SDK and Apple Music
- Lazy-loaded standalone components and Angular router

Requirements
- Node.js and npm
- (Optional) Angular CLI for development convenience

Quick start
1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm start
# or
ng serve
```

3. Open http://localhost:4200

Configuration
The app loads runtime settings from `src/config.json`. Example:

```json
{
  "apiUrl": "http://localhost:8080",
  "spotifyClientId": "",
  "appleDevToken": ""
}
```

- `apiUrl`: backend base URL
- `spotifyClientId`: required for Spotify PKCE auth and Web Playback SDK
- `appleDevToken`: required for Apple Music playback

Project layout (important files)
- `angular.json` — build config and assets
- `src/config.json` — runtime settings copied to output
- `src/main.ts` — app entrypoint
- `src/app/app.config.ts` — app providers and APP_INITIALIZER for config
- `src/app/app.routes.ts` — router configuration
- `src/app/services/` — core services (`config.service.ts`, `game-state.service.ts`, `spotify.service.ts`, `youtube-player.service.ts`, `apple-music.service.ts`, `hitster.service.ts`)
- `src/app/pages/` — page components (`provider-select`, `scanner`, `game`, `callback`)

Security notes
- Tokens are stored in `localStorage`; treat them appropriately and avoid committing secrets to the repo.

Building for production

```bash
npm run build
```

Serve the `dist/frontend` folder from any static host (nginx, CDN). See `nginx/nginx.conf` for an example.

Contributing
- Open an issue or submit a pull request with a description of changes.

License
- See the `LICENSE` file in the repository.

---
This README was generated from a code inspection of the repository.
