/**
 * =============================================================================
 * @h-ai/core - 初始化测试（Node.js）
 * =============================================================================
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { core, CoreConfigSchema, HaiConfigError } from '../src/index.js'

describe('core.init', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hai-core-init-'))
    core.config.clear()
  })

  afterEach(() => {
    core.config.unwatch()
    core.config.clear()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('init 应该扫描配置目录并加载配置', () => {
    writeFileSync(join(tempDir, '_core.yml'), 'name: demo\n', 'utf-8')
    writeFileSync(join(tempDir, 'app.yml'), 'foo: bar\n', 'utf-8')

    core.init({ configDir: tempDir })

    expect(core.config.get('core')).toEqual({
      name: 'demo',
      version: '0.1.0',
      env: 'development',
      defaultLocale: 'zh-CN',
    })
    expect(core.config.get('app')).toEqual({ foo: 'bar' })
  })

  it('不再接受没有运行时消费的全局 ID、debug 或业务开关', () => {
    for (const option of [
      {
        id: { length: 12 },
      },
      { debug: true },
      {
        features: { apiAccess: true },
      },
      {
        supportedLocales: ['en-US'],
      },
    ])
      expect(CoreConfigSchema.safeParse(option).success).toBe(false)
    writeFileSync(join(tempDir, '_core.yml'), 'debug: true\n', 'utf-8')
    core.init({ configDir: tempDir })
    expect(core.config.get('core')).toBeUndefined()
  })

  it('init 不传参应正常执行（无配置加载）', () => {
    expect(() => core.init()).not.toThrow()
  })

  it('init 应该支持 logging 选项', () => {
    core.init({
      logging: { level: 'debug' },
    })
    expect(core.logger.getLevel()).toBe('debug')

    // 恢复
    core.logger.setLevel('info')
  })

  it('init 配置目录不存在应不崩溃', () => {
    expect(() => core.init({
      configDir: join(tempDir, 'nonexistent'),
    })).not.toThrow()
  })

  it('目录扫描的文件系统异常仍向调用方传播', () => {
    const file = join(tempDir, 'not-a-directory.yml')
    writeFileSync(file, 'ready: true\n')
    expect(() => core.init({ configDir: file })).toThrow()
  })

  it('init 应该支持 .yaml 后缀', () => {
    writeFileSync(join(tempDir, 'settings.yaml'), 'key: value\n', 'utf-8')
    core.init({ configDir: tempDir })
    expect(core.config.get('settings')).toEqual({ key: 'value' })
  })

  it.each(['_deploy.yml', '_deploy.yaml', 'deploy.yml'])('所有 YAML 配置均按文件名约定加载和监听 %s', (filename) => {
    writeFileSync(join(tempDir, filename), 'business: true\n')

    core.init({ configDir: tempDir, watchConfig: true })

    expect(core.config.get('deploy')).toEqual({ business: true })
    expect(core.config.isWatching('deploy')).toBe(true)
  })

  it('项目构建部署 JSON 不参与运行时 YAML 扫描', () => {
    writeFileSync(join(tempDir, 'hai.json'), JSON.stringify({
      deploy: {
        provider: {
          // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
          ssh: { host: '${HAI_SSH_HOST}' },
        },
      },
    }))
    writeFileSync(join(tempDir, 'app.yml'), 'ready: true\n')

    core.init({ configDir: tempDir, watchConfig: true })

    expect(core.config.has('hai')).toBe(false)
    expect(core.config.has('deploy')).toBe(false)
    expect(core.config.get('app')).toEqual({ ready: true })
  })

  it('手动加载 YAML 报告缺失变量，提供变量后可读取', () => {
    vi.stubEnv('HAI_DEPLOY', undefined)
    vi.stubEnv('HAI_DEPLOY_PROVIDER', undefined)
    vi.stubEnv('HAI_DEPLOY_PROVIDER_SSH', undefined)
    vi.stubEnv('HAI_DEPLOY_PROVIDER_SSH_HOST', undefined)
    const file = join(tempDir, '_deploy.yaml')
    writeFileSync(file, `provider:\n  ssh:\n    host: \${HAI_DEPLOY_PROVIDER_SSH_HOST}\n`)

    const missing = core.config.load('deploy', file)
    expect(missing.success).toBe(false)
    if (!missing.success)
      expect(missing.error.code).toBe(HaiConfigError.CONFIG_ENV_VAR_MISSING.code)

    vi.stubEnv('HAI_DEPLOY_PROVIDER_SSH_HOST', 'deployment.example.test')
    const loaded = core.config.load('deploy', file)
    expect(loaded.success).toBe(true)
    if (loaded.success) {
      expect(loaded.data).toEqual({
        provider: {
          ssh: { host: 'deployment.example.test' },
        },
      })
    }
  })

  it('单项配置加载或重载失败时记录位置和追踪编号，保留有效配置且不输出原文', () => {
    const appPath = join(tempDir, 'app.yml')
    writeFileSync(join(tempDir, 'broken.yml'), 'connection: [demo-private-value\n')
    writeFileSync(appPath, 'ready: true\n')
    const errors = vi.fn()
    const stop = core.logger.observe((record) => {
      if (record.level === 'error')
        errors(record)
    })

    try {
      core.context.run({ requestId: 'config-startup' }, () => {
        core.init({
          configDir: tempDir,
          logging: { level: 'info', format: 'json' },
          watchConfig: true,
        })
      })
      expect(errors).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        message: expect.stringContaining('Config load failed: broken'),
        context: expect.objectContaining({
          code: HaiConfigError.CONFIG_PARSE_ERROR.code,
          traceId: 'config-startup',
          line: 2,
          column: 1,
        }),
      }))
      expect(JSON.stringify(errors.mock.calls)).not.toContain('demo-private-value')
      expect(core.config.has('broken')).toBe(false)
      expect(core.config.isWatching('broken')).toBe(false)
      expect(core.config.isWatching('app')).toBe(true)

      errors.mockClear()
      writeFileSync(appPath, 'connection: [demo-reload-value\n')
      const reloaded = core.context.run({ requestId: 'config-reload' }, () => core.config.reload('app'))
      expect(reloaded.success).toBe(false)
      if (!reloaded.success) {
        expect(reloaded.error.code).toBe(HaiConfigError.CONFIG_PARSE_ERROR.code)
        expect(reloaded.error.cause).toBeInstanceOf(Error)
      }
      expect(errors).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        message: expect.stringContaining('Config watch or reload failed: app'),
        context: expect.objectContaining({ code: HaiConfigError.CONFIG_PARSE_ERROR.code, traceId: 'config-reload', filePath: appPath }),
      }))
      expect(JSON.stringify(errors.mock.calls)).not.toContain('demo-reload-value')
      expect(core.config.get('app')).toEqual({ ready: true })
    }
    finally { stop() }
  })

  it('init watchConfig 应该启用配置文件监听', () => {
    writeFileSync(join(tempDir, '_core.yml'), 'name: watch-test\n', 'utf-8')
    core.init({ configDir: tempDir, watchConfig: true })
    expect(core.config.isWatching('core')).toBe(true)
    core.config.unwatch()
  })

  it('init 加载 core 配置应自动配置 logger', () => {
    writeFileSync(join(tempDir, '_core.yml'), 'name: app\nlogging:\n  level: warn\n', 'utf-8')
    core.init({ configDir: tempDir })
    // core config 中的 logging.level 应被应用
    expect(core.logger.getLevel()).toBe('warn')

    // 恢复
    core.logger.setLevel('info')
  })

  it('init 带 logging 选项时应覆盖 core 配置的 logging', () => {
    writeFileSync(join(tempDir, '_core.yml'), 'name: app\nlogging:\n  level: warn\n', 'utf-8')
    core.init({
      configDir: tempDir,
      logging: { level: 'error' },
    })
    // 显式传入的 logging 应优先
    expect(core.logger.getLevel()).toBe('error')

    // 恢复
    core.logger.setLevel('info')
  })
})
