import type { RunnerJson } from '@h-ai/runner'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { artifactStore } from '#lib/server/artifacts.js'
import { initWorkspace, owner, WorkspaceError } from '#lib/server/data.js'
import { toolHost } from '#lib/server/tool-host.js'

const scope = { tenantId: 'agent', userId: 'alice' }
const receipt = {
  id: 'a'.repeat(64),
  key: 'projection-test',
}
const opaqueReceipt = Buffer.from(JSON.stringify(receipt)).toString('base64url')
let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-agent-tool-projection-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
  expect((await runner.init({ nodeId: 'agent-tool-projection', executor: false })).success).toBe(true)
  expect((await initWorkspace()).success).toBe(true)
  expect((await artifactStore.prepare()).success).toBe(true)
  vi.spyOn(core.config, 'get').mockImplementation(() => ({
    workbench: { selection: {} },
  }))
  expect(toolHost.start().success).toBe(true)
})

afterEach(async () => {
  toolHost.close()
  vi.restoreAllMocks()
  await runner.close()
  await storage.close()
  await reldb.close()
  await rm(directory, { recursive: true, force: true })
})

/** 隔离 Runner 已有的查询契约，验证真实宿主投影与成果归属存储。 */
async function inspect(output: RunnerJson) {
  vi.spyOn(toolHost.service(), 'inspect').mockResolvedValueOnce(core.ok({
    receipt,
    status: 'succeeded',
    output,
    events: [],
    next: 0,
  }))
  return toolHost.inspect(scope, opaqueReceipt)
}

it('preserves ordinary business objects with UUID and version without resolving them as artifacts', async () => {
  const output = {
    id: randomUUID(),
    version: 1,
    total: 100,
  }
  const describe = vi.spyOn(artifactStore, 'describe')
  const projected = await inspect(output)
  expect(projected.status).toBe('succeeded')
  expect(projected.result).toEqual(output)
  expect(projected.artifacts).toBeUndefined()
  expect(describe).not.toHaveBeenCalled()
})

it('keeps a partial artifact_read result structured without inventing an artifact link', async () => {
  const artifact = await artifactStore.create(owner(scope), { title: 'note.md', kind: 'markdown', content: 'A note' })
  const output = { id: artifact.id, version: 1, content: 'A note' }
  const describe = vi.spyOn(artifactStore, 'describe')
  const projected = await inspect(output)
  expect(projected.status).toBe('succeeded')
  expect(projected.result).toEqual(output)
  expect(projected.artifacts).toBeUndefined()
  expect(describe).not.toHaveBeenCalled()
})

it.each(['missing', 'other-owner'])('keeps the completed result when a full reference is %s', async (scenario) => {
  const id = scenario === 'missing'
    ? randomUUID()
    : (await artifactStore.create(owner({ ...scope, userId: 'bob' }), { title: 'private.md', kind: 'markdown', content: 'Private' })).id
  const output = {
    artifacts: [
      {
        id,
        title: 'external.md',
        kind: 'markdown',
        version: 1,
        mediaType: 'text/markdown',
      },
    ],
    total: 100,
  }
  const projected = await inspect(output)
  expect(projected.status).toBe('succeeded')
  expect(projected.result).toEqual(output)
  expect(projected.artifacts).toBeUndefined()
})

it('projects a full owned reference using its stored metadata', async () => {
  const artifact = await artifactStore.create(owner(scope), { title: 'owned.md', kind: 'markdown', content: 'Owned' })
  const output = {
    id: artifact.id,
    title: 'Untrusted result title',
    kind: 'markdown',
    version: 1,
    mediaType: 'text/markdown',
  }
  const projected = await inspect(output)
  expect(projected.status).toBe('succeeded')
  expect(projected.result).toEqual(output)
  expect(projected.artifacts).toHaveLength(1)
  expect(projected.artifacts?.[0]).toMatchObject({
    id: artifact.id,
    title: 'owned.md',
    kind: 'markdown',
    version: 1,
  })
})

it.each([
  new WorkspaceError(422, 'artifact-integrity'),
  new WorkspaceError(503, 'storage-unavailable'),
  new Error('Unexpected storage failure'),
])('does not hide storage or integrity failure: %s', async (failure) => {
  const output = {
    id: randomUUID(),
    title: 'note.md',
    kind: 'markdown',
    version: 1,
    mediaType: 'text/markdown',
  }
  vi.spyOn(artifactStore, 'describe').mockRejectedValueOnce(failure)
  await expect(inspect(output)).rejects.toBe(failure)
})
