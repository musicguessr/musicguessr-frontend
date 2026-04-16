## MusicGuessr — Frontend

Angular frontend for a QR-based music guessing game.

### Overview

MusicGuessr is a client-side Angular application that lets users select a playback provider (YouTube, Spotify or Apple Music), scan a QR code (from hitstergame.com), resolve a matching track and play it.

**Key features:**

- Provider selection with persistent state
- QR scanner using the device camera and `jsqr`
- Playback via YouTube IFrame API, Spotify Web Playback SDK and Apple Music
- Lazy-loaded standalone components and Angular signals

---

### Requirements

- Node.js 20+ and npm
- (Optional) Angular CLI for development convenience

---

### Quick start

1. Install dependencies:

```bash
npm install
```

2. Configure the app (see [Configuration](#configuration) below).

3. Start dev server:

```bash
npm start
# or
ng serve
```

4. Open http://localhost:4200

---

### Configuration

The app loads runtime settings from `src/config.json`. This file is **never built into the bundle** — it is served as a static asset and read at app startup.

**Example `src/config.json`:**

```json
{
  "apiUrl": "http://localhost:8080",
  "spotifyClientId": "",
  "appleDevToken": ""
}
```

| Key               | Required | Description                                                               |
| ----------------- | -------- | ------------------------------------------------------------------------- |
| `apiUrl`          | Yes      | Base URL of the Go backend. Default: `http://localhost:8080`              |
| `spotifyClientId` | No       | Spotify app Client ID. If empty, the Spotify option is hidden.            |
| `appleDevToken`   | No       | Apple MusicKit developer JWT. If empty, the Apple Music option is hidden. |

> **YouTube requires zero configuration** — it is always available without any credentials.

---

### Environment variables (Docker / production)

When running via Docker, `entrypoint.sh` generates `config.json` at container startup from environment variables. You do **not** need to modify `src/config.json` — just pass the variables to the container:

| Variable            | Maps to           | Default                        |
| ------------------- | ----------------- | ------------------------------ |
| `API_URL`           | `apiUrl`          | `http://localhost:8080`        |
| `SPOTIFY_CLIENT_ID` | `spotifyClientId` | _(empty — Spotify hidden)_     |
| `APPLE_DEV_TOKEN`   | `appleDevToken`   | _(empty — Apple Music hidden)_ |

**Example — run locally with Docker:**

```bash
docker build -t musicguessr-frontend:latest .
docker run \
  -e API_URL=https://api.example.com \
  -e SPOTIFY_CLIENT_ID=your_spotify_client_id \
  -e APPLE_DEV_TOKEN=your_apple_dev_token \
  -p 8080:8080 \
  musicguessr-frontend:latest
```

---

### How to obtain each credential

#### `API_URL` — Go backend URL

The URL where the `musicguessr-backend` service is running.

- Local development: `http://localhost:8080` (default, no change needed)
- Production: the public HTTPS URL of your deployed backend

---

#### `SPOTIFY_CLIENT_ID` — Spotify app Client ID

Required for Spotify PKCE OAuth and Web Playback SDK. Uses **no client secret** — auth is done entirely in the browser via PKCE.

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in and click **Create app**
3. Fill in app name and description; set **Redirect URI** to `https://your-domain.com/callback` (or `http://localhost:4200/callback` for local dev)
4. Under **APIs used**, enable **Web Playback SDK**
5. Save → open the app → copy the **Client ID** (long hex string, no secret needed)

> **Note:** Spotify Web Playback SDK requires a **Spotify Premium** account. It does **not** work on iOS Safari (WebKit restriction).

---

#### `APPLE_DEV_TOKEN` — Apple MusicKit developer JWT

Required to initialize MusicKit JS. This is a **developer token** (not a user token) — a short-lived JWT signed with your Apple private key, valid for up to 6 months.

**Prerequisites:**

- An Apple Developer Program membership ($99/year)
- A MusicKit identifier and a private key created in Apple Developer portal

**Steps:**

1. Go to [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**
2. Under **Identifiers**, register a new **MusicKit ID** (e.g. `music.com.yourapp`)
3. Under **Keys**, click **+** → enable **Media Services (MusicKit)** → choose your MusicKit ID → generate and **download the `.p8` private key** (you can only download it once)
4. Note your **Key ID** (10-char string) and your **Team ID** (visible in the top-right of the portal)
5. Generate the JWT:

```bash
# Install ruby-jwt or use any JWT library
# Header: { "alg": "ES256", "kid": "<KEY_ID>" }
# Payload:
# {
#   "iss": "<TEAM_ID>",
#   "iat": <now>,
#   "exp": <now + 15777000>,   // up to ~6 months
#   "origin": ["https://your-domain.com"]
# }
```

Using Node.js with the `jsonwebtoken` package:

```js
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('AuthKey_XXXXXXXXXX.p8');

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  issuer: 'YOUR_TEAM_ID',
  header: { alg: 'ES256', kid: 'YOUR_KEY_ID' },
});

console.log(token);
```

6. Paste the resulting JWT as `APPLE_DEV_TOKEN` / `appleDevToken`

> **Token expiry:** Developer tokens expire after at most 6 months. You must regenerate and redeploy when the token expires. User music tokens are handled automatically by MusicKit JS after the user logs in.

---

### Project layout

| Path                                         | Responsibility                                           |
| -------------------------------------------- | -------------------------------------------------------- |
| `src/config.json`                            | Runtime settings (not built into bundle)                 |
| `entrypoint.sh`                              | Generates `config.json` from env vars at container start |
| `src/app/app.config.ts`                      | APP_INITIALIZER loads `config.json`                      |
| `src/app/app.routes.ts`                      | Routes: `/`, `/scan`, `/game`, `/callback`               |
| `src/app/services/config.service.ts`         | Reads `config.json`                                      |
| `src/app/services/game-state.service.ts`     | All game state in `localStorage`, Angular signals        |
| `src/app/services/spotify.service.ts`        | PKCE OAuth + Web Playback SDK                            |
| `src/app/services/apple-music.service.ts`    | MusicKit JS                                              |
| `src/app/services/youtube-player.service.ts` | YouTube IFrame API                                       |
| `src/app/services/hitster.service.ts`        | Calls `GET /api/resolve?url=…` on the backend            |
| `src/app/pages/provider-select/`             | Step 1: choose provider, OAuth if needed                 |
| `src/app/pages/scanner/`                     | Step 2: jsQR camera scanner                              |
| `src/app/pages/game/`                        | Step 3: TAP TO PLAY → music + blurred card               |
| `src/app/pages/callback/`                    | Spotify OAuth redirect handler                           |

---

### Building for production

```bash
npm run build
```

Output goes to `dist/frontend/browser`. Serve from any static host (nginx, CDN). See `nginx/nginx.conf` for the included nginx config.

---

### Deployment with GitHub Container Registry (GHCR)

If your organization blocks `GITHUB_TOKEN` from creating packages, create a Personal Access Token (PAT) with `write:packages` (and `repo` for private repos) and add it as repository secret `GHCR_PAT`.

Example GitHub Actions deploy step (requires `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER` secrets):

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
      docker run -d --name musicguessr-frontend \
        -e API_URL="${{ secrets.DEPLOY_API_URL }}" \
        -e SPOTIFY_CLIENT_ID="${{ secrets.SPOTIFY_CLIENT_ID }}" \
        -e APPLE_DEV_TOKEN="${{ secrets.APPLE_DEV_TOKEN }}" \
        -p 80:8080 \
        ghcr.io/${{ github.repository_owner }}/musicguessr-frontend:latest
```

---

### Security notes

- OAuth tokens (Spotify, Apple Music) are stored in `localStorage` — this is intentional (client-side only app, no backend auth).
- Never commit `src/config.json` with real credentials to the repository — keep it empty (defaults) and inject values at runtime.
- The Spotify Client ID is **not a secret** — PKCE OAuth requires no client secret.
- The Apple developer token **should be treated as semi-sensitive** — it is visible in the browser but has no user-level permissions.

---

### License

See the `LICENSE` file in the repository.
