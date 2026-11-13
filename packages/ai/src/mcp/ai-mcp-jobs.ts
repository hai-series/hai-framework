import type { RunnerFunctions } from '@h-ai/runner'
import type { MCPExternalServer } from '../ai-config.js'
import type { MCPJobFiles, MCPServiceAuthorization, MCPServiceRequest } from './ai-mcp-types.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'

const kind = 'ai-mcp-job'
const fileName = /^[a-z0-9][\w.-]{0,127}$/i
const identity = z.string().min(1).max(128)
const maxFileBytes = 50 * 1024 * 1024
const maxResultBytes = 2 * 1024 * 1024
const operations = z.enum([
  'documents.extract',
  'office.convert',
  'office.recalculate',
  'ocr.recognize',
])
const language = z.enum([
  'eng',
  'chi_sim',
  'jpn',
  'eng+chi_sim',
  'eng+jpn',
])
const jobInput = z.strictObject({
  serviceId: identity,
  tool: operations,
  taskId: identity.optional(),
  environmentId: identity,
  serviceDigest: z.string().regex(/^[\da-f]{64}$/),
  fileId: z.string().regex(fileName),
  language: language.optional(),
})
const jobResult = z.union([
  z.strictObject({
    text: z.string().max(256 * 1024),
  }),
  z.strictObject({
    fileId: z.string().regex(fileName),
    name: z.string().regex(fileName),
  }),
])
const toolResult = z.strictObject({
  success: z.literal(true),
  data: z.union([
    z.strictObject({
      text: z.string().max(256 * 1024),
    }),
    z.strictObject({
      artifact: z.strictObject({
        name: z.string().regex(fileName),
        bytes: z.number().int().min(1).max(maxFileBytes),
      }),
    }),
  ]),
})
const fixedCommand = [
  'import subprocess, sys',
  'tool = subprocess.run(["/usr/local/bin/hai-tool"], input=sys.argv[1].encode("utf-8"))',
  'if tool.returncode != 0: sys.exit(1)',
  'sys.stdin.buffer.read(1)',
].join('\n')

const serviceDigest = (service: MCPExternalServer) => createHash('sha256').update(JSON.stringify(service)).digest('hex')

/**
 * 将已授权的固定文档操作提交给 Runner。执行节点复核目录与文件权限。
 * @example
 * ```ts
 * // 模块内部上下文：runner 为应用注入的已初始化实例。
 * function jobs(read: (id: string) => Promise<MCPExternalServer | undefined>, runner: RunnerFunctions, files: MCPJobFiles) { return createMCPJobs(read, runner, files) }
 * ```
 */
