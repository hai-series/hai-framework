import { createServer } from 'node:http'
import vm from 'node:vm'
import { expect, it } from 'vitest'
import { publicRuntimeConfig } from '../vite-runtime-config.js'

it.each(['configureServer', 'configurePreviewServer'])('%s 只输出公开字段，保留字符串和宿主注入配置', async (hook) => {
  const input = {
    apiBase: 'https://api.example.test/api/v1',
    privateKey: 'must-not-be-public',
    core: { name: '品牌 \'quotes\'\n<script>文本</script>', version: '1.0.0', env: 'test', defaultLocale: 'zh-CN', database: 'private-database' },
  }
  let middleware
  publicRuntimeConfig(input)[hook]({
    config: { base: '/' },
    middlewares: {
      use: (_route, handler) => {
        middleware = handler
      },
    },
  })
  const server = createServer((request, response) => middleware(request, response))
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/runtime-config.js`, { signal: AbortSignal.timeout(5000) })
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.text()
    expect(body).not.toContain('must-not-be-public')
    expect(body).not.toContain('private-database')
    const context = vm.createContext({ __HAI_PUBLIC_CONFIG__: { nativeFlag: true } })
    vm.runInContext(body, context)
    expect(context.__HAI_PUBLIC_CONFIG__).toMatchObject({ apiBase: input.apiBase, core: { name: input.core.name }, nativeFlag: true })
  }
  finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
