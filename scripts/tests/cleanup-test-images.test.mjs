import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { cleanupTestImages, cleanupTestImagesAsync, TEST_IMAGE_OWNER_LABEL } from '../cleanup-test-images.mjs'

const owner = 'a1111111-1111-1111-1111-111111111111'
const ref = 'localhost/hai-test-app:run-1'
const id = char => char.repeat(64)
function image(char, options = {}) {
  return { Id: id(char), Created: '2026-01-01T00:00:00Z', RepoTags: [], Config: { Labels: { [TEST_IMAGE_OWNER_LABEL]: owner } }, ...options }
}

/** 模拟引擎的真实 tag/内容 ID 状态，验证删除效果与外部资源保护，而非仅检查调用参数。 */
function engine(images) {
  const state = new Map(images.map(image => [image.Id, structuredClone(image)]))
  const run = vi.fn((runtime, args) => {
    if (args[1] === 'ls')
      return [...state.keys()].join('\n')
    if (args[1] === 'inspect') {
      return JSON.stringify(args.slice(2).map(target => [...state.values()].find(image => image.Id === target || image.RepoTags.includes(target))))
    }
    if (args[1] === 'rm') {
      expect(args).toContain('--no-prune')
      expect(args).not.toContain('--force')
      const failures = []
      for (const target of args.slice(3)) {
        const image = [...state.values()].find(image => image.Id === target || image.RepoTags.includes(target))
        if (!image)
          throw new Error('Unknown image')
        if (image.inUse || [...state.values()].some(child => child.Parent === image.Id)) {
          failures.push('Image is in use by a container or dependent child images')
          continue
        }
        if (image.Id === target || image.RepoTags.length === 1)
          state.delete(image.Id)
        else
          image.RepoTags = image.RepoTags.filter(tag => tag !== target)
      }
      if (failures.length)
        throw new Error(failures.join('\n'))
      return ''
    }
    throw new Error(`Unexpected command ${args.join(' ')}`)
  })
  return { run, state }
}

it.each(['podman', 'docker'])('%s 预览不删除；实际回收先子后父，保留公共、外部 owner 与非账本 tag', (runtime) => {
  const images = [image('a'), image('b', { Parent: id('a') }), image('c', { RepoTags: [ref] }), image('d', { Config: { Labels: { [TEST_IMAGE_OWNER_LABEL]: 'another-run' } } }), image('e', { RepoTags: ['node:24'] })]
  const { run, state } = engine(images)
  expect(cleanupTestImages({ runtime, owner, imageRefs: [ref], run }).candidates).toHaveLength(3)
  expect(state.size).toBe(5)
  const result = cleanupTestImages({ runtime, owner, imageRefs: [ref], run, apply: true })
  expect(result.failures).toEqual([])
  expect(result.removed.map(image => image.id)).toEqual([id('b'), id('a'), id('c')])
  expect([...state.keys()]).toEqual([id('d'), id('e')])
  expect(run.mock.calls.every(([engine]) => engine === runtime)).toBe(true)
})

it('同内容的外部 alias 保留，只删除本轮账本内的 tag', () => {
  const { run, state } = engine([image('a', { RepoTags: [ref, 'external:keep'] })])
  const result = cleanupTestImages({ owner, imageRefs: [ref], run, apply: true })
  expect(result.failures).toEqual([])
  expect(state.get(id('a')).RepoTags).toEqual(['external:keep'])
})

it('删除前 owner 或 tag 改变时保留镜像', () => {
  const { run, state } = engine([image('a')])
  const changing = (runtime, args) => {
    if (args[1] === 'inspect' && run.mock.calls.filter(([, call]) => call[1] === 'inspect').length === 1)
      state.get(id('a')).RepoTags = ['external:new']
    return run(runtime, args)
  }
  const result = cleanupTestImages({ owner, run: changing, apply: true })
  expect(result.preserved).toHaveLength(1)
  expect(state.has(id('a'))).toBe(true)
})

it('历史模式只回收足够旧的无 tag 构建临时层，保留在用镜像并记录', () => {
  const history = [`docker.io/library/${id('f')}-tmp:latest`]
  const { run, state } = engine([image('a', { NamesHistory: history }), image('b', { NamesHistory: history, RepoTags: ['business:keep'] }), image('c', { NamesHistory: history, Created: new Date().toISOString() }), image('d', { NamesHistory: history, inUse: true }), image('e')])
  const result = cleanupTestImages({ legacy: true, apply: true, run })
  expect(result.candidates).toHaveLength(2)
  expect(result.removed).toHaveLength(1)
  expect(result.preserved).toHaveLength(1)
  expect(result.failures).toEqual([])
  expect(state.size).toBe(4)
})

it('清理错误不阻止其他独立镜像回收，并保留失败明细', () => {
  const { run, state } = engine([image('a', { inUse: true }), image('b')])
  const result = cleanupTestImages({ owner, apply: true, run })
  expect(result.failures).toHaveLength(1)
  expect(result.removed).toHaveLength(1)
  expect([...state.keys()]).toEqual([id('a')])
})

it('未提供本轮 owner 时拒绝自动清理，历史模式必须显式选择', () => {
  const run = vi.fn()
  expect(() => cleanupTestImages({ run, apply: true })).toThrow('run ID')
  expect(run).not.toHaveBeenCalled()
})

it('异步 Worker 的原算法错误等待真实退出后传回调用方，不触达引擎', async () => {
  await expect(cleanupTestImagesAsync({ runtime: 'unavailable-engine', owner, apply: true })).rejects.toThrow('Unsupported container runtime')
})

it('从 input-type eval 宿主启动文件 Worker 时不会继承入口专用参数', () => {
  const module = new URL('../cleanup-test-images.mjs', import.meta.url).href
  const source = `import assert from 'node:assert/strict'; import { cleanupTestImagesAsync } from ${JSON.stringify(module)}; await assert.rejects(cleanupTestImagesAsync({ runtime: 'unavailable-engine', owner: ${JSON.stringify(owner)}, apply: true }), /Unsupported container runtime/); process.stdout.write('EVAL_WORKER_PASS')`
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  expect(child.error, child.stderr).toBeUndefined()
  expect(child.status, child.stdout + child.stderr).toBe(0)
  expect(child.stdout).toBe('EVAL_WORKER_PASS')
})
