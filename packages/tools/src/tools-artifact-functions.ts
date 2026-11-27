import type { ToolArtifact, ToolArtifactAccess, ToolArtifactPublishInput } from './tools-artifact-types.js'
import type { ToolServiceContext, ToolSet } from './tools-invocation-types.js'
import type { Tool } from './tools-types.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { defineTool } from './tools-functions.js'
import { toolsM } from './tools-i18n.js'
import { HaiToolsError } from './tools-types.js'

/**
 * 可编辑产物工具所需的宿主权限接口。
 * @example
 * ```ts
 * import type { ArtifactToolOptions } from '@h-ai/tools/server'
 * function owner(options: ArtifactToolOptions) { return options.context.scope.userId }
 * ```
 */
export interface ArtifactToolOptions {
  context: ToolServiceContext
  files: ToolArtifactAccess
  /** 产物正文的 UTF-8 字节上限，默认 1 MiB。 */
  maxArtifactBytes?: number
}

/**
 * 构造可编辑产物及数据分析工具，持久化由宿主负责。
 * @example 模块内部上下文
 * ```ts
 * function build(options: ArtifactToolOptions) { return createArtifactTools(options) }
 * ```
 */
export function createArtifactTools({ context, files, maxArtifactBytes = 1024 * 1024 }: ArtifactToolOptions): ToolSet {
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes <= 0)
    throw new RangeError('maxArtifactBytes must be a positive safe integer')
  const binding = (signal: AbortSignal) => {
    signal.throwIfAborted()
    return { ...context, signal }
  }
  const identifier = z.string().min(1).max(200).meta({
    format: 'artifact-id',
    title: toolsM('tools_field_id'),
  })
  const title = z.string().trim().min(1).max(160).meta({
    title: toolsM('tools_field_title'),
  })
  const content = z.string().max(maxArtifactBytes).refine(value => Buffer.byteLength(value) <= maxArtifactBytes).meta({
    title: toolsM('tools_field_content'),
  })
  const editable = z.enum(['markdown', 'html', 'table', 'chart']).meta({
    title: toolsM('tools_field_kind'),
  })
  const mediaType = (kind: string) => kind === 'markdown'
    ? 'text/markdown'
    : kind === 'html'
      ? 'text/html'
      : 'application/json'
  const invalid = () => core.err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'))
  const toArtifact = (name: string, kind: string, text: string, output: string): ToolArtifactPublishInput => ({
    ...(context.execution
      ? {
          id: identifierFor(context.execution.id, output),
        }
      : {}),
    name,
    kind,
    mediaType: mediaType(kind),
    data: new TextEncoder().encode(text),
  })
  const definitions: Tool[] = [
    defineTool({
      name: 'artifact_create',
      title: toolsM('tools_artifactCreate'),
      description: toolsM('tools_artifactCreateDescription'),
      examples: [
        {
          label: toolsM('tools_example_markdown'),
          input: {
            title: toolsM('tools_example_noteTitle'),
            kind: 'markdown',
            content: toolsM('tools_example_noteContent'),
          },
        },
      ],
      parameters: z.object({ title, kind: editable, content }),
      resultHandler: async (input, { signal }) => {
        if ((input.kind === 'table' || input.kind === 'chart')) {
          try {
            if (!z.record(z.string(), z.unknown()).safeParse(JSON.parse(input.content)).success)
              return invalid()
          }
          catch { return invalid() }
        }
        return files.publish(binding(signal), toArtifact(input.title, input.kind, input.content, 'artifact_create:artifact'))
      },
    }, context.signal),
    defineTool({
      name: 'artifact_read',
      title: toolsM('tools_artifactRead'),
      description: toolsM('tools_artifactReadDescription'),
      parameters: z.object({
        id: identifier,
        cursor: z.string().regex(/^[\w-]{43}\.\d{1,16}$/u).optional(),
      }),
      resultHandler: async (input, { signal }) => {
        const file = await files.read(binding(signal), { id: input.id })
        signal.throwIfAborted()
        if (!file.success)
          return file
        if (file.data.data.byteLength > maxArtifactBytes || !/^(?:text\/(?:markdown|html|plain)|application\/json)$/u.test(file.data.mediaType))
          return invalid()
        let text: string
        try {
          text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.data.data)
        }
        catch { return invalid() }
        const page = readPage(file.data, text, context.execution?.maxResultBytes, input.cursor)
        return page
          ? core.ok(page)
          : invalid()
      },
    }, context.signal),
  ]
  const publishBatch = files.publishBatch?.bind(files)
  if (publishBatch) {
    definitions.push(defineTool({
      name: 'data_analyze',
      title: toolsM('tools_dataAnalyze'),
      description: toolsM('tools_dataAnalyzeDescription'),
      examples: [
        {
          label: toolsM('tools_example_sales'),
          input: {
            title: toolsM('tools_example_sales'),
            rows: [
              { month: 'Jan', sales: 10 },
              { month: 'Feb', sales: 20 },
            ],
            x: 'month',
            y: 'sales',
            chartType: 'bar',
          },
        },
      ],
      parameters: z.object({
        title,
        rows: z.array(z.record(z.string().min(1).max(100), z.union([
          z.string().max(4000),
          z.number().finite(),
        ]))).min(1).max(2000).meta({
          title: toolsM('tools_field_rows'),
        }),
        x: z.string().min(1).max(100).meta({
          title: toolsM('tools_field_x'),
        }),
        y: z.string().min(1).max(100).meta({
          title: toolsM('tools_field_y'),
        }),
        chartType: z.enum([
          'bar',
          'line',
          'area',
          'pie',
          'scatter',
        ]).default('bar').meta({
          title: toolsM('tools_field_chartType'),
        }),
      }),
      resultHandler: async (input, { signal }) => {
        if (input.rows.some(row => !Object.hasOwn(row, input.x) || !Object.hasOwn(row, input.y) || typeof row[input.y] !== 'number'))
          return invalid()
        const numbers = z.array(z.number().finite()).parse(input.rows.map(row => row[input.y]))
        const sum = numbers.reduce((sum, value) => sum + value, 0)
        if (!Number.isFinite(sum))
          return invalid()
        const keys = [
          ...new Set(input.rows.flatMap(row => Object.keys(row))),
        ]
        if (keys.length > 50)
          return invalid()
        // row_id 是编辑器保留字段；原始同名列单独映射，标签仍保留来源名称。
        let rowColumn = 'source_row_id'
        while (keys.includes(rowColumn))
          rowColumn = `${rowColumn}_source`
        const keyFor = (key: string) => key === 'row_id'
          ? rowColumn
          : key
        const table = toArtifact(`${input.title.slice(0, 149)}.table.json`, 'table', JSON.stringify({
          table_columns: keys.map(key => ({
            key: keyFor(key),
            label: key,
            type: input.rows.every(row => typeof row[key] === 'number')
              ? 'number'
              : 'text',
          })),
          table_rows: input.rows.map((row, index) => ({
            ...Object.fromEntries(Object.entries(row).map(([key, value]) => [
              keyFor(key),
              value,
            ])),
            row_id: `row-${index + 1}`,
          })),
        }), 'data_analyze:table')
        const chart = toArtifact(`${input.title.slice(0, 149)}.chart.json`, 'chart', JSON.stringify({
          type: input.chartType,
          data: input.rows,
          x: input.x,
          y: input.y,
        }), 'data_analyze:chart')
        if (table.data.byteLength > maxArtifactBytes || chart.data.byteLength > maxArtifactBytes)
          return invalid()
        const published = await publishBatch(binding(signal), [table, chart])
        if (!published.success)
          return published
        return core.ok({
          statistics: {
            count: numbers.length,
            sum,
            mean: sum / numbers.length,
            min: Math.min(...numbers),
            max: Math.max(...numbers),
          },
          artifacts: published.data,
        })
      },
    }, context.signal))
  }
  if (files.save) {
    const save = files.save
    definitions.push(defineTool({
      name: 'artifact_save',
      title: toolsM('tools_artifactSave'),
      description: toolsM('tools_artifactSaveDescription'),
      parameters: z.object({
        id: identifier,
        baseVersion: z.number().int().positive().meta({
          title: toolsM('tools_field_baseVersion'),
        }),
        content,
      }),
      resultHandler: (input, { signal }) => save(binding(signal), input),
    }, context.signal))
  }
  return {
    tools: definitions,
    groups: [
      {
        id: 'documents',
        title: toolsM('tools_documents'),
        tools: ['artifact_create', 'artifact_read', 'artifact_save'],
      },
      ...(publishBatch
        ? [
            {
              id: 'analysis',
              title: toolsM('tools_dataAnalyze'),
              tools: ['data_analyze'],
            },
          ]
        : []),
    ],
  }
}

