# Red Hat Hardened Images (Project Hummingbird) — hardened, minimal, no
# subscription required. Registry: registry.access.redhat.com (anonymous
# pulls), repo namespace "hi".
#
# Stage 1: build the Angular app.
#
# NOTE: this stage deliberately uses the standard node:24-alpine image (24 is
# the current Active LTS line), NOT registry.access.redhat.com/hi/nodejs.
# Verified by hand (podman, both native arm64 and amd64-via-emulation, Node
# 20/22/24 hi/nodejs tags all tried): `ng version`/`ng build` reliably
# segfault (SIGSEGV) inside hi/nodejs the moment Angular CLI's dynamic import
# of its init module pulls in its native (Rust N-API) build dependencies —
# reproducible from a plain `require()`, unrelated to this project's own
# code or to which Node major is used. This build stage's base image never
# ships (multi-stage build, discarded after `npm run build`), so it carries
# none of the runtime attack surface hardening is meant to reduce — unlike
# the final nginx stage and the Go stages below, which do use Red Hat
# Hardened Images. Re-test with a newer hi/nodejs tag before switching this
# back.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: compile the runtime entrypoint helper (see docker/entrypoint/main.go).
# The final nginx image below is the "default" hardened variant, which ships
# with no shell, no package manager, and no coreutils — the previous
# entrypoint.sh (POSIX sh + sed) simply cannot run there. This statically
# linked, stdlib-only Go binary does the same job (write config.json from env
# vars, patch SEO placeholders, create nginx's writable temp dirs) without a
# shell, then execs into nginx as PID 1.
FROM registry.access.redhat.com/hi/go:1.27 AS entrypoint-build
WORKDIR /src
COPY docker/entrypoint/go.mod ./
RUN go mod download
COPY docker/entrypoint/ ./
# Passed via --build-arg from docker-build.yml (github.sha) — written into
# version.json at container start (see main.go's writeVersionInfo). Left at
# its Go zero-value default ("unknown") for a plain local build.
ARG GIT_COMMIT=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.gitCommit=${GIT_COMMIT}" \
    -trimpath -o /entrypoint .

# Stage 3: runtime — hardened nginx, no shell.
FROM registry.access.redhat.com/hi/nginx:1.30
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build --chown=65532:65532 /app/dist/frontend/browser /usr/share/nginx/html
COPY --from=entrypoint-build --chown=65532:65532 --chmod=0755 /entrypoint /entrypoint
EXPOSE 8080
USER 65532
ENTRYPOINT ["/entrypoint"]
CMD ["-c", "/etc/nginx/nginx.conf", "-e", "/dev/stderr", "-g", "daemon off;"]
