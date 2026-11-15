import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { config } from '#lib/server/config.js'
import { handleWorkspaceError, owner, WorkspaceError } from '#lib/server/data.js'
import { readFile, upload } from '#lib/server/resources.js'
import { action, library, view } from '#lib/server/workspace.js'
import { actionSchema, id } from '#lib/workspace.js'

const pageQuery = z.object({
  task: id.optional(),
  download: id.optional(),
  preview: id.optional(),
  pane: z.enum([
    'knowledge',
    'memory',
    'files',
    'artifacts',
    'permissions',
  ]).optional(),
  query: z.string().max(400).default(''),
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

export const GET = endpoint(async ({ url }, scope) => {
  const params = pageQuery.parse(Object.fromEntries(url.searchParams))
  if (params.download) {
    const { ref, bytes } = await readFile(owner(scope), params.download)
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
  if (params.pane)
    return json(await library(scope, params.pane, params.query))
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
  return json((await action(scope, validated)) ?? null)
})
