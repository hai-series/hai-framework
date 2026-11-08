import type { RequestEvent } from '@sveltejs/kit'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ensureVisionTable } from '../src/lib/server/vision-records.js'
import { POST as upload } from '../src/routes/api/upload/+server.js'
import { GET as download } from '../src/routes/api/upload/[...key]/+server.js'
import { GET as history } from '../src/routes/api/vision/history/+server.js'
import { POST as recognize } from '../src/routes/api/vision/recognize/+server.js'

// 只替换外部模型；会话边界、文件和数据库写入使用实际应用实现。
vi.mock('@h-ai/ai', () => ({
  ai: {
    isInitialized: true,
    llm: {
      chat: async () => ({
        success: true,
        data: {
          choices: [
            {
              message: { content: '{"summary":"fixture","tags":[],"confidence":1}' },
            },
          ],
        },
      }),
    },
  },
}))

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-h5-owned-files-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
  await ensureVisionTable()
})
afterEach(async () => {
  await storage.close()
  await reldb.close()
  await rm(directory, { recursive: true, force: true })
})

function event(userId?: string, key = ''): RequestEvent {
  // 端点只消费这些由 SvelteKit 提供的字段；会话为本地合成身份。
  return {
    params: { key },
    locals: {
      session: userId
        ? { userId, permissions: [] }
        : undefined,
    },
    request: new Request('https://app.test/api/upload'),
  } as RequestEvent
}

it('上传与识图写入绑定可信会话，不允许匿名制造文件或记录', async () => {
  function input(userId?: string): RequestEvent {
    const form = new FormData()
    form.set('file', new File(['fixture-image'], 'photo.png', { type: 'image/png' }))
    return {
      ...event(userId),
      request: new Request('https://app.test/api/upload', { method: 'POST', body: form }),
    }
  }
  expect((await upload(input())).status).toBe(401)
  expect((await recognize(input())).status).toBe(401)
  const uploaded = await upload(input('member-a'))
  expect(uploaded.status).toBe(200)
  expect(await uploaded.json()).toMatchObject({
    data: {
      key: expect.stringMatching(/^uploads\/member-a\/[\w-]+\.png$/),
    },
  })
  const recognized = await recognize(input('member-a'))
  expect(recognized.status).toBe(200)
  const body = await recognized.json() as { data: { id: string, key: string, imageUrl: string } }
  expect(body.data.key).toMatch(/^vision\/member-a\/[\w-]+\.png$/)
  expect(body.data.imageUrl).toBe(`/api/upload/${body.data.key}`)
  expect(await reldb.sql.get('SELECT user_id FROM vision_records WHERE id=?', [body.data.id])).toMatchObject({
    success: true,
    data: { user_id: 'member-a' },
  })
})

it('识图历史只返回当前用户的数据，匿名和归属不明的旧记录均不可读', async () => {
  for (const [id, owner] of [
    ['mine', 'member-a'],
    ['other', 'member-b'],
    ['legacy', null],
  ]) {
    expect((await reldb.sql.execute('INSERT INTO vision_records (id,user_id,storage_key,file_name,mime_type,prompt,analysis,tags_json,confidence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [
      id,
      owner,
      `vision/${id}.png`,
      `${id}.png`,
      'image/png',
      id,
      id,
      '[]',
      1,
      '1',
    ])).success).toBe(true)
  }
  expect((await history(event())).status).toBe(401)
  const response = await history(event('member-a'))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    data: [
      { id: 'mine' },
    ],
  })
})

it('迁移保留旧识图记录，所有者保持未知且重复启动不重复改写', async () => {
  expect((await reldb.sql.execute('DROP TABLE vision_records')).success).toBe(true)
  expect((await reldb.sql.execute('CREATE TABLE vision_records (id TEXT PRIMARY KEY,storage_key TEXT,file_name TEXT,mime_type TEXT,prompt TEXT,analysis TEXT,tags_json TEXT,confidence REAL,created_at TEXT)')).success).toBe(true)
  expect((await reldb.sql.execute('INSERT INTO vision_records VALUES (?,?,?,?,?,?,?,?,?)', [
    'legacy',
    'vision/legacy.png',
    'legacy.png',
    'image/png',
    'private',
    'kept',
    '[]',
    1,
    '1',
  ])).success).toBe(true)
  await ensureVisionTable()
  await ensureVisionTable()
  expect(await reldb.sql.get('SELECT user_id, analysis FROM vision_records WHERE id=?', ['legacy'])).toMatchObject({
    success: true,
    data: { user_id: null, analysis: 'kept' },
  })
  expect(await (await history(event('member-a'))).json()).toMatchObject({ data: [] })
})

it('文件读取只开放当前用户的规范图片键，私有对象和旧无归属键保持拒绝', async () => {
  for (const key of [
    'uploads/member-a/photo.png',
    'vision/member-a/photo.png',
    'uploads/member-b/photo.png',
    'uploads/legacy.png',
    'hai-private/secret.json',
  ])
    expect((await storage.file.put(key, 'fixture', { contentType: 'image/png' })).success).toBe(true)
  expect((await download(event(undefined, 'uploads/member-a/photo.png'))).status).toBe(401)
  for (const key of [
    'uploads/member-b/photo.png',
    'uploads/legacy.png',
    'hai-private/secret.json',
    'uploads/member-a/photo.png.',
  ])
    expect((await download(event('member-a', key))).status).toBe(404)
  for (const key of ['uploads/member-a/photo.png', 'vision/member-a/photo.png']) {
    const response = await download(event('member-a', key))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('fixture')
  }
})
