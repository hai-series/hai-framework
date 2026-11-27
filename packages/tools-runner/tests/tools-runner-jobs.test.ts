import type { ToolArtifactAccess } from '@h-ai/tools/server'
import { Buffer } from 'node:buffer'
import { PassThrough, Readable } from 'node:stream'
import { core } from '@h-ai/core'
import { runner as frameworkRunner, HaiRunnerError } from '@h-ai/runner'
import { HaiToolsError, tools } from '@h-ai/tools'
import { expect, it, vi } from 'vitest'
import { toolsRunner } from '../src/index.js'

const files: ToolArtifactAccess = {
  read: vi.fn(async () => core.ok({
    id: 'file',
    name: 'report.pdf',
    mediaType: 'application/pdf',
    data: new Uint8Array([1]),
  })),
  publish: vi.fn(async (_context, input) => core.ok({
    id: 'artifact',
    title: input.name,
    kind: input.kind,
    version: 1,
    mediaType: input.mediaType,
  })),
}

it.each([
  ['INVALID_REQUEST', HaiToolsError.VALIDATION_FAILED],
  ['INVALID_INPUT', HaiToolsError.VALIDATION_FAILED],
  ['INVALID_PROJECT', HaiToolsError.VALIDATION_FAILED],
  ['UNSAFE_PROJECT', HaiToolsError.VALIDATION_FAILED],
  ['UNSAFE_DOCUMENT', HaiToolsError.VALIDATION_FAILED],
  ['UNSUPPORTED_PROJECT', HaiToolsError.VALIDATION_FAILED],
  ['OUTPUT_LIMIT', HaiToolsError.VALIDATION_FAILED],
  ['TIMEOUT', HaiToolsError.TIMEOUT],
  ['INVALID_OUTPUT', HaiToolsError.EXECUTION_FAILED],
  ['INVALID_WORKER_STATE', HaiToolsError.EXECUTION_FAILED],
  ['SANDBOX_UNAVAILABLE', HaiToolsError.EXECUTION_FAILED],
  ['NETWORK_POLICY_REQUIRED', HaiToolsError.EXECUTION_FAILED],
  ['ENVIRONMENT_UNAVAILABLE', HaiToolsError.EXECUTION_FAILED],
  ['TOOL_FAILED', HaiToolsError.EXECUTION_FAILED],
  ['NAVIGATION_RETRY_FAILED', HaiToolsError.EXECUTION_FAILED],
])('classifies the fixed worker rejection %s without publishing and confirms cleanup', async (code, expected) => {
  const runner = frameworkRunner.create()
  vi.spyOn(runner, 'environment').mockReturnValue(core.ok({
    id: 'docs',
    image: `sha256:${'a'.repeat(64)}`,
    backend: 'container',
    capabilities: ['documents.extract'],
    resources: {
      cpu: 1,
      memoryMiB: 512,
      pids: 64,
      scratchMiB: 256,
    },
    networkPolicy: 'offline',
  }))
  const close = vi.fn(async () => core.ok(undefined))
  const publish = vi.fn(files.publish)
  const scope = { tenantId: 'team', userId: 'alice' }
  const execution = {
    id: 'a'.repeat(64),
    scope,
    owner: { nodeId: 'node', generation: 'one' },
    signal: new AbortController().signal,
    emit: vi.fn(async () => core.ok(undefined)),
    start: vi.fn(async () => core.ok({
      stdin: new PassThrough(),
      stdout: Readable.from([`${JSON.stringify({
        success: false,
        error: { code, message: 'Worker details must not become the public message' },
      })}\n`]),
      stderr: Readable.from([]),
      wait: async () => ({ code: 0, signal: null }),
      artifact: async () => core.err(HaiToolsError.NOT_FOUND, 'Unused fixture artifact'),
      snapshot: async () => core.ok({}),
      close,
    })),
  }
  const set = toolsRunner.createJobTools({
    context: { scope, execution },
    files: { ...files, publish },
    runner,
    environments: { documents: 'docs' },
  })
  const registry = tools.createRegistry()
  expect(registry.registerMany(set.tools).success).toBe(true)
  const result = await registry.execute('documents_extract', { fileId: 'file' })
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.code).toBe(expected.code)
    expect(result.error.httpStatus).toBe(expected.httpStatus)
    expect(result.error.message).not.toContain('Worker details')
    expect(result.error.cause).toEqual({ operation: 'documents.extract', toolCode: code, executionId: execution.id })
  }
  expect(publish).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})

