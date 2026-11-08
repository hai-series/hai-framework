import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { it } from 'vitest'

// 从真实应用依赖树解析构建依赖，确保补丁实际应用于调用方。
const require = createRequire(new URL('../../apps/admin-console/package.json', import.meta.url))
const merge = require('deepmerge')

// 浏览器 UMD 入口在独立 realm 运行，验证实际发布文件而非重写合并算法。
const browser = vm.createContext({})
vm.runInContext(readFileSync(require.resolve('deepmerge/dist/umd.js'), 'utf8'), browser)
const entries = [
  ['CommonJS', merge],
  [
    'UMD CommonJS',
    require('deepmerge/dist/umd.js'),
  ],
  ['UMD browser', browser.deepmerge],
]

it.each(entries)('%s rejects nested and array-element prototype poisoning from both operands', (_name, mergeEntry) => {
  const input = JSON.parse('{"settings":{"__proto__":{"polluted":true},"enabled":true},"list":[{"__proto__":{"polluted":true},"count":1}]}')
  const cleanPrototype = Object.getPrototypeOf(mergeEntry({}, {}))
  for (const [target, source] of [
    [input, {}],
    [{}, input],
    [
      Object.create(null),
      input,
    ],
  ]) {
    const result = mergeEntry(target, source)
    for (const object of [result, result.settings, ...result.list]) {
      assert.equal(Object.getPrototypeOf(object), cleanPrototype)
      assert.equal('polluted' in object, false)
      assert.equal(Object.hasOwn(object, '__proto__'), false)
    }
    assert.equal(result.settings.enabled, true)
    assert.equal(result.list[0].count, 1)
  }
  assert.equal(Object.prototype.polluted, undefined)
})

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
