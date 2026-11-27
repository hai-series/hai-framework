import type { ToolArtifactAccess } from '../src/tools-node-main.js'
import { core } from '@h-ai/core'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HaiToolsError } from '../src/index.js'
import { tools } from '../src/tools-node-main.js'

const context = {
  scope: { tenantId: 'team', userId: 'alice' },
}
const files: ToolArtifactAccess = {
  read: vi.fn(async () => core.ok({
    id: 'report',
    name: 'report.md',
    mediaType: 'text/markdown',
    data: new TextEncoder().encode('# Report'),
    version: 1,
  })),
  publish: vi.fn(async (_context, input) => core.ok({
    id: 'report',
    title: input.name,
    kind: input.kind,
    version: 1,
    mediaType: input.mediaType,
  })),
  save: vi.fn(async () => core.ok({
    id: 'report',
    title: 'report.md',
    kind: 'markdown',
    version: 2,
    mediaType: 'text/markdown',
  })),
}

it('creates and reads editable artifacts through the bound resource owner', async () => {
  const set = tools.createArtifactTools({ context, files })
  const create = set.tools.find(tool => tool.name === 'artifact_create')
  expect(create).toBeDefined()
  expect((await create!.execute({ title: 'Report', kind: 'markdown', content: '# Report' })).success).toBe(true)
  expect(files.publish).toHaveBeenCalledWith(expect.objectContaining({ scope: context.scope }), expect.objectContaining({ kind: 'markdown' }))
  const read = set.tools.find(tool => tool.name === 'artifact_read')!
  expect(await read.execute({ id: 'report' })).toMatchObject({
    success: true,
    data: { content: '# Report' },
  })
  for (const definition of set.tools.map(tool => tool.toDefinition())) {
    const tool = set.tools.find(tool => tool.name === definition.name)!
    for (const example of definition.examples ?? [])
      expect((await tool.parameters.safeParseAsync(example.input)).success).toBe(true)
  }
})

it('uses one configurable UTF-8 byte limit for create, edit, and read', async () => {
  let body = '中🙂'
  const publish = vi.fn(files.publish)
  const save = vi.fn(files.save!)
  const read = async () => core.ok({
    id: 'report',
    name: 'report.md',
    mediaType: 'text/markdown',
    data: new TextEncoder().encode(body),
  })
  const registry = tools.createRegistry()
  expect(registry.registerMany(tools.createArtifactTools({
    context,
    files: { read, publish, save },
    maxArtifactBytes: 7,
  }).tools).success).toBe(true)
  const create = (content: string) => registry.execute('artifact_create', { title: 'Report', kind: 'markdown', content })
  const edit = (content: string) => registry.execute('artifact_save', { id: 'report', baseVersion: 1, content })
  expect((await create(body)).success).toBe(true)
  expect((await edit(body)).success).toBe(true)
  expect(await registry.execute('artifact_read', { id: 'report' })).toMatchObject({
    success: true,
    data: { content: body },
  })
  body += '中'
  expect((await create(body)).success).toBe(false)
  expect((await edit(body)).success).toBe(false)
  expect((await registry.execute('artifact_read', { id: 'report' })).success).toBe(false)
  expect(publish).toHaveBeenCalledOnce()
  expect(save).toHaveBeenCalledOnce()
  expect(() => tools.createArtifactTools({ context, files, maxArtifactBytes: 0 })).toThrow(RangeError)
  const defaults = tools.createArtifactTools({ context, files })
  expect((await defaults.tools.find(tool => tool.name === 'artifact_create')!.execute({
    title: 'Report',
    kind: 'markdown',
    content: '中'.repeat(400_000),
  })).success).toBe(false)
})

it('reauthorizes each page and rejects a cursor after a change to the host bytes', async () => {
  let body = '\uFEFF中🙂\n"'.repeat(100)
  const read = vi.fn<ToolArtifactAccess['read']>(async () => core.ok({
    id: 'report',
    name: 'report.md',
    mediaType: 'text/markdown',
    data: new TextEncoder().encode(body),
  }))
  const execution = {
    id: 'task',
    emit: async () => core.ok(undefined),
    maxResultBytes: 173,
  }
  const reader = tools.createArtifactTools({
    context: { ...context, execution },
    files: { ...files, read },
  }).tools.find(tool => tool.name === 'artifact_read')!
  const result = await reader.execute({ id: 'report' })
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  const first = z.object({
    nextCursor: z.string(),
  }).parse(result.data)
  body += ' changed'
  expect((await reader.execute({ id: 'report', cursor: first.nextCursor })).success).toBe(false)
  expect(read).toHaveBeenCalledTimes(2)
  expect(read.mock.calls.map(args => args[1])).toEqual([
    { id: 'report' },
    { id: 'report' },
  ])
})