it.each([
  { operationFailure: 'worker', cleanupFails: true },
  { operationFailure: 'artifact', cleanupFails: true },
  { operationFailure: 'worker', cleanupFails: false },
  { operationFailure: 'none', cleanupFails: true },
  { operationFailure: 'none', cleanupFails: false },
  { operationFailure: 'none', cleanupFails: false, cancelDuringCleanup: true },
])('preserves diagnostics and publishes only after successful cleanup %j', async ({ operationFailure, cleanupFails, cancelDuringCleanup }) => {
  const runner = frameworkRunner.create()
  vi.spyOn(runner, 'environment').mockReturnValue(core.ok({
    id: 'office',
    image: `sha256:${'a'.repeat(64)}`,
    backend: 'container',
    capabilities: ['office.convert'],
    resources: {
      cpu: 1,
      memoryMiB: 1024,
      pids: 128,
      scratchMiB: 256,
    },
    networkPolicy: 'offline',
  }))
  const privateDetail = 'private-worker-or-storage-details'
  const abort = new AbortController()
  let cleaned = false
  const close = vi.fn(async () => {
    if (cleanupFails) {
      return core.err({
        ...HaiRunnerError.CLEANUP_UNCONFIRMED,
        message: 'Cleanup unconfirmed',
        ext: { cleanupStage: 'remove' },
      })
    }
    await Promise.resolve()
    if (cancelDuringCleanup)
      abort.abort()
    cleaned = true
    return core.ok(undefined)
  })
  const scope = { tenantId: 'team', userId: 'alice' }
  const artifact = Buffer.from('%PDF-fixture')
  const response = operationFailure === 'worker'
    ? {
        success: false,
        error: { code: 'UNSAFE_DOCUMENT', message: privateDetail },
      }
    : {
        success: true,
        data: {
          artifact: { name: 'result.pdf', bytes: artifact.byteLength },
        },
      }
  const publish = vi.fn<typeof files.publish>(async (context, input) => {
    expect(cleaned).toBe(true)
    return files.publish(context, input)
  })
  const set = toolsRunner.createJobTools({
    context: {
      scope,
      execution: {
        id: 'a'.repeat(64),
        scope,
        owner: { nodeId: 'node', generation: 'one' },
        signal: new AbortController().signal,
        emit: async () => core.ok(undefined),
        start: async () => core.ok({
          stdin: new PassThrough(),
          stdout: Readable.from([`${JSON.stringify(response)}\n`]),
          stderr: Readable.from([]),
          wait: async () => ({ code: 0, signal: null }),
          artifact: async () => operationFailure === 'artifact'
            ? core.err({
                ...HaiToolsError.EXECUTION_FAILED,
                message: privateDetail,
                cause: { token: privateDetail },
                ext: { body: privateDetail },
              })
            : core.ok(artifact.toString('base64')),
          snapshot: async () => core.ok({}),
          close,
        }),
      },
    },
    files: { ...files, publish },
    runner,
    environments: { office: 'office' },
  })
  const registry = tools.createRegistry()
  expect(registry.registerMany(set.tools).success).toBe(true)
  const result = await registry.execute('office_convert', { fileId: 'file' }, { signal: abort.signal })
  expect(close).toHaveBeenCalledOnce()
  if (cancelDuringCleanup) {
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiToolsError.CANCELLED.code)
  }
  else if (!cleanupFails && operationFailure === 'none') {
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        artifacts: [
          {
            title: 'result.pdf',
            mediaType: 'application/pdf',
          },
        ],
      })
    }
  }
  else {
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Expected failed operation or cleanup')
    const operationCode = operationFailure === 'worker'
      ? HaiToolsError.VALIDATION_FAILED.code
      : HaiToolsError.EXECUTION_FAILED.code
    expect(result.error.code).toBe(cleanupFails ? HaiRunnerError.CLEANUP_UNCONFIRMED.code : operationCode)
    if (cleanupFails && operationFailure !== 'none') {
      expect(result.error.ext).toMatchObject({
        cleanupStage: 'remove',
        operationError: {
          code: operationCode,
          traceId: expect.any(String),
        },
      })
      const original = result.error.ext?.operationError
      expect(original).not.toHaveProperty('cause')
      expect(original).not.toHaveProperty('ext')
      expect(JSON.stringify(result)).not.toContain(privateDetail)
    }
    else {
      expect(result.error.ext?.operationError).toBeUndefined()
    }
  }
  expect(publish).toHaveBeenCalledTimes(operationFailure === 'none' && !cleanupFails && !cancelDuringCleanup
    ? 1
    : 0)
})

