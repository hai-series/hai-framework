/**
 * =============================================================================
 * @hai/core - 初始化测试（Node.js）
 * =============================================================================
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.init', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hai-core-init-'))
    core.config.clear()
  })

  afterEach(() => {
    core.config.clear()
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
      debug: false,
      defaultLocale: 'zh-CN',
    })
    expect(core.config.get('app')).toEqual({ foo: 'bar' })
  })

  it('init 不传参应正常执行（无配置加载）', () => {
    expect(() => core.init()).not.toThrow()
  })

  it('init 应该支持 logging 选项', () => {
    core.init({ logging: { level: 'debug' } })
    expect(core.getLogLevel()).toBe('debug')

    // 恢复
    core.setLogLevel('info')
  })

  it('init 配置目录不存在应不崩溃', () => {
    expect(() => core.init({ configDir: join(tempDir, 'nonexistent') })).not.toThrow()
  })

  it('init 应该支持 .yaml 后缀', () => {
    writeFileSync(join(tempDir, 'settings.yaml'), 'key: value\n', 'utf-8')
    core.init({ configDir: tempDir })
    expect(core.config.get('settings')).toEqual({ key: 'value' })
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
    expect(core.getLogLevel()).toBe('warn')

    // 恢复
    core.setLogLevel('info')
  })

  it('init 带 logging 选项时应覆盖 core 配置的 logging', () => {
    writeFileSync(join(tempDir, '_core.yml'), 'name: app\nlogging:\n  level: warn\n', 'utf-8')
    core.init({ configDir: tempDir, logging: { level: 'error' } })
    // 显式传入的 logging 应优先
    expect(core.getLogLevel()).toBe('error')

    // 恢复
    core.setLogLevel('info')
  })
})
