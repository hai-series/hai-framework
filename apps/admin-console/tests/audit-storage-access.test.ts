/** 公开本地文件入口不能读取私有审计归档。 */
import type { RequestEvent } from '@sveltejs/kit'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { GET } from '../src/routes/api/storage/[...key]/+server.js'

let directory = ''
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'hai-audit-access-'))
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
})
afterEach(async () => {
  await storage.close()
  if (directory) {
    const actual = await realpath(directory)
    if (!actual.startsWith(path.join(await realpath(tmpdir()), 'hai-audit-access-')))
      throw new Error('Unexpected audit access fixture path')
    await rm(actual, { recursive: true, force: true })
  }
})

function event(key: string): RequestEvent {
  const url = new URL(`https://example.test/api/storage/${key}`)
  // 仅模拟平台事件；文件读写与真实公开路由都参与验证。
  return { params: { key }, locals: {}, request: new Request(url), url } as RequestEvent
}

it('真实文件存在时仍拒绝匿名归档读取，普通公开图片读取保持可用', async () => {
  const key = 'hai-private/audit-backups/private.jsonl'
  expect((await storage.file.put(key, 'Private audit content')).success).toBe(true)
  const denied = await GET(event(key))
  expect(denied.status).toBe(404)
  expect(await denied.text()).not.toContain('Private audit content')
  for (const alias of ['HAI-PRIVATE/AUDIT-BACKUPS/private.jsonl', 'hai-private./audit-backups/private.jsonl', 'hai-private/audit-backups./private.jsonl'])
    expect((await GET(event(alias))).status).toBe(404)
  expect((await storage.file.put('avatars/user-1/public.png', 'Public avatar fixture', { contentType: 'image/png' })).success).toBe(true)
  const allowed = await GET(event('avatars/user-1/public.png'))
  expect(allowed.status).toBe(200)
  expect(await allowed.text()).toBe('Public avatar fixture')
})
