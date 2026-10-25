import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('纯 Web 客户端打包不解析可选的 Tauri/Capacitor 插件', async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/client/index.ts', import.meta.url))],
    bundle: true,
    platform: 'browser',
    tsconfigRaw: {},
    write: false,
    logLevel: 'silent',
    plugins: [{ name: 'web-without-native-plugins', setup(builder) {
      builder.onResolve({ filter: /^@(?:tauri-apps|capacitor)\// }, args => ({ errors: [{ text: `Unexpected native dependency: ${args.path}` }] }))
    } }],
  })
  expect(result.outputFiles.length).toBeGreaterThan(0)
})
