# Official multi-platform image digests verified against Docker Hub tag metadata.
# Build from the repository root; merge the web/layout packages and frozen lock first.
FROM node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS build
WORKDIR /studio

# glibc builder supports native TypeScript/Vite tooling; no Node runtime is shipped.
RUN npm install --global --ignore-scripts pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/midi/package.json packages/midi/package.json
COPY packages/chocolate/package.json packages/chocolate/package.json
COPY packages/chocolate-layout/package.json packages/chocolate-layout/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=chocolate-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN pnpm --filter @chocolate-studio/web run build

FROM nginx:1.30.6-alpine-slim@sha256:f65ed258206d1eb6c4eb6141111715a2cf94ac0a4ec9675fc2da186f7aadb163 AS runtime
# Remove the base image's welcome/error pages; only the built application is served.
RUN rm -rf /usr/share/nginx/html/*
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /studio/apps/web/dist/ /usr/share/nginx/html/

# Root-owned assets/config, unprivileged master/workers, writable state only in /tmp.
USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]
# Bypass entrypoint scripts that rewrite root-owned config at container startup.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
