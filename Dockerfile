# Production image: the built app served by nginx, which also forwards /stardog/ to Stardog.
# No credentials are baked in or added by the proxy: each person signs in with their own
# Stardog account (or pastes a token). See "Production image" in README.md.
#
# Bases are Chainguard images pinned by digest. For Iron Bank, pass an approved registry and
# image, e.g. --build-arg BASE_REGISTRY=registry1.dso.mil/ironbank --build-arg BASE_IMAGE=...
ARG BUILD_REGISTRY=cgr.dev
ARG BUILD_IMAGE=chainguard/node
ARG BUILD_TAG=latest-dev@sha256:f3ff59f82002e261f6ccc1eb3e876df19666502a0e16b7f535690e1d26895ae9
ARG BASE_REGISTRY=cgr.dev
ARG BASE_IMAGE=chainguard/nginx
ARG BASE_TAG=latest@sha256:d74ba9e5cf9f6b049807e27a5a14a8cd2550ac428143b7d15ea3dbad282f4ed1

FROM ${BUILD_REGISTRY}/${BUILD_IMAGE}:${BUILD_TAG} AS build
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node index.html vite.config.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
# The connection form's default endpoint: this image's own /stardog/ proxy (not a secret).
ARG VITE_STARDOG_ENDPOINT=/stardog
RUN VITE_STARDOG_ENDPOINT="$VITE_STARDOG_ENDPOINT" npx vite build

FROM ${BASE_REGISTRY}/${BASE_IMAGE}:${BASE_TAG}
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/stardog-upstream.conf /etc/nginx/stardog-upstream.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 65532
EXPOSE 8080
# The image has no shell or HTTP client; this checks the configuration. Kubernetes should probe /healthz.
HEALTHCHECK --interval=30s --timeout=5s CMD ["/usr/sbin/nginx", "-t", "-q", "-e", "/dev/stderr"]
