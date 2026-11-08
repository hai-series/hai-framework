FROM node:24.22.1-bookworm-slim AS build
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
RUN pnpm --filter api-service... build
# SQLite 13 的原生二进制随 npm 包交付，在构建时验证实际加载。
RUN if [ -d node_modules/better-sqlite3 ]; then node -e "const Database=require('better-sqlite3');const db=new Database(':memory:');db.prepare('SELECT 1').get();db.close()"; fi
# 示例容器使用 CPU 推理，避免下载未配置的 CUDA 与 TensorRT 运行库。
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
RUN --mount=type=cache,id=hai-example-pnpm,target=/pnpm/store pnpm pm deploy --filter api-service --prod /prod/app
FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /prod/app ./
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
