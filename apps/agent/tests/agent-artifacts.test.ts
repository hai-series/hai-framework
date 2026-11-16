import type { AgentResource } from '#lib/workspace.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { artifactDocument, artifactMedia } from '#lib/server/artifact-http.js'
import { artifactStore } from '#lib/server/artifacts.js'
import { initWorkspace, listResources, owner } from '#lib/server/data.js'
import { readFile } from '#lib/server/resources.js'
import { POST } from '../src/routes/api/workspace/+server.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-agent-artifacts-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
  expect((await initWorkspace()).success).toBe(true)
  expect((await artifactStore.prepare()).success).toBe(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await storage.close()
  await reldb.close()
  await rm(directory, { recursive: true, force: true })
})

function postArtifact(input: Record<string, unknown>) {
  const url = new URL('https://agent.test/api/workspace')
  // SvelteKit 的其余平台字段不参与该端点；持久化、业务动作和响应读取均使用真实实现。
  const event = {
    url,
    request: new Request(url, {
      method: 'POST',
      headers: { 'origin': url.origin, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
    locals: {
      agentUser: { id: 'alice', name: 'Alice' },
    },
  } as Parameters<typeof POST>[0]
  return POST(event)
}

it.each(['artifact-create', 'artifact-save'] as const)('returns its committed version for %s when another writer saves before response projection', async (type) => {
  vi.spyOn(core.config, 'get').mockReturnValue({})
  const user = owner({ tenantId: 'agent', userId: 'alice' })
  const originalCreate = artifactStore.create.bind(artifactStore)
  const originalSave = artifactStore.save.bind(artifactStore)
  const concurrent = async (ref: AgentResource) => {
    const baseVersion = z.number().int().positive().parse(ref.version)
    await originalSave(user, { id: ref.id, baseVersion, content: '# Concurrent later content' })
    return ref
  }
  let request: Record<string, unknown>
  if (type === 'artifact-create') {
    vi.spyOn(artifactStore, 'create').mockImplementationOnce(async (...args) => concurrent(await originalCreate(...args)))
    request = {
      type,
      title: 'Posted document',
      kind: 'markdown',
      content: '# This request content',
    }
  }
  else {
    const created = await originalCreate(user, { title: 'Posted document', kind: 'markdown', content: '# Initial version' })
    vi.spyOn(artifactStore, 'save').mockImplementationOnce(async (...args) => concurrent(await originalSave(...args)))
    request = {
      type,
      id: created.id,
      baseVersion: 1,
      content: '# This request content',
    }
  }
  const response = await postArtifact(request)
  expect(response.status).toBe(200)
  const body: unknown = await response.json()
  const document = z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    content: z.string(),
  }).parse(type === 'artifact-save'
    ? z.object({
      status: z.literal('saved'),
      document: z.unknown(),
    }).parse(body).document
    : body)
  expect(document.version).toBe(type === 'artifact-create'
    ? 1
    : 2)
  expect(document.content).toBe('# This request content')
  const latest = await artifactStore.read(user, document.id)
  expect(latest.ref.version).toBe(document.version + 1)
  expect(new TextDecoder().decode(latest.bytes)).toBe('# Concurrent later content')
})

it('rejects invalid committed version metadata instead of silently loading the latest document', async () => {
  vi.spyOn(core.config, 'get').mockReturnValue({})
  const user = owner({ tenantId: 'agent', userId: 'alice' })
  const created = await artifactStore.create(user, { title: 'Invalid operation metadata', kind: 'markdown', content: '# Initial version' })
  vi.spyOn(artifactStore, 'save').mockResolvedValueOnce({ ...created, version: 0 })
  const response = await postArtifact({
    type: 'artifact-save',
    id: created.id,
    baseVersion: 1,
    content: '# Draft',
  })
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({
    code: 'operation-failed',
    traceId: expect.any(String),
  })
})

it('pins the selected version when a concurrent edit occurs between metadata and body reads', async () => {
  const originalDescribe = artifactStore.describe.bind(artifactStore)
  for (const mode of ['document', 'media']) {
    const created = await artifactStore.create('alice', { title: 'snapshot.md', kind: 'markdown', content: 'First' })
    vi.spyOn(artifactStore, 'describe').mockImplementationOnce(async (...args) => {
      const ref = await originalDescribe(...args)
      await artifactStore.save('alice', { id: created.id, baseVersion: 1, content: 'A much longer second version' })
      return ref
    })
    if (mode === 'document') {
      const document = await artifactDocument('alice', created.id, '/api/workspace')
      expect(document.version).toBe(1)
      expect(document.content).toBe('First')
    }
    else {
      const response = await artifactMedia('alice', created.id, new Request('http://localhost/api/workspace'))
      expect(response.headers.get('etag')).toBe(`"${created.id}:1"`)
      expect(response.headers.get('content-length')).toBe('5')
      expect(await response.text()).toBe('First')
    }
    vi.restoreAllMocks()
  }
})

it('returns file reference metadata from the same snapshot as its content', async () => {
  const created = await artifactStore.create('alice', { title: 'snapshot.md', kind: 'markdown', content: 'First' })
  const originalRead = artifactStore.read.bind(artifactStore)
  vi.spyOn(artifactStore, 'read').mockImplementationOnce(async (...args) => {
    await artifactStore.save('alice', { id: created.id, baseVersion: 1, content: 'Second' })
    return originalRead(...args)
  })
  const file = await readFile('alice', created.id)
  expect(file.ref.version).toBe(2)
  expect(file.bytes.toString()).toBe('Second')
})

it('creates an owned Markdown artifact and keeps immutable readable versions', async () => {
  const original = '# Report\n\n```mermaid\nflowchart LR\n A --> B\n```\n'
  const created = await artifactStore.create('alice', { title: 'report.md', kind: 'markdown', content: original })
  expect(created.version).toBe(1)
  expect(created.artifactKind).toBe('markdown')
  const updated = await artifactStore.save('alice', { id: created.id, baseVersion: 1, content: `${original}\nAn update.\n` })
  expect(updated.version).toBe(2)
  expect(new TextDecoder().decode((await artifactStore.read('alice', created.id, 1)).bytes)).toBe(original)
  expect(new TextDecoder().decode((await artifactStore.read('alice', created.id)).bytes)).toContain('An update.')
  expect((await artifactStore.history('alice', created.id)).map(entry => entry.version)).toEqual([2, 1])
  expect((await listResources('alice', 'artifact'))[0].version).toBe(2)
})

it('does not overwrite a user edit with a stale AI version and does not create an extra history entry', async () => {
  const created = await artifactStore.create('alice', { title: 'report.md', kind: 'markdown', content: 'Original' })
  await artifactStore.save('alice', { id: created.id, baseVersion: 1, content: 'User edit' })
  await expect(artifactStore.save('alice', { id: created.id, baseVersion: 1, content: 'Stale AI edit' })).rejects.toMatchObject({ status: 409, code: 'artifact-conflict' })
  expect(new TextDecoder().decode((await artifactStore.read('alice', created.id)).bytes)).toBe('User edit')
  expect(await artifactStore.history('alice', created.id)).toHaveLength(2)
})

it('rejects cross-owner reads, history and updates', async () => {
  const created = await artifactStore.create('alice', { title: 'private.md', kind: 'markdown', content: 'Private' })
  await expect(artifactStore.read('bob', created.id)).rejects.toMatchObject({ status: 404 })
  await expect(artifactStore.history('bob', created.id)).rejects.toMatchObject({ status: 404 })
  await expect(artifactStore.save('bob', { id: created.id, baseVersion: 1, content: 'Other user' })).rejects.toMatchObject({ status: 404 })
})

it('deduplicates the same stable artifact id and rejects different bytes under that id', async () => {
  const first = await artifactStore.create('alice', { title: 'note.md', kind: 'markdown', content: 'First' })
  const duplicate = await artifactStore.create('alice', {
    id: first.id,
    title: 'note.md',
    kind: 'markdown',
    content: 'First',
  })
  expect(duplicate).toEqual(first)
  await expect(artifactStore.create('alice', {
    id: first.id,
    title: 'note.md',
    kind: 'markdown',
    content: 'Different',
  })).rejects.toMatchObject({ status: 409 })
  expect(await artifactStore.history('alice', first.id)).toHaveLength(1)
})

it('rejects media type spoofing and binary edits', async () => {
  await expect(artifactStore.create('alice', {
    title: 'fake.png',
    kind: 'image',
    mediaType: 'image/png',
    content: new Uint8Array([1, 2, 3]),
  })).rejects.toMatchObject({ status: 422 })
  const file = await artifactStore.create('alice', {
    title: 'raw.bin',
    kind: 'file',
    content: new Uint8Array([1, 2, 3]),
  })
  await expect(artifactStore.save('alice', { id: file.id, baseVersion: 1, content: 'replace binary' })).rejects.toMatchObject({ status: 422 })
})

it('rejects corrupted persisted bytes instead of returning a successful artifact', async () => {
  const created = await artifactStore.create('alice', { title: 'checked.md', kind: 'markdown', content: 'Original bytes' })
  const row = await reldb.sql.get<{ data: unknown }>('SELECT data FROM hai_agent_resource_versions WHERE resource_id = ? AND version = ?', [created.id, 1])
  expect(row.success).toBe(true)
  if (!row.success || !row.data)
    throw new Error('Expected version fixture')
  const snapshot = z.object({
    key: z.string(),
  }).parse(typeof row.data.data === 'string'
    ? JSON.parse(row.data.data)
    : row.data.data)
  expect((await storage.file.put(snapshot.key, 'Corrupted bytes')).success).toBe(true)
  await expect(artifactStore.read('alice', created.id)).rejects.toMatchObject({ status: 422, code: 'artifact-integrity' })
  const response = await artifactMedia('alice', created.id, new Request('http://localhost/api/workspace'))
  await expect(response.arrayBuffer()).rejects.toMatchObject({ status: 422, code: 'artifact-integrity' })
})

it('streams owned ranges with correct headers and rejects invalid or cross-owner requests', async () => {
  const created = await artifactStore.create('alice', { title: 'sample.bin', kind: 'file', content: '0123456789' })
  const ranged = await artifactMedia('alice', created.id, new Request('http://localhost/api/workspace', {
    headers: { range: 'bytes=2-5' },
  }))
  expect(ranged.status).toBe(206)
  expect(ranged.headers.get('content-range')).toBe('bytes 2-5/10')
  expect(ranged.headers.get('content-length')).toBe('4')
  expect(await ranged.text()).toBe('2345')
  const suffix = await artifactMedia('alice', created.id, new Request('http://localhost/api/workspace', {
    headers: { range: 'bytes=-3' },
  }))
  expect(await suffix.text()).toBe('789')
  const invalid = await artifactMedia('alice', created.id, new Request('http://localhost/api/workspace', {
    headers: { range: 'bytes=99-' },
  }))
  expect(invalid.status).toBe(416)
  expect(invalid.headers.get('content-range')).toBe('bytes */10')
  await expect(artifactMedia('bob', created.id, new Request('http://localhost/api/workspace'))).rejects.toMatchObject({ status: 404 })
})