it('omits unconfigured jobs and binds each configured job to its trusted environment', async () => {
  const runner = frameworkRunner.create()
  const set = toolsRunner.createJobTools({
    context: {
      scope: { tenantId: 'team', userId: 'alice' },
    },
    files,
    runner,
    environments: { documents: 'docs' },
  })
  expect(set.tools.map(tool => tool.name)).toContain('documents_extract')
  expect(set.tools.map(tool => tool.name)).not.toContain('web_capture')
  expect(set.environments?.documents_extract).toBe('docs')
  expect((await set.tools.find(tool => tool.name === 'documents_extract')!.execute({ fileId: 'file' })).success).toBe(false)
  expect(files.read).not.toHaveBeenCalled()
})

it.each(['browser_navigate', 'web_capture'])('validates the %s URL before starting an execution', async (name) => {
  const runner = frameworkRunner.create()
  vi.spyOn(runner, 'environment').mockReturnValue(core.ok({
    id: 'web',
    image: `sha256:${'a'.repeat(64)}`,
    backend: 'container',
    capabilities: ['browser.navigate', 'web.capture'],
    resources: {
      cpu: 1,
      memoryMiB: 1024,
      pids: 64,
      scratchMiB: 256,
    },
    networkPolicy: 'internal',
    network: 'egress',
  }))
  const scope = { tenantId: 'team', userId: 'alice' }
  const start = vi.fn(async () => core.err({ code: 'not-started', message: 'Fixture' }))
  const set = toolsRunner.createJobTools({
    context: {
      scope,
      execution: {
        id: 'a'.repeat(64),
        scope,
        owner: { nodeId: 'node', generation: 'one' },
        signal: new AbortController().signal,
        emit: async () => core.ok(undefined),
        start,
      },
    },
    files,
    runner,
    environments: { browser: 'web', web: 'web' },
    browserProxy: 'http://172.20.0.1:8080',
  })
  const job = set.tools.find(tool => tool.name === name)!
  const base = 'https://example.com/'
  const atLimit = base + '🌐'.repeat(2048 - base.length)
  for (const url of [
    'http://example.com',
    'https://127.0.0.1',
    'https://user:pass@example.com',
    'https://example.com:444',
    'https://example.com:/',
    'https://example.test/',
    'https://example.INTERNAL/',
    'https://-example.com/',
    'https://例え.com/',
    `${base}with space`,
    `${base}tab\t`,
    `${base}file\\name`,
    `${atLimit}a`,
  ]) {
    const result = await job.execute({ url })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiToolsError.VALIDATION_FAILED.code)
  }
  expect(start).not.toHaveBeenCalled()

  const accepted = [
    base,
    'HTTPS://Example.COM:443/path?q=one#part',
    'https://example.com:0443/',
    atLimit,
  ]
  for (const url of accepted) {
    const result = await job.execute({ url })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('not-started')
  }
  expect(start).toHaveBeenCalledTimes(accepted.length)
})

it('only advertises web jobs with a deployment-controlled valid IPv4 proxy', () => {
  for (const browserProxy of [
    undefined,
    '',
    'http://127.0.0.1:80',
    'http://169.254.1.1:80',
    'http://224.0.0.1:80',
    'http://0.0.0.0:80',
    'http://proxy.example:80',
    'http://172.20.0.1:0',
    'http://172.20.0.1:65536',
    'http://user:pass@172.20.0.1:80',
    'http://172.20.0.1:80/private',
    'http://172.20.0.1:80?token=x',
    'https://172.20.0.1:80',
  ]) {
    const set = toolsRunner.createJobTools({
      context: {
        scope: { tenantId: 'team', userId: 'alice' },
      },
      files,
      runner: frameworkRunner.create(),
      environments: { documents: 'docs', web: 'web', browser: 'browser' },
      browserProxy,
    })
    expect(set.tools.some(tool => tool.name === 'web_capture' || tool.name === 'browser_navigate')).toBe(false)
    expect(set.tools.some(tool => tool.name === 'documents_extract')).toBe(true)
  }
})

