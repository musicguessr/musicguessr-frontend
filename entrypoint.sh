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

# Normalize SITE_URL: public URL of the frontend (used for canonical, OG, sitemap).
# Falls back to API_URL or a placeholder if not set.
if [ -z "${SITE_URL}" ]; then
  SITE_URL_NORMALIZED="https://example.com"
else
  case "$SITE_URL" in
    http://*|https://*) SITE_URL_NORMALIZED="${SITE_URL%/}" ;;
    *) SITE_URL_NORMALIZED="https://${SITE_URL%/}" ;;
  esac
fi

LOG_TS() { date --utc +"%Y-%m-%dT%H:%M:%SZ"; }

echo "$(LOG_TS) [entrypoint] starting entrypoint (user=$(id -u):$(id -g))"
echo "$(LOG_TS) [entrypoint] API_URL (raw)='${API_URL:-<unset>}'"
echo "$(LOG_TS) [entrypoint] API_URL (normalized)='${API_URL_NORMALIZED}'"
echo "$(LOG_TS) [entrypoint] SITE_URL (normalized)='${SITE_URL_NORMALIZED}'"
echo "$(LOG_TS) [entrypoint] SPOTIFY_CLIENT_ID set='${SPOTIFY_CLIENT_ID:+yes}' APPLE_DEV_TOKEN set='${APPLE_DEV_TOKEN:+yes}'"
echo "$(LOG_TS) [entrypoint] GOOGLE_SITE_VERIFICATION set='${GOOGLE_SITE_VERIFICATION:+yes}' BING_SITE_VERIFICATION set='${BING_SITE_VERIFICATION:+yes}'"

HTML=/usr/share/nginx/html

# Generate runtime config.json from environment variables
CFG_PATH="${HTML}/config.json"
echo "$(LOG_TS) [entrypoint] writing runtime config to ${CFG_PATH}"
cat > "${CFG_PATH}" <<EOF
{
  "apiUrl": "${API_URL_NORMALIZED}",
  "spotifyClientId": "${SPOTIFY_CLIENT_ID:-}",
  "appleDevToken": "${APPLE_DEV_TOKEN:-}"
}
EOF

# Replace placeholders in index.html
INDEX="${HTML}/index.html"
if [ -f "${INDEX}" ]; then
  echo "$(LOG_TS) [entrypoint] patching index.html placeholders"
  sed -i \
    -e "s|__SITE_URL__|${SITE_URL_NORMALIZED}|g" \
    -e "s|__GOOGLE_VERIFICATION__|${GOOGLE_SITE_VERIFICATION:-}|g" \
    -e "s|__BING_VERIFICATION__|${BING_SITE_VERIFICATION:-}|g" \
    "${INDEX}"
fi

# Replace __SITE_URL__ in robots.txt and sitemap.xml
for FILE in "${HTML}/robots.txt" "${HTML}/sitemap.xml"; do
  if [ -f "${FILE}" ]; then
    echo "$(LOG_TS) [entrypoint] patching ${FILE}"
    sed -i "s|__SITE_URL__|${SITE_URL_NORMALIZED}|g" "${FILE}"
  fi
done

echo "$(LOG_TS) [entrypoint] exec: $@"
exec "$@"
