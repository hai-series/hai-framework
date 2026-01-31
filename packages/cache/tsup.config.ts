import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['ioredis'],
  // 排除 JSON 内容被内联到 d.ts
  esbuildOptions(options) {
    options.loader = { ...options.loader, '.json': 'copy' }
  },
})
