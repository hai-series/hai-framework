/** 实际示例的公开 Core YAML 必须使用可消费字段，不能依赖未知字段被剥除。 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { core, CoreConfigSchema } from '../src/index.js'

afterEach(() => core.config.clear())

const apps = fileURLToPath(new URL('../../../apps/', import.meta.url))
const examples = readdirSync(apps, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap(entry => readdirSync(join(apps, entry.name), { withFileTypes: true }).some(child => child.isDirectory() && child.name === 'config') ? [entry.name] : [])
  .filter(name => readdirSync(join(apps, name, 'config')).includes('_core.yml'))

it.each(examples)('%s 的实际 YAML 经环境解析和严格 Core Schema 可加载', (name) => {
  const result = core.config.load(`doc-${name}`, join(apps, name, 'config', '_core.yml'), CoreConfigSchema)
  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.data.name).not.toBe('')
    expect(result.data).not.toHaveProperty('debug')
    expect(result.data).not.toHaveProperty('id')
    expect(result.data).not.toHaveProperty('features')
    expect(result.data).not.toHaveProperty('supportedLocales')
  }
})
