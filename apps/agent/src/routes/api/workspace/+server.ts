import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import * as m from '#lib/paraglide/messages.js'
import { artifactDocument, artifactMedia, artifactSummary } from '#lib/server/artifact-http.js'
import { artifactStore } from '#lib/server/artifacts.js'
import { config } from '#lib/server/config.js'
import { handleWorkspaceError, listTasks, owner, resource, WorkspaceError } from '#lib/server/data.js'
import { readFile, upload } from '#lib/server/resources.js'
import { toolHost } from '#lib/server/tool-host.js'
import { action, library, view } from '#lib/server/workspace.js'
import { actionSchema, id } from '#lib/workspace.js'

const pageQuery = z.object({
  task: id.optional(),
  download: id.optional(),
  preview: id.optional(),
  artifact: id.optional(),
  artifactHistory: id.optional(),
  media: id.optional(),
  version: z.coerce.number().int().positive().max(999_999).optional(),
  attachment: z.literal('1').optional(),
  catalog: z.literal('1').optional(),
  toolRun: z.string().min(1).max(512).optional(),
  toolKey: z.string().min(1).max(200).optional(),
  pane: z.enum([
    'tasks',
    'knowledge',
    'memory',
    'files',
    'artifacts',
    'permissions',
  ]).optional(),
  query: z.string().max(400).default(''),
  archived: z.enum(['0', '1']).default('0'),
  cursor: z.string().min(1).max(64).optional(),
  after: z.coerce.number().int().min(0).max(100_000).default(0),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  latest: z.literal('1').optional(),
})

function endpoint(operation: (event: Pick<Parameters<RequestHandler>[0], 'request' | 'url' | 'locals'>, scope: { tenantId: string, userId: string }) => Promise<Response>): RequestHandler {
  return kit.handler(async (event) => {
    if (!event.locals.agentUser)
      return json({ code: 'signed-out' }, { status: 401 })
    try {
      return await operation(event, { tenantId: config().tenant, userId: event.locals.agentUser.id })
    }
    catch (error) {
      const known = error instanceof z.ZodError
        ? new WorkspaceError(400, 'invalid')
        : error
      const { status, ...output } = handleWorkspaceError(known)
      return json(output, { status })
    }
  })
}

export const GET = endpoint(async ({ url, request }, scope) => {
  const params = pageQuery.parse(Object.fromEntries(url.searchParams))
  if (params.catalog)
    return json(await toolHost.catalog(scope, request.signal))
  if (params.toolRun)
    return json(await toolHost.inspect(scope, params.toolRun, request.signal))
  if (params.toolKey)
    return json(await toolHost.find(scope, params.toolKey, request.signal))
  if (params.artifact || params.artifactHistory || params.media) {
    if (!config().workbench.artifacts)
      throw new WorkspaceError(403, 'feature-disabled')
    const user = owner(scope)
    if (params.media)
      return artifactMedia(user, params.media, request, params.version, params.attachment === '1')
    if (params.artifactHistory)
      return json((await artifactStore.history(user, params.artifactHistory)).map(ref => artifactSummary(ref, url.pathname)))
    return json(await artifactDocument(user, params.artifact!, url.pathname, params.version))
  }
  if (params.download) {
    const ref = await resource(owner(scope), params.download)
    if (ref.kind === 'artifact' && ref.artifactKind) {
      if (!config().workbench.artifacts)
        throw new WorkspaceError(403, 'feature-disabled')
      return artifactMedia(owner(scope), params.download, request, undefined, true)
    }
    const { bytes } = await readFile(owner(scope), params.download)
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(ref.title)}`,
      },
    })
  }
  if (params.preview) {
    const { ref, bytes } = await readFile(owner(scope), params.preview)
    if (ref.kind !== 'artifact' || !ref.project)
      throw new WorkspaceError(404, 'missing')
    return json({
      title: ref.title,
      patch: bytes.subarray(0, 128_000).toString(),
      files: ref.files ?? [],
      project: ref.project,
      partial: bytes.length > 128_000,
    })
  }
  if (params.pane === 'tasks') {
    return json(await listTasks(owner(scope), {
      query: params.query,
      archived: params.archived === '1',
      cursor: params.cursor,
      untitled: m.untitled(),
      signal: request.signal,
    }))
  }
  if (params.pane)
    return json(await library(scope, params.pane, params.query, params.cursor))
  return json(await view(scope, params.task, params.after, params.offset, params.latest === '1'))
})

export const POST = endpoint(async ({ request, url }, scope) => {
  if (request.headers.get('origin') !== url.origin)
    throw new WorkspaceError(403, 'origin')
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const data = await request.formData()
    const file = data.get('file')
    if (!(file instanceof File))
      throw new WorkspaceError(400, 'file-type')
    return json(await upload(owner(scope), file))
  }
  const validated = actionSchema.parse(await request.json())
  const output = await action(scope, validated, request.signal)
  if (validated.type === 'artifact-create' || validated.type === 'artifact-save') {
    const committed = z.object({
      id,
      version: z.number().int().positive().max(999_999),
    }).safeParse(output)
    if (!committed.success)
      throw new Error('Artifact operation returned invalid version metadata')
    const document = await artifactDocument(owner(scope), committed.data.id, url.pathname, committed.data.version)
    return json(validated.type === 'artifact-save'
      ? { status: 'saved', document }
      : document)
  }
  return json(output ?? null)
})

export const HEAD = GET