it('rejects an already cancelled host before calling its file callbacks', async () => {
  const signal = AbortSignal.abort('request closed')
  const read = vi.fn(files.read)
  const publish = vi.fn(files.publish)
  const save = vi.fn(files.save!)
  const registry = tools.createRegistry()
  expect(registry.registerMany(tools.createArtifactTools({
    context: { ...context, signal },
    files: { read, publish, save },
  }).tools).success).toBe(true)
  expect(await registry.execute('artifact_read', { id: 'report' })).toMatchObject({
    success: false,
    error: { code: HaiToolsError.CANCELLED.code },
  })
  expect(await registry.execute('artifact_create', { title: 'Report', kind: 'markdown', content: 'Draft' })).toMatchObject({
    success: false,
    error: { code: HaiToolsError.CANCELLED.code },
  })
  expect(await registry.execute('artifact_save', { id: 'report', baseVersion: 1, content: 'Draft' })).toMatchObject({
    success: false,
    error: { code: HaiToolsError.CANCELLED.code },
  })
  expect(read).not.toHaveBeenCalled()
  expect(publish).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})

it.each(['host', 'call'])('propagates %s cancellation to a pending file callback', async (source) => {
  const host = new AbortController()
  const call = new AbortController()
  const entered = Promise.withResolvers<AbortSignal>()
  const read: ToolArtifactAccess['read'] = async (context, input) => {
    const signal = context.signal!
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
      entered.resolve(signal)
    })
    return files.read(context, input)
  }
  const set = tools.createArtifactTools({
    context: { ...context, signal: host.signal },
    files: { ...files, read },
  })
  const reader = set.tools.find(tool => tool.name === 'artifact_read')!
  const pending = reader.execute({ id: 'report' }, { signal: call.signal })
  const observed = await entered.promise
  const cancelled = source === 'host'
    ? host
    : call
  cancelled.abort('closed')
  expect(await pending).toMatchObject({
    success: false,
    error: { code: HaiToolsError.CANCELLED.code },
  })
  expect(observed.aborted).toBe(true)
})

it('creates interoperable table/chart artifacts and computes finite numeric summaries', async () => {
  const set = tools.createArtifactTools({ context, files })
  const analyze = set.tools.find(tool => tool.name === 'data_analyze')
  expect(analyze).toBeDefined()
  const result = await analyze!.execute({
    title: 'Sales',
    rows: [
      { month: 'Jan', sales: 10 },
      { month: 'Feb', sales: 20 },
    ],
    x: 'month',
    y: 'sales',
    chartType: 'bar',
  })
  expect(result).toMatchObject({
    success: true,
    data: {
      statistics: { count: 2, sum: 30, mean: 15 },
      artifacts: expect.any(Array),
    },
  })
  expect((await analyze!.execute({
    title: 'Bad',
    rows: [
      { month: 'Jan', sales: 'oops' },
    ],
    x: 'month',
    y: 'sales',
  })).success).toBe(false)
})

it('preserves a source row_id column and produces stable row data and bounded artifact names', async () => {
  const publish = vi.fn(files.publish)
  const set = tools.createArtifactTools({
    context,
    files: { ...files, publish },
  })
  const analyze = set.tools.find(tool => tool.name === 'data_analyze')!
  const input = {
    title: 'A'.repeat(160),
    rows: [
      { row_id: 1, source_row_id: 2, value: 3 },
    ],
    x: 'row_id',
    y: 'value',
  }
  for (let attempt = 0; attempt < 2; attempt++)
    expect((await analyze.execute(input)).success).toBe(true)
  const tables = publish.mock.calls.filter(([, input]) => input.kind === 'table').map(([, input]) => JSON.parse(new TextDecoder().decode(input.data)))
  const charts = publish.mock.calls.filter(([, input]) => input.kind === 'chart').map(([, input]) => JSON.parse(new TextDecoder().decode(input.data)))
  expect(tables[0]).toEqual(tables[1])
  const sourceColumn = tables[0].table_columns.find((column: { label: string }) => column.label === 'row_id')
  expect(sourceColumn.key).not.toBe('row_id')
  expect(tables[0].table_rows[0][sourceColumn.key]).toBe(charts[0].data[0].row_id)
  expect(tables[0].table_rows[0].source_row_id).toBe(2)
  expect(publish.mock.calls.every(([, input]) => input.name.length <= 160)).toBe(true)
})

it('uses stable, distinct output identifiers for retries of the same managed execution', async () => {
  const publish = vi.fn(files.publish)
  const execution = {
    id: 'a'.repeat(64),
    scope: context.scope,
    owner: { nodeId: 'node', generation: 'one' },
    signal: new AbortController().signal,
    emit: vi.fn(async () => core.ok(undefined)),
    start: vi.fn(async () => { throw new Error('Unused process') }),
  }
  const make = () => tools.createArtifactTools({
    context: { ...context, execution },
    files: { ...files, publish },
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    const set = make()
    expect((await set.tools.find(tool => tool.name === 'artifact_create')!.execute({ title: 'Report', kind: 'markdown', content: '# Report' })).success).toBe(true)
    expect((await set.tools.find(tool => tool.name === 'data_analyze')!.execute({
      title: 'Report',
      rows: [
        { x: 'A', y: 3 },
      ],
      x: 'x',
      y: 'y',
    })).success).toBe(true)
  }
  const ids = publish.mock.calls.map(([, input]) => input.id)
  expect(ids.every(id => typeof id === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id))).toBe(true)
  expect(ids.slice(0, 3)).toEqual(ids.slice(3))
  expect(new Set(ids.slice(0, 3)).size).toBe(3)
})
