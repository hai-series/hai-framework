import type { ToolArtifactAccess } from '../src/server/tools-service-resources.js'
import { ok } from '@h-ai/core'
import { expect, it, vi } from 'vitest'
import { tools } from '../src/server/index.js'

const context = {
  scope: { tenantId: 'team', userId: 'alice' },
}
const files: ToolArtifactAccess = {
  read: vi.fn(async () => ok({
    id: 'report',
    name: 'report.md',
    mediaType: 'text/markdown',
    data: new TextEncoder().encode('# Report'),
    version: 1,
  })),
  publish: vi.fn(async (_context, input) => ok({
    id: 'report',
    title: input.name,
    kind: input.kind,
    version: 1,
    mediaType: input.mediaType,
  })),
  save: vi.fn(async () => ok({
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
    emit: vi.fn(async () => ok(undefined)),
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
