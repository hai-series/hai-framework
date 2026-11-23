import type { HaiResult } from '@h-ai/core'
import type { RunnerScope } from '@h-ai/runner'
import type { ToolArtifactAccess, ToolArtifactReference, ToolRun, ToolService, ToolServiceContext } from '@h-ai/tools/server'
import type { ToolRun as WorkspaceToolRun } from '@h-ai/ui'
import type { AgentResource } from '#lib/workspace.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { runner } from '@h-ai/runner'
import { tools } from '@h-ai/tools/server'
import { z } from 'zod'
import { artifactSummary } from './artifact-http.js'
import { artifactStore } from './artifacts.js'
import { config } from './config.js'
import { findTask, owner, resource, taskBySession, value, WorkspaceError } from './data.js'
import { allowedTool, readFile } from './resources.js'

let service: ToolService | undefined
const kinds = z.enum([
  'markdown',
  'html',
  'table',
  'chart',
  'image',
  'audio',
  'video',
  'file',
])
const receiptSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{64}$/iu),
  key: z.string().min(1).max(200),
})
const referenceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.string(),
  version: z.number().int().positive(),
  mediaType: z.string(),
})
const mimeTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  html: 'text/html',
  zip: 'application/zip',
  pdf: 'application/pdf',
}

function reference(ref: AgentResource): ToolArtifactReference {
  return {
    id: ref.id,
    title: ref.title,
    kind: ref.artifactKind ?? 'file',
    version: ref.version ?? 1,
    mediaType: ref.mediaType ?? 'application/octet-stream',
  }
}

async function resourceOperation<T>(operation: () => Promise<T>): Promise<HaiResult<T>> {
  try {
    return core.ok(await operation())
  }
  catch (cause) {
    if (cause instanceof WorkspaceError)
      return core.err({ code: cause.code, message: cause.code, httpStatus: cause.status })
    throw cause
  }
}

