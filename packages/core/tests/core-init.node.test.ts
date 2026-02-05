/**
 * =============================================================================
 * @hai/core - 初始化测试（Node.js）
 * =============================================================================
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { core } from '../src/core-index.node.js'

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
})
