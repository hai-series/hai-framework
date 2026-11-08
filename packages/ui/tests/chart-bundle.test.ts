import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { build } from 'vite'
import { expect, it, vi } from 'vitest'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const publicEntry = createRequire(import.meta.url).resolve('@h-ai/ui/components/scenes/charts/index')

it.each([
  'MetricCard',
  'ReportCard',
  'DashboardGrid',
  'Chart',
])('%s 的真实发布入口按需打包图形引擎', async (component) => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-ui-chart-bundle-'))
  // Vitest 默认 NODE_ENV=test；这里验收真实生产构建，避免开发组件注册阻止摇树。
  vi.stubEnv('NODE_ENV', 'production')
  try {
    const entry = join(directory, 'entry.js')
    await writeFile(entry, `export { ${component} } from ${JSON.stringify(publicEntry.replaceAll('\\', '/'))}`)
    const result = await build({
      root: packageDirectory,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        svelte({ configFile: false }),
      ],
      build: {
        write: false,
        minify: true,
        lib: {
          entry,
          formats: ['es'],
        },
        rollupOptions: {
          external: [/^svelte(?:\/.*)?$/],
        },
      },
    })
    const outputs = (Array.isArray(result)
      ? result
      : [result]).flatMap(item => 'output' in item
      ? item.output
      : [])
    const chunks = outputs.filter(item => item.type === 'chunk')
    const byName = new Map(chunks.map(item => [item.fileName, item]))
    const initial = new Set<string>()
    function include(name: string): void {
      if (initial.has(name))
        return
      const chunk = byName.get(name)
      if (!chunk)
        return
      initial.add(name)
      for (const imported of chunk.imports)
        include(imported)
    }
    for (const chunk of chunks) {
      if (chunk.isEntry)
        include(chunk.fileName)
    }
    const isEngine = (id: string) => /[\\/]layerchart[\\/]/.test(id)
    const initialEngine = [...initial].flatMap(name => Object.keys(byName.get(name)!.modules)).filter(isEngine)
    const allEngine = chunks.flatMap(chunk => Object.keys(chunk.modules)).filter(isEngine)
    expect(initialEngine).toEqual([])
    if (component === 'Chart')
      expect(allEngine.length).toBeGreaterThan(0)
    else
      expect(allEngine).toEqual([])
  }
  finally {
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
