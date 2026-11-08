/** 源码缓存只接触本轮独立目录，curl 使用确定性夹具，不访问网络或运行容器。 */
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CACHE_DIR, prepareSourceContext } from '../models/build.mjs'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

const roots: string[] = []
const source = 'print("synthetic model source")\n'
const sha = createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0${source}`).digest('hex')

afterEach(() => {
  vi.resetAllMocks()
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const name = `source-review-${randomUUID()}`
  const root = join(CACHE_DIR, 'source-trees', name)
  roots.push(root)
  const revision = 'a'.repeat(40)
  const tree = 'b'.repeat(40)
  const cache = join(root, revision)
  mkdirSync(join(cache, 'context', 'indextts'), { recursive: true })
  const manifest = {
    name,
    source: { repository: 'test/fixture', revision, tree },
  }
  let fail = false
  const curl = vi.mocked(spawnSync).mockImplementation((command, args) => {
    expect(command).toBe('curl')
    const values = args ?? []
    const output = values.indexOf('--output')
    if (output >= 0) {
      writeFileSync(values[output + 1], JSON.stringify({
        sha: tree,
        tree: [
          { type: 'blob', path: 'indextts/infer_v2_5.py', sha },
        ],
      }))
    }
    else {
      if (fail) {
        return {
          pid: 0,
          output: [null, null, null],
          stdout: null,
          stderr: null,
          status: 1,
          signal: null,
        }
      }
      const config = readFileSync(values[values.indexOf('--config') + 1], 'utf8')
      for (const line of config.split('\n').filter(line => line.startsWith('output = ')))
        writeFileSync(JSON.parse(line.slice('output = '.length)), source)
    }
    return {
      pid: 0,
      output: [null, null, null],
      stdout: null,
      stderr: null,
      status: 0,
      signal: null,
    }
  })
  const prepare = () => prepareSourceContext(manifest, {})
  return {
    root,
    cache,
    tree,
    prepare,
    curl,
    fail: (value = true) => { fail = value },
  }
}

describe('模型源码缓存发布边界', () => {
  it.each([
    'complete.json',
    'tree.json',
    'curl.conf',
    'context/indextts/infer_v2_5.py',
  ])('拒绝预置硬链接 %s，外部内容保持完整', (name) => {
    const target = fixture()
    const outside = join(target.root, 'outside')
    writeFileSync(outside, 'must-not-change')
    linkSync(outside, join(target.cache, name))
    expect(target.prepare).toThrow('Unsafe model source cache file')
    expect(readFileSync(outside, 'utf8')).toBe('must-not-change')
    expect(readdirSync(target.cache).filter(name => name.startsWith('.download-'))).toEqual([])
  })

  it('固定树每轮重新获取，匹配源码复用，损坏文件只重下对应部分', () => {
    const target = fixture()
    const context = target.prepare()
    expect(readFileSync(join(context, 'indextts/infer_v2_5.py'), 'utf8')).toBe(source)
    expect(target.curl).toHaveBeenCalledTimes(2)
    target.curl.mockClear()
    expect(target.prepare()).toBe(context)
    expect(target.curl).toHaveBeenCalledTimes(1)
    target.curl.mockClear()
    writeFileSync(join(context, 'indextts/infer_v2_5.py'), 'broken source')
    target.prepare()
    expect(target.curl).toHaveBeenCalledTimes(2)
    expect(readFileSync(join(context, 'indextts/infer_v2_5.py'), 'utf8')).toBe(source)
  })

  it('缓存树自报匹配SHA并伪造blob摘要时，仍以新取得远端清单验证源码', () => {
    const target = fixture()
    const context = target.prepare()
    const tampered = 'tampered cache'
    const tamperedSha = createHash('sha1').update(`blob ${Buffer.byteLength(tampered)}\0${tampered}`).digest('hex')
    writeFileSync(join(context, 'indextts/infer_v2_5.py'), tampered)
    writeFileSync(join(target.cache, 'tree.json'), JSON.stringify({
      sha: target.tree,
      tree: [
        { type: 'blob', path: 'indextts/infer_v2_5.py', sha: tamperedSha },
      ],
    }))
    target.curl.mockClear()
    target.prepare()
    expect(target.curl).toHaveBeenCalledTimes(2)
    expect(readFileSync(join(context, 'indextts/infer_v2_5.py'), 'utf8')).toBe(source)
  })

  it('下载失败不发布完成标记并清理本轮暂存，下次可恢复', () => {
    const target = fixture()
    target.fail()
    expect(target.prepare).toThrow('curl exited with status 1')
    expect(existsSync(join(target.cache, 'complete.json'))).toBe(false)
    expect(readdirSync(target.cache).filter(name => name.startsWith('.download-'))).toEqual([])
    target.fail(false)
    expect(readFileSync(join(target.prepare(), 'indextts/infer_v2_5.py'), 'utf8')).toBe(source)
  })
})
