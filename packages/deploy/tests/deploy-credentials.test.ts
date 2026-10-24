/**
 * =============================================================================
 * @h-ai/deploy - Credentials 测试
 * =============================================================================
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deploy } from '../src/deploy-main.js'
import { HaiDeployError } from '../src/deploy-types.js'

let tmpHome: string
let previousEnv: NodeJS.ProcessEnv

beforeEach(() => {
  previousEnv = { ...process.env }
  for (const key of Object.keys(process.env)) {
    if (key === 'HAI_DEPLOY' || key.startsWith('HAI_DEPLOY_'))
      delete process.env[key]
  }
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-cred-'))
  // 模拟 HOME 目录为临时目录
  vi.stubEnv('HOME', tmpHome)
  vi.stubEnv('USERPROFILE', tmpHome)
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const key of Object.keys(process.env)) {
    if (previousEnv[key] === undefined)
      delete process.env[key]
  }
  Object.assign(process.env, previousEnv)
  if (tmpHome && fs.existsSync(tmpHome)) {
    if (path.dirname(tmpHome) !== os.tmpdir() || !path.basename(tmpHome).startsWith('hai-deploy-cred-'))
      throw new Error('Unexpected credential fixture cleanup path')
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

describe('loadCredentials', () => {
  it('全局默认不能覆盖选中模式/进程的同名值及父配置，缺项仍可补齐', () => {
    fs.mkdirSync(path.join(tmpHome, '.hai'))
    fs.writeFileSync(path.join(tmpHome, '.hai/credentials.yml'), 'HAI_DEPLOY_PROVIDER_SSH_HOST: old.example\nHAI_DEPLOY_PROVIDER_TOKEN: old-token\nHAI_DEPLOY_SERVICES_DB_APIKEY: fallback-key\n')
    process.env.HAI_DEPLOY_PROVIDER = JSON.stringify({ type: 'docker-ssh', ssh: { host: 'selected.example' } })
    process.env.HAI_DEPLOY_PROVIDER_TOKEN = 'selected-token'
    expect(deploy.credentials.load().success).toBe(true)
    expect(process.env.HAI_DEPLOY_PROVIDER_SSH_HOST).toBeUndefined()
    expect(process.env.HAI_DEPLOY_PROVIDER_TOKEN).toBe('selected-token')
    expect(process.env.HAI_DEPLOY_SERVICES_DB_APIKEY).toBe('fallback-key')
  })

  it('全局同一来源仍保留父配置与细分字段，不受注入顺序影响', () => {
    fs.mkdirSync(path.join(tmpHome, '.hai'))
    fs.writeFileSync(path.join(tmpHome, '.hai/credentials.yml'), 'HAI_DEPLOY_PROVIDER: \'{"type":"docker-ssh"}\'\nHAI_DEPLOY_PROVIDER_SSH_HOST: global.example\n')
    expect(deploy.credentials.load().success).toBe(true)
    expect(process.env.HAI_DEPLOY_PROVIDER_SSH_HOST).toBe('global.example')
  })
  it('credentials 文件不存在时应返回空列表', () => {
    const result = deploy.credentials.load()
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
      'HAI_DEPLOY_PROVIDER_TOKEN: vel_test\nHAI_DEPLOY_SERVICES_DB_APIKEY: neon_test\n',
      'utf-8',
    )

    const result = deploy.credentials.load()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toContain('HAI_DEPLOY_PROVIDER_TOKEN')
      expect(result.data).toContain('HAI_DEPLOY_SERVICES_DB_APIKEY')
    }
  })

  it('应忽略非 HAI_DEPLOY_* 键，避免注入任意环境变量', () => {
    const haiDir = path.join(tmpHome, '.hai')
    fs.mkdirSync(haiDir, { recursive: true })
    fs.writeFileSync(
      path.join(haiDir, 'credentials.yml'),
      'HAI_DEPLOY_PROVIDER_TOKEN: vel_test\nUNSAFE_TOKEN: injected\n',
      'utf-8',
    )
    delete process.env.UNSAFE_TOKEN

    const result = deploy.credentials.load()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toContain('HAI_DEPLOY_PROVIDER_TOKEN')
      expect(result.data).not.toContain('UNSAFE_TOKEN')
    }
    expect(process.env.UNSAFE_TOKEN).toBeUndefined()
  })
})

describe('saveCredential', () => {
  it('should save a single credential and create directory', () => {
    const result = deploy.credentials.save('HAI_DEPLOY_PROVIDER_TOKEN', 'vel_new')
    expect(result.success).toBe(true)

    // 验证文件已写入
    const loadResult = deploy.credentials.load()
    expect(loadResult.success).toBe(true)
    if (loadResult.success) {
      expect(loadResult.data).toContain('HAI_DEPLOY_PROVIDER_TOKEN')
    }
  })

  it('should merge with existing credentials', () => {
    deploy.credentials.save('HAI_DEPLOY_PROVIDER_TOKEN', 'vel_1')
    deploy.credentials.save('HAI_DEPLOY_SERVICES_DB_APIKEY', 'neon_1')

    const result = deploy.credentials.load()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toContain('HAI_DEPLOY_PROVIDER_TOKEN')
      expect(result.data).toContain('HAI_DEPLOY_SERVICES_DB_APIKEY')
    }
  })

  it('应拒绝保存非 HAI_DEPLOY_* 键', () => {
    const result = deploy.credentials.save('VERCEL_TOKEN', 'vel_bad')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiDeployError.CREDENTIAL_ERROR.code)
    }
  })
})

describe('saveCredentials', () => {
  it('should save all credentials at once', () => {
    const result = deploy.credentials.saveAll({
      HAI_DEPLOY_PROVIDER_TOKEN: 'vel_bulk',
      HAI_DEPLOY_SERVICES_CACHE_APIKEY: 'up_bulk',
    })
    expect(result.success).toBe(true)

    const loadResult = deploy.credentials.load()
    expect(loadResult.success).toBe(true)
    if (loadResult.success) {
      expect(loadResult.data).toContain('HAI_DEPLOY_PROVIDER_TOKEN')
      expect(loadResult.data).toContain('HAI_DEPLOY_SERVICES_CACHE_APIKEY')
    }
  })
})