export function createMCPJobs(
  read: (id: string) => Promise<MCPExternalServer | undefined>,
  runner: RunnerFunctions,
  files: MCPJobFiles,
) {
  function validateEnvironment(environmentId: string, operation: string) {
    const environment = runner.environment(environmentId)
    return environment.success
      && environment.data.networkPolicy === 'offline'
      && environment.data.capabilities.includes(operation)
  }

  const registration = runner.register(kind, async (payload, context) => {
    const input = jobInput.parse(payload)
    const service = await read(input.serviceId)
    if (!service
      || service.transport !== 'job'
      || service.environmentId !== input.environmentId
      || !service.allowedTools?.includes(input.tool)
      || serviceDigest(service) !== input.serviceDigest
      || !validateEnvironment(input.environmentId, input.tool)
      || (input.language && input.tool !== 'ocr.recognize')) {
      throw new Error('MCP tool job policy changed')
    }

    const fileContext = {
      principal: context.scope,
      taskId: input.taskId,
      jobId: context.id,
      signal: context.signal,
    }
    const file = await files.read({ ...fileContext, fileId: input.fileId })
    if (!file.success || !fileName.test(file.data.name) || file.data.base64.length > Math.ceil(maxFileBytes / 3) * 4)
      throw new Error('MCP tool file unavailable')
    context.signal.throwIfAborted()
    const extension = extname(file.data.name).toLowerCase()
    const source = `source${extension}`
    const output = input.tool === 'office.convert'
      ? 'result.pdf'
      : input.tool === 'office.recalculate' && ['.xlsx', '.ods'].includes(extension)
        ? `result${extension}`
        : undefined
    const request = {
      operation: input.tool,
      input: source,
      ...(output
        ? { output }
        : {}),
      ...(input.language
        ? { language: input.language }
        : {}),
    }
    const process = await context.start({
      command: '/usr/bin/python3',
      args: [
        '-I',
        '-S',
        '-c',
        fixedCommand,
        JSON.stringify(request),
      ],
      inputs: { [source]: file.data.base64 },
    })
    if (!process.success)
      throw new Error('MCP tool runtime unavailable')
    process.data.stderr.resume()
    const result = await (async () => {
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const raw of process.data.stdout.iterator({ destroyOnReturn: false })) {
        context.signal.throwIfAborted()
        const chunk = Buffer.from(raw)
        bytes += chunk.length
        if (bytes > maxResultBytes)
          throw new Error('MCP tool response limit')
        chunks.push(chunk)
        if (chunk.includes(10))
          break
      }
      const data = toolResult.parse(JSON.parse(Buffer.concat(chunks).toString('utf8').trim())).data
      if ('text' in data) {
        if (output || Buffer.byteLength(data.text) > 256 * 1024)
          throw new Error('Unexpected MCP tool response')
        return data
      }
      if (!output || data.artifact.name !== output)
        throw new Error('Unexpected MCP tool artifact')
      const artifact = await process.data.artifact(output, data.artifact.bytes)
      if (!artifact.success || Buffer.from(artifact.data, 'base64').length !== data.artifact.bytes)
        throw new Error('MCP tool artifact unavailable')
      context.signal.throwIfAborted()
      const published = await files.publish({ ...fileContext, name: output, base64: artifact.data })
      if (!published.success)
        throw new Error('MCP tool artifact storage rejected')
      return jobResult.parse({ fileId: published.data.fileId, name: output })
    })().then(data => ({ success: true as const, data }), (cause: unknown) => ({ success: false as const, cause }))
    if (!(await process.data.close()).success)
      throw new Error('MCP tool process cleanup unconfirmed')
    if (!result.success)
      throw result.cause
    return result.data
  })
  if (!registration.success)
    throw new Error('MCP job executor registration failed')

  return {
    close: registration.data,
    async invoke(
      service: MCPExternalServer,
      request: MCPServiceRequest,
      principal: MCPServiceAuthorization['principal'],
      taskId: string | undefined,
      signal: AbortSignal,
    ) {
      const args = z.strictObject({
        fileId: z.string().regex(fileName),
        language: language.optional(),
      }).safeParse(request.arguments)
      const parsed = jobInput.safeParse({
        serviceId: request.serviceId,
        tool: request.tool,
        taskId,
        environmentId: service.environmentId,
        serviceDigest: serviceDigest(service),
        ...(args.success
          ? args.data
          : {}),
      })
      if (!parsed.success || (parsed.data.language && parsed.data.tool !== 'ocr.recognize')
        || !validateEnvironment(parsed.data.environmentId, parsed.data.tool)) {
        throw new Error('Invalid MCP tool job')
      }
      const timeoutMs = Math.max(100, service.timeoutMs ?? 30_000)
      signal.throwIfAborted()
      const input = parsed.data
      const submitted = await runner.submit({
        scope: principal,
        kind,
        environmentId: input.environmentId,
        input: {
          serviceId: input.serviceId,
          tool: input.tool,
          fileId: input.fileId,
          environmentId: input.environmentId,
          serviceDigest: input.serviceDigest,
          ...(input.language
            ? { language: input.language }
            : {}),
          ...(input.taskId
            ? { taskId: input.taskId }
            : {}),
        },
        queueTimeoutMs: timeoutMs,
        runTimeoutMs: timeoutMs,
      })
      if (!submitted.success)
        throw new Error('MCP tool job admission failed')
      try {
        let current = submitted.data
        while (['queued', 'running', 'cancelling'].includes(current.status)) {
          await setTimeout(40, undefined, { signal })
          const found = await runner.get(principal, current.id)
          if (!found.success)
            throw new Error('MCP tool job unavailable')
          current = found.data
        }
        signal.throwIfAborted()
        if (current.status !== 'succeeded')
          throw new Error('MCP tool job did not complete')
        const data = jobResult.parse(current.output)
        return {
          content: [
            {
              type: 'text' as const,
              text: 'text' in data
                ? data.text
                : JSON.stringify(data),
            },
          ],
          structuredContent: data,
        }
      }
      finally {
        if (signal.aborted)
          await runner.cancel(principal, submitted.data.id)
      }
    },
  }
}