it('injects the trusted browser proxy into the actual launch without accepting input overrides', async () => {
  const runner = frameworkRunner.create()
  vi.spyOn(runner, 'environment').mockReturnValue(core.ok({
    id: 'web',
    image: `sha256:${'a'.repeat(64)}`,
    backend: 'container',
    capabilities: ['web.capture'],
    resources: {
      cpu: 1,
      memoryMiB: 1024,
      pids: 64,
      scratchMiB: 256,
    },
    networkPolicy: 'internal',
    network: 'egress',
  }))
  const scope = { tenantId: 'team', userId: 'alice' }
  const execution = {
    id: 'a'.repeat(64),
    scope,
    owner: { nodeId: 'node', generation: 'one' },
    signal: new AbortController().signal,
    emit: vi.fn(async () => core.ok(undefined)),
    start: vi.fn(async () => core.err({ code: 'not-started', message: 'Fixture' })),
  }
  const set = toolsRunner.createJobTools({
    context: { scope, execution },
    files,
    runner,
    environments: { web: 'web' },
    browserProxy: 'http://172.20.0.1:8080/',
  })
  await set.tools.find(tool => tool.name === 'web_capture')!.execute({ url: 'https://example.com/', browserProxy: 'http://127.0.0.1:1' })
  expect(execution.start).toHaveBeenCalledWith(expect.objectContaining({
    env: { HAI_TOOL_BROWSER_PROXY: 'http://172.20.0.1:8080' },
  }))
})

it('rejects document specifications outside the real format, layout and UTF-8 byte limits before execution', async () => {
  const set = toolsRunner.createJobTools({
    context: {
      scope: { tenantId: 'team', userId: 'alice' },
    },
    files,
    runner: frameworkRunner.create(),
    environments: { documents: 'docs' },
  })
  const generate = set.tools.find(tool => tool.name === 'documents_generate')!
  const invalid = [
    {
      format: 'docx',
      title: 'Report',
      slides: [
        { title: 'Slide' },
      ],
    },
    {
      format: 'pptx',
      title: 'Report',
      paragraphs: [],
      slides: [
        { title: 'Slide' },
      ],
    },
    {
      format: 'pptx',
      title: 'Report',
      slides: [
        {
          title: 'Slide',
          paragraphs: [
            'x'.repeat(161),
          ],
        },
      ],
    },
    {
      format: 'pptx',
      title: 'Report',
      slides: [
        {
          title: 'Slide',
          table: {
            headers: ['A', 'B'],
            rows: [
              ['A'],
            ],
          },
        },
      ],
    },
    {
      format: 'pptx',
      title: 'Report',
      table: {
        headers: Array.from({ length: 7 }).fill('A'),
      },
    },
    {
      format: 'pptx',
      title: 'Report',
      table: {
        headers: ['A'],
      },
      paragraphs: [
        'x'.repeat(121),
      ],
    },
    {
      format: 'docx',
      title: 'Report',
      paragraphs: Array.from({ length: 100 }, () => '中'.repeat(1000)),
    },
    { format: 'docx', title: 'Bad\u0001' },
    { format: 'docx', title: 'Report', extra: true },
  ]
  for (const input of invalid) {
    const result = await generate.execute(input)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:tools:022')
  }
})

it('describes useful form fields and runnable examples without defaulting mutually exclusive content', async () => {
  const set = toolsRunner.createJobTools({
    context: {
      scope: { tenantId: 'team', userId: 'alice' },
    },
    files,
    runner: frameworkRunner.create(),
    environments: { documents: 'docs' },
  })
  const generate = set.tools.find(tool => tool.name === 'documents_generate')!
  const definition = generate.toDefinition()
  expect(definition.examples?.length).toBeGreaterThan(0)
  for (const example of definition.examples ?? [])
    expect((await generate.parameters.safeParseAsync(example.input)).success).toBe(true)
  const parsed = await generate.parameters.safeParseAsync({
    format: 'pptx',
    title: 'Report',
    slides: [
      { title: 'Slide' },
    ],
  })
  expect(parsed.success).toBe(true)
  if (parsed.success)
    expect(parsed.data).not.toHaveProperty('paragraphs')
  expect(definition.inputSchema).toMatchObject({
    properties: {
      title: {
        title: expect.any(String),
      },
      slides: {
        title: expect.any(String),
      },
      paragraphs: {
        title: expect.any(String),
      },
    },
  })
  for (const input of [
    {
      title: 'Report',
      paragraphs: [
        'x'.repeat(2000),
      ],
    },
    {
      format: 'xlsx',
      title: 'Sheet',
      table: {
        headers: ['Cell'],
        rows: [
          ['=1+1'],
        ],
      },
    },
    {
      format: 'pptx',
      title: 'Slide',
      paragraphs: [
        'x'.repeat(160),
      ],
    },
    {
      format: 'pptx',
      title: 'Report',
      slides: [
        {
          title: 'Slide',
          table: {
            headers: ['Cell'],
            rows: [
              ['Text'],
            ],
          },
          paragraphs: [
            'x'.repeat(120),
          ],
        },
      ],
    },
    {
      format: 'docx',
      title: '😀'.repeat(200),
    },
  ])
    expect((await generate.parameters.safeParseAsync(input)).success).toBe(true)
})
