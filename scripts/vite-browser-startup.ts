import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'

const assetDirectory = '_hai/browser-check'
const contentTypes = {
  'startup.js': 'text/javascript; charset=utf-8',
  'update.html': 'text/html; charset=utf-8',
  'update.css': 'text/css; charset=utf-8',
}

/** 工作区 Web 示例与 CLI 模板发布同一份启动检查静态资源。 */
export function browserStartupAssets(): Plugin {
  const assets = new Map(Object.entries(contentTypes).map(([name, contentType]) => {
    const source = new URL(`../packages/cli/templates/shared/browser-check/${name}`, import.meta.url)
    return [`${assetDirectory}/${name}`, { contentType, source }]
  }))
  return {
    name: 'hai-browser-startup-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? ''
        const asset = pathname.startsWith(server.config.base) ? assets.get(pathname.slice(server.config.base.length)) : undefined
        if (!asset || (request.method !== 'GET' && request.method !== 'HEAD'))
          return next()
        response.setHeader('Content-Type', asset.contentType)
        response.end(request.method === 'HEAD' ? undefined : readFileSync(asset.source))
      })
    },
    generateBundle() {
      if (this.environment.config.build.ssr)
        return
      for (const [fileName, asset] of assets)
        this.emitFile({ type: 'asset', fileName, source: readFileSync(asset.source) })
    },
  }
}