const files: ToolArtifactAccess = {
  read: (context, input) => resourceOperation(async () => {
    context.signal?.throwIfAborted()
    const { ref, bytes } = await readFile(owner(context.scope), input.id)
    return {
      id: ref.id,
      name: ref.title,
      data: bytes,
      mediaType: ref.mediaType ?? mimeTypes[ref.title.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'application/octet-stream',
      ...(ref.artifactKind
        ? { kind: ref.artifactKind }
        : {}),
      ...(ref.version
        ? { version: ref.version }
        : {}),
    }
  }),
  publish: (context, input) => resourceOperation(async () => {
    context.signal?.throwIfAborted()
    if (!await allowed(context))
      throw new WorkspaceError(403, 'forbidden')
    const digest = context.execution && createHash('sha256').update(JSON.stringify([context.execution.id, input.kind, input.name])).digest('hex')
    const id = input.id ?? (digest
      ? `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
      : undefined)
    return reference(await artifactStore.create(owner(context.scope), {
      id,
      title: input.name,
      kind: kinds.parse(input.kind),
      mediaType: input.mediaType,
      content: input.data,
    }))
  }),
  save: (context, input) => resourceOperation(async () => {
    context.signal?.throwIfAborted()
    if (!await allowed(context))
      throw new WorkspaceError(403, 'forbidden')
    return reference(await artifactStore.save(owner(context.scope), input))
  }),
}

async function allowed(context: ToolServiceContext, name?: string) {
  if (!config().workbench.tools || context.scope.tenantId !== config().tenant)
    return false
  const user = await iam.user.getUser(context.scope.userId)
  if (!user.success || !user.data || user.data.accountStatus !== 'active' || user.data.mustChangePassword
    || (user.data.accountExpiresAt && user.data.accountExpiresAt.getTime() <= Date.now())) {
    return false
  }
  if (!context.sessionId)
    return true
  const task = await taskBySession(owner(context.scope), context.sessionId)
  return !!task && !task.archived && (!name || task.settings.tools.includes(name)
    || (['web_capture', 'video_render'].includes(name) && task.settings.tools.includes('website_video')))
}

function current() {
  if (!service)
    throw new WorkspaceError(503, 'tools-offline')
  return service
}

function receipt(id: string) {
  try {
    return receiptSchema.parse(JSON.parse(Buffer.from(id, 'base64url').toString('utf8')))
  }
  catch { throw new WorkspaceError(400, 'invalid') }
}

async function project(run: ToolRun, scope: RunnerScope): Promise<WorkspaceToolRun> {
  const phases = run.events.flatMap((event) => {
    const parsed = z.object({
      type: z.literal('phase'),
      progress: z.number().min(0).max(1),
    }).safeParse(event.data)
    return parsed.success
      ? [parsed.data.progress]
      : []
  })
  const errors = run.events.flatMap((event) => {
    const parsed = z.object({
      type: z.literal('tool-error'),
      error: z.object({
        message: z.string().max(2000),
      }),
    }).safeParse(event.data)
    return parsed.success
      ? [parsed.data.error.message]
      : []
  })
  const output = run.output
  const candidates = output && typeof output === 'object' && !Array.isArray(output)
    ? Array.isArray(output.artifacts)
      ? output.artifacts
      : [output]
    : []
  const artifacts = []
  for (const item of candidates.slice(0, 32)) {
    const parsed = referenceSchema.safeParse(item)
    if (!parsed.success)
      continue
    try {
      artifacts.push(artifactSummary(await artifactStore.describe(owner(scope), parsed.data.id, parsed.data.version), '/api/workspace'))
    }
    catch (cause) {
      // 引用已删除或不归当前主体时，不让可选成果链接遮蔽任务的真实结果。
      if (!(cause instanceof WorkspaceError) || cause.status !== 404)
        throw cause
    }
  }
  return {
    id: Buffer.from(JSON.stringify(run.receipt)).toString('base64url'),
    status: run.status,
    ...(phases.length
      ? {
          progress: phases.at(-1),
        }
      : {}),
    ...(errors.length
      ? {
          message: errors.at(-1),
        }
      : {}),
    ...(output === undefined
      ? {}
      : { result: output }),
    ...(artifacts.length
      ? { artifacts }
      : {}),
  }
}

/** 只装配框架工具、业务归属和 HTTP 投影，不维护另一份任务状态。 */
export const toolHost = {
  start() {
    const created = tools.createService({
      id: 'agent',
      runner,
      createTools(context) {
        const workbench = config().workbench
        const environments = workbench.environments
        const jobs = tools.createJobTools({
          context,
          files,
          runner,
          environments,
          browserProxy: workbench.browserProxy,
        })
        const selectedJobs = new Set(workbench.selection.tools ?? [])
        for (const group of jobs.groups ?? []) {
          if (workbench.selection.groups?.includes(group.id)) {
            for (const name of group.tools) selectedJobs.add(name)
          }
        }
        // 编排入口仅在依赖也被全局启用时提供；不能用任务授权绕过显式排除。
        const videoReady = ['web_capture', 'video_render'].every(name => selectedJobs.has(name)
          && !workbench.selection.exclude?.includes(name) && jobs.tools.some(tool => tool.name === name))
        const sets = [
          ...(workbench.artifacts
            ? [
                tools.createArtifactTools({ context, files }),
                ai.tools.createBuiltinTools({
                  context,
                  files,
                  ...(videoReady
                    ? {
                        executeJob: (request, binding) => ['web_capture', 'video_render'].includes(request.name)
                          ? current().invoke(request, binding)
                          : Promise.resolve(core.err({ code: 'forbidden', message: 'forbidden', httpStatus: 403 })),
                      }
                    : {}),
                }),
                jobs,
              ]
            : []),
          value(ai.tools.createMcpTools({
            context,
            definitions: config().tools.map(item => ({ ...item, name: `mcp_${item.id}`, title: item.description })),
            authorize: async (request) => {
              const entry = config().tools.find(item => item.serviceId === request.serviceId && item.tool === request.tool)
              if (!entry || !await allowed(context))
                return false
              if (context.sessionId)
                return allowedTool(context.scope, context.sessionId, request.serviceId, request.tool, request.arguments ?? {})
              for (const field of entry.fileArguments) {
                const parsed = z.uuid().safeParse(request.arguments?.[field])
                if (!parsed.success)
                  return false
                try {
                  await resource(owner(context.scope), parsed.data)
                }
                catch { return false }
              }
              return true
            },
          })),
        ]
        const groups = new Map<string, { id: string, title: string, tools: string[] }>()
        for (const set of sets) {
          for (const group of set.groups ?? []) {
            const prior = groups.get(group.id)
            groups.set(group.id, {
              ...group,
              tools: [
                ...(prior?.tools ?? []),
                ...group.tools,
              ],
            })
          }
        }
        return {
          tools: sets.flatMap(set => set.tools),
          groups: [
            ...groups.values(),
          ],
          environments: Object.assign({}, ...sets.map(set => set.environments ?? {})),
        }
      },
      enabled: () => config().workbench.tools
        ? config().workbench.selection
        : {},
      authorize: ({ context, name }) => allowed(context, name),
      runTimeoutMs: 1_200_000,
    })
    if (!created.success)
      return created
    service = created.data
    return core.ok(undefined)
  },
  close() {
    service?.close()
    service = undefined
  },
  service: current,
  async catalog(scope: RunnerScope, signal?: AbortSignal) {
    return value(await current().catalog({ scope, signal })).tools
  },
  async submit(scope: RunnerScope, input: { name: string, input: unknown, idempotencyKey: string, task?: string }, signal?: AbortSignal) {
    if (input.task)
      await findTask(owner(scope), input.task)
    // 手动工作台不伪造 ACP 会话；任务归属已在上面核验。
    return project(value(await current().submit(input, { scope, signal })), scope)
  },
  async inspect(scope: RunnerScope, id: string, signal?: AbortSignal) { return project(value(await current().inspect(receipt(id), { scope, signal })), scope) },
  async find(scope: RunnerScope, key: string, signal?: AbortSignal) {
    const run = value(await current().find(key, { scope, signal }))
    return run
      ? project(run, scope)
      : null
  },
  async cancel(scope: RunnerScope, id: string, signal?: AbortSignal) { return project(value(await current().cancel(receipt(id), { scope, signal })), scope) },
  async rewrite(scope: RunnerScope, input: { id: string, baseVersion: number, content: string, selectedText: string, instruction: string }, signal?: AbortSignal) {
    const result = value(await current().invoke({ name: 'document_rewrite', input }, { scope, signal }))
    return z.object({
      content: z.string(),
    }).parse(result)
  },
}
