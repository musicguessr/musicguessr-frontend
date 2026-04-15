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

Runtime configuration and deployment
-----------------------------------

This project writes `config.json` at container startup from environment variables (see `entrypoint.sh`). Use the environment variable `API_URL` to set the backend URL at runtime.

Run locally (example):

```bash
docker build -t musicguessr-frontend:latest .
docker run -e API_URL=https://api.prod -e SPOTIFY_CLIENT_ID=abc -p 8080:8080 musicguessr-frontend:latest
```

Using GitHub Container Registry (GHCR)
- If your organization blocks `GITHUB_TOKEN` from creating organization packages, create a Personal Access Token (PAT) with `write:packages` (and `repo` for private repos) and add it as repository secret `GHCR_PAT`.

Example: create PAT permissions
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic) (or fine-grained tokens)
2. Select `write:packages` and `repo` (if repository is private)
3. Save token to repository secret `GHCR_PAT`

Example GitHub Actions step to deploy the image to a remote host and run it with `API_URL` (requires `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER` secrets):

```yaml
- name: Deploy to server
  uses: appleboy/ssh-action@v0.1.7
  with:
    host: ${{ secrets.SSH_HOST }}
    username: ${{ secrets.SSH_USER }}
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    script: |
      docker pull ghcr.io/${{ github.repository_owner }}/musicguessr-frontend:latest
      docker rm -f musicguessr-frontend || true
      docker run -d --name musicguessr-frontend -e API_URL="${{ secrets.DEPLOY_API_URL }}" -p 80:8080 ghcr.io/${{ github.repository_owner }}/musicguessr-frontend:latest
```

Notes
- Prefer runtime env injection (this repo's `entrypoint.sh`) so you can build a single multi-arch image and deploy it to different environments without rebuilding.
- Alternatively, you can generate/replace `src/config.json` during CI before `ng build` if you must bake values into the bundle (not recommended if you need one image per environment).

