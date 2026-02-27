/**
 * =============================================================================
 * @h-ai/deploy - Scanner 测试
 * =============================================================================
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scanApp } from '../src/deploy-scanner.js'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-scan-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** 在临时目录下创建文件并写入内容 */
function writeFile(relativePath: string, content: string): void {
  const fullPath = path.join(tmpDir, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf-8')
}

describe('scanApp', () => {
  it('should detect SvelteKit project with adapter-vercel', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'test-app',
      dependencies: {
        '@sveltejs/kit': '^2.0.0',
        '@sveltejs/adapter-vercel': '^5.0.0',
      },
      scripts: { build: 'vite build' },
    }))
    writeFile('svelte.config.js', 'export default {}')

    const result = await scanApp(tmpDir)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.appName).toBe('test-app')
      expect(result.data.isSvelteKit).toBe(true)
      expect(result.data.adapterInstalled).toBe(true)
      expect(result.data.buildCommand).toBe('vite build')
    }
  })

  it('should detect required services from dependencies', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'full-app',
      dependencies: {
        '@sveltejs/kit': '^2.0.0',
        '@sveltejs/adapter-vercel': '^5.0.0',
        '@h-ai/db': 'workspace:*',
        '@h-ai/cache': 'workspace:*',
        '@h-ai/storage': 'workspace:*',
      },
    }))

    const result = await scanApp(tmpDir)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.requiredServices).toContain('db')
      expect(result.data.requiredServices).toContain('cache')
      expect(result.data.requiredServices).toContain('storage')
    }
  })

  it('should return SCAN_FAILED for missing package.json', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-empty-'))

    const result = await scanApp(emptyDir)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(9008) // SCAN_FAILED
    }

    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('should handle non-SvelteKit project', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'plain-app',
      dependencies: { express: '^4.0.0' },
    }))

    // 删除 svelte.config.js（如果存在）
    const svelteConfig = path.join(tmpDir, 'svelte.config.js')
    if (fs.existsSync(svelteConfig)) {
      fs.unlinkSync(svelteConfig)
    }

    const result = await scanApp(tmpDir)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isSvelteKit).toBe(false)
      expect(result.data.adapterInstalled).toBe(false)
    }
  })

  it('should extract scoped package name correctly', async () => {
    writeFile('package.json', JSON.stringify({
      name: '@my-org/awesome-app',
      dependencies: {},
    }))

    const result = await scanApp(tmpDir)
    expect(result.success).toBe(true)
    if (result.success) {
      // 去掉 scope 前缀
      expect(result.data.appName).not.toContain('@')
    }
  })
})