/** 游标绑定已通过宿主授权读取到的文件及当前字节，避免分页时拼接不同版本。 */
function readPage(file: ToolArtifact, text: string, maxBytes?: number, cursor?: string) {
  const base = file.version === undefined
    ? { id: file.id }
    : { id: file.id, version: file.version }
  const full = { ...base, content: text }
  const fits = (value: object) => maxBytes === undefined || Buffer.byteLength(JSON.stringify(value)) <= maxBytes
  if (cursor === undefined && fits(full))
    return full

  const fingerprint = createHash('sha256').update(JSON.stringify(base)).update(file.data).digest('base64url')
  const offset = cursor === undefined
    ? 0
    : Number(cursor.slice(fingerprint.length + 1))
  const splitsCharacter = (position: number) => {
    const code = text.charCodeAt(position)
    return code >= 0xDC00 && code <= 0xDFFF
  }
  if (cursor !== undefined && (!cursor.startsWith(`${fingerprint}.`) || !Number.isSafeInteger(offset)
    || offset <= 0 || offset >= text.length || splitsCharacter(offset))) {
    return undefined
  }

  const remainder = {
    ...base,
    content: text.slice(offset),
  }
  if (maxBytes === undefined || fits(remainder))
    return remainder

  // JSON 的转义会增加传输字节数，按实际结果查找能容纳的正文结尾。
  const page = (end: number) => ({
    ...base,
    content: text.slice(offset, end),
    nextCursor: `${fingerprint}.${end}`,
  })
  let lower = offset + 1
  let upper = Math.min(text.length - 1, offset + maxBytes)
  let end = offset
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2)
    const boundary = splitsCharacter(middle)
      ? middle - 1
      : middle
    if (fits(page(boundary))) {
      end = boundary
      lower = middle + 1
    }
    else {
      upper = middle - 1
    }
  }
  return end > offset
    ? page(end)
    : undefined
}

/** 同一次受管执行的逻辑输出使用相同 UUID，不覆盖宿主的内容一致性核验。 */
function identifierFor(executionId: string, output: string): string {
  const digest = createHash('sha256').update(`${executionId}:${output}`).digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}
