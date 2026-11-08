import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { it } from 'vitest'

// 从真实应用依赖树解析构建依赖，确保补丁实际应用于调用方。
const require = createRequire(new URL('../../apps/admin-console/package.json', import.meta.url))
const merge = require('deepmerge')

it('deepmerge rejects prototype poisoning from either merge operand', () => {
  const input = JSON.parse('{"__proto__":{"polluted":true},"settings":{"enabled":true}}')
  for (const [target, source] of [
    [input, {}],
    [{}, input],
    [
      Object.create(null),
      input,
    ],
  ]) {
    const result = merge(target, source)
    assert.equal(Object.getPrototypeOf(result), Object.prototype)
    assert.equal('polluted' in result, false)
    assert.equal(Object.hasOwn(result, '__proto__'), false)
    assert.deepEqual(result.settings, { enabled: true })
  }
  assert.equal(Object.prototype.polluted, undefined)
})

it('deepmerge preserves nested configuration, arrays, and symbol properties', () => {
  const key = Symbol('configuration')
  const target = {
    feature: { enabled: true },
    list: [1],
    [key]: { first: true },
  }
  const result = merge(target, {
    feature: { count: 2 },
    list: [2],
    [key]: { second: true },
  })
  assert.deepEqual(result.feature, { enabled: true, count: 2 })
  assert.deepEqual(result.list, [1, 2])
  assert.deepEqual(result[key], { first: true, second: true })
  assert.deepEqual(target.feature, { enabled: true })
})
