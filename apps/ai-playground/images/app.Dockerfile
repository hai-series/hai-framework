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
RUN pnpm --filter ai-playground... build
RUN --mount=type=cache,id=hai-examples-sqlite,target=/root/.npm/_prebuilds if [ -d node_modules/better-sqlite3 ]; then cd node_modules/better-sqlite3; node -e "require('node:child_process').execFileSync(process.execPath,[require.resolve('prebuild-install/bin.js')],{stdio:'inherit'})"; fi
# 示例容器使用 CPU 推理，避免下载未配置的 CUDA 与 TensorRT 运行库。
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
RUN --mount=type=cache,id=hai-example-pnpm,target=/pnpm/store --mount=type=cache,id=hai-examples-sqlite,target=/root/.npm/_prebuilds pnpm pm deploy --filter ai-playground --prod /prod/app
FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /prod/app ./
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "build/index.js"]
