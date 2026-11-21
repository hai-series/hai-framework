/** 实际应用 Vite 入口在业务验收时仍读取公共 dotenv；构建不选择部署环境。 */
import type { ConfigEnv, UserConfigExport } from 'vite'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 本用例只执行配置入口；插件的编译和文件产物由真实启动门禁覆盖。
vi.mock('@h-ai/ui/auto-import', () => ({
  autoImportHaiUi: () => ({}),
}))
vi.mock('@h-ai/ui/vite', () => ({ haiOptimizeExclude: [], haiPrebundledDeps: [] }))
vi.mock('@inlang/paraglide-js', () => ({
  paraglideVitePlugin: () => ({ name: 'test-i18n' }),
}))
vi.mock('@sveltejs/adapter-node', () => ({
  default: () => ({ name: 'test-node' }),
}))
vi.mock('@sveltejs/adapter-static', () => ({
  default: () => ({ name: 'test-static' }),
}))
vi.mock('@sveltejs/kit/vite', () => ({
  sveltekit: () => ({ name: 'test-kit' }),
}))
vi.mock('@sveltejs/vite-plugin-svelte', () => ({
  svelte: () => ({ name: 'test-svelte' }),
  vitePreprocess: () => ({}),
}))
vi.mock('@tailwindcss/vite', () => ({
  default: () => ({ name: 'test-tailwind' }),
}))

const applications: [string, () => Promise<{ default: UserConfigExport }>][] = [
  [
    'admin-console',
    () => import('../vite.config.js'),
  ],
  [
    'agent',
    () => import('../../agent/vite.config.js'),
  ],
  [
    'ai-playground',
    () => import('../../ai-playground/vite.config.js'),
  ],
  [
    'corporate-website',
    () => import('../../corporate-website/vite.config.js'),
  ],
  [
    'h5-app',
    () => import('../../h5-app/vite.config.js'),
  ],
  [
    'mobile-app',
    () => import('../../mobile-app/vite.config.js'),
  ],
  [
    'desktop-app',
    () => import('../../desktop-app/vite.config.js'),
  ],
  [
    'framework-website',
    () => import('../../framework-website/vite.config.js'),
  ],
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe.each(applications)('%s Vite environment', (_name, loadConfig) => {
  it.each(['serve', 'build'] as const)('%s 沿用真实模式文件和环境无关构建边界', async (command) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hai-vite-env-'))
    const originalDirectory = process.cwd()
    try {
      await mkdir(path.join(directory, 'config'))
      await writeFile(path.join(directory, '.env'), 'VITE_E2E_DOTENV_PROBE=base\n')
      await writeFile(path.join(directory, '.env.test'), 'VITE_E2E_DOTENV_PROBE=mode\n')
      await writeFile(path.join(directory, 'config/_crypto.yml'), 'transport: false\n')
      vi.stubEnv('HAI_E2E', '1')
      vi.stubEnv('VITE_E2E_DOTENV_PROBE', undefined)
      vi.stubEnv('HAI_BUILD_ID', 'vite-environment-test')
      vi.stubEnv('HAI_BUILD_COMMIT', 'a'.repeat(40))
      process.chdir(directory)
      const { default: config } = await loadConfig()
      if (typeof config !== 'function')
        throw new TypeError('Expected Vite config factory')
      const environment: ConfigEnv = {
        mode: 'test',
        command,
        isPreview: command === 'serve',
        isSsrBuild: false,
      }
      await config(environment)
      expect(process.env.VITE_E2E_DOTENV_PROBE).toBe(command === 'build'
        ? undefined
        : 'mode')
    }
    finally {
      vi.restoreAllMocks()
      process.chdir(originalDirectory)
      await rm(directory, { recursive: true, force: true })
    }
  })
})
