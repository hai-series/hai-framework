/** 实际应用 Vite 入口在业务验收时仍读取公共 dotenv；构建不选择部署环境。 */
import type { ConfigEnv } from 'vite'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { loadConfigFromFile } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

const applications = [
  'admin-console',
  'agent',
  'ai-playground',
  'corporate-website',
  'h5-app',
  'mobile-app',
  'desktop-app',
  'framework-website',
]

afterEach(() => {
  vi.unstubAllEnvs()
})

describe.each(applications)('%s Vite environment', (name) => {
  // 加载真实 Vite 插件及配置打包，不再使用编译插件替身。
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
      const environment: ConfigEnv = {
        mode: 'test',
        command,
        isPreview: command === 'serve',
        isSsrBuild: false,
      }
      // 复用真实 Vite 加载器，不让跨工程 import 依赖另一个应用已生成的 tsconfig。
      const loaded = await loadConfigFromFile(environment, path.resolve(import.meta.dirname, '../../', name, 'vite.config.ts'))
      expect(loaded).not.toBeNull()
      expect(process.env.VITE_E2E_DOTENV_PROBE).toBe(command === 'build'
        ? undefined
        : 'mode')
    }
    finally {
      process.chdir(originalDirectory)
      await rm(directory, { recursive: true, force: true })
    }
  }, 15_000)
})
