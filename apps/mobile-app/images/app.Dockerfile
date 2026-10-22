FROM node:24.22.1-bookworm-slim AS build
ARG SQLITE_PREBUILD_MIRROR=
ENV npm_config_better_sqlite3_binary_host_mirror=$SQLITE_PREBUILD_MIRROR
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate && pnpm config set store-dir /pnpm/store
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY images/dependencies/ ./
RUN --mount=type=cache,id=hai-example-pnpm,target=/pnpm/store pnpm fetch --ignore-scripts
COPY . .
RUN --mount=type=cache,id=hai-example-pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile --ignore-scripts
RUN pnpm --filter mobile-app... build
FROM nginxinc/nginx-unprivileged:1.29.8-alpine AS runtime
COPY --chmod=755 scripts/container-runtime-config.sh /docker-entrypoint.d/19-hai-runtime-config.sh
COPY apps/mobile-app/images/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/mobile-app/build /usr/share/nginx/html
EXPOSE 8080
