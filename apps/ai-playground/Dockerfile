FROM node:24-bookworm-slim AS build
ARG SQLITE_PREBUILD_MIRROR
ENV npm_config_better_sqlite3_binary_host_mirror=$SQLITE_PREBUILD_MIRROR
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
COPY . .
RUN --mount=type=cache,id=hai-example-pnpm,target=/pnpm/store pnpm fetch
RUN --mount=type=cache,id=hai-example-pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile --ignore-scripts
RUN pnpm --filter ai-playground... build
RUN if [ -d node_modules/better-sqlite3 ]; then cd node_modules/better-sqlite3; node -e "require('node:child_process').execFileSync(process.execPath,[require.resolve('prebuild-install/bin.js')],{stdio:'inherit'})"; fi
RUN pnpm pm deploy --filter ai-playground --prod /prod/app
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /prod/app ./
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "build/index.js"]
