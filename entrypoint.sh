#!/bin/sh
set -e

# Normalize API_URL: ensure it is absolute (with scheme). If empty, default to http://localhost:8080
if [ -z "${API_URL}" ]; then
  API_URL_NORMALIZED="http://localhost:8080"
else
  case "$API_URL" in
    http://*|https://*) API_URL_NORMALIZED="$API_URL" ;;
    *) API_URL_NORMALIZED="http://$API_URL" ;;
  esac
fi

LOG_TS() { date --utc +"%Y-%m-%dT%H:%M:%SZ"; }

echo "$(LOG_TS) [entrypoint] starting entrypoint (user=$(id -u):$(id -g))"
echo "$(LOG_TS) [entrypoint] API_URL (raw)='${API_URL:-<unset>}'"
echo "$(LOG_TS) [entrypoint] API_URL (normalized)='${API_URL_NORMALIZED}'"
echo "$(LOG_TS) [entrypoint] SPOTIFY_CLIENT_ID set='${SPOTIFY_CLIENT_ID:+yes}' APPLE_DEV_TOKEN set='${APPLE_DEV_TOKEN:+yes}'"

# Generate runtime config.json from environment variables
CFG_PATH=/usr/share/nginx/html/config.json
echo "$(LOG_TS) [entrypoint] writing runtime config to ${CFG_PATH}"
cat > "${CFG_PATH}" <<EOF
{
  "apiUrl": "${API_URL_NORMALIZED}",
  "spotifyClientId": "${SPOTIFY_CLIENT_ID:-}",
  "appleDevToken": "${APPLE_DEV_TOKEN:-}"
}
EOF

echo "$(LOG_TS) [entrypoint] generated config.json content:"
sed -n '1,200p' "${CFG_PATH}" || true

echo "$(LOG_TS) [entrypoint] exec: $@"
exec "$@"
