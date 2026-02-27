/**
 * =============================================================================
 * @h-ai/deploy - Credentials 测试
 * =============================================================================
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadCredentials,
  saveCredential,
  saveCredentials,
} from '../src/deploy-credentials.js'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-cred-'))
  // 模拟 HOME 目录为临时目录
  vi.stubEnv('HOME', tmpHome)
  vi.stubEnv('USERPROFILE', tmpHome)
})

afterAll(() => {
  vi.unstubAllEnvs()
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

describe('loadCredentials', () => {
  it('credentials 文件不存在时应返回空列表', () => {
    const result = loadCredentials()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('should load existing credentials from yaml', async () => {
    const haiDir = path.join(tmpHome, '.hai')
    fs.mkdirSync(haiDir, { recursive: true })
    fs.writeFileSync(
      path.join(haiDir, 'credentials.yml'),
      'HAI_DEPLOY_VERCEL_TOKEN: vel_test\nHAI_DEPLOY_NEON_KEY: neon_test\n',
      'utf-8',
    )

    const result = loadCredentials()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toContain('HAI_DEPLOY_VERCEL_TOKEN')
      expect(result.data).toContain('HAI_DEPLOY_NEON_KEY')
    }
  })
})

describe('saveCredential', () => {
  it('should save a single credential and create directory', () => {
    const result = saveCredential('HAI_DEPLOY_VERCEL_TOKEN', 'vel_new')
    expect(result.success).toBe(true)

    // 验证文件已写入
    const loadResult = loadCredentials()
    expect(loadResult.success).toBe(true)
    if (loadResult.success) {
      expect(loadResult.data).toContain('HAI_DEPLOY_VERCEL_TOKEN')
    }
  })

  it('should merge with existing credentials', () => {
    saveCredential('HAI_DEPLOY_VERCEL_TOKEN', 'vel_1')
    saveCredential('HAI_DEPLOY_NEON_KEY', 'neon_1')

    const result = loadCredentials()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toContain('HAI_DEPLOY_VERCEL_TOKEN')
      expect(result.data).toContain('HAI_DEPLOY_NEON_KEY')
    }
  })
})

describe('saveCredentials', () => {
  it('should save all credentials at once', () => {
    const result = saveCredentials({
      HAI_DEPLOY_VERCEL_TOKEN: 'vel_bulk',
      HAI_DEPLOY_UPSTASH_KEY: 'up_bulk',
    })
    expect(result.success).toBe(true)

    const loadResult = loadCredentials()
    expect(loadResult.success).toBe(true)
    if (loadResult.success) {
      expect(loadResult.data).toContain('HAI_DEPLOY_VERCEL_TOKEN')
      expect(loadResult.data).toContain('HAI_DEPLOY_UPSTASH_KEY')
    }
  })
})
