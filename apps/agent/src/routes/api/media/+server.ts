import type { RequestHandler } from './$types'
import { ai } from '@h-ai/ai'
import { kit } from '@h-ai/kit'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { handleWorkspaceError, value, WorkspaceError } from '#lib/server/data.js'

const tts = z.object({
  text: z.string().trim().min(1).max(5000),
  voice: z.string().max(100).optional(),
})

export const POST: RequestHandler = kit.handler(async ({ request, url, locals }) => {
  if (!locals.agentUser)
    return json({ code: 'signed-out' }, { status: 401 })
  if (request.headers.get('origin') !== url.origin)
    return json({ code: 'origin' }, { status: 403 })
  try {
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const audio = (await request.formData()).get('audio')
      if (!(audio instanceof File) || audio.size === 0 || audio.size > 8 * 1024 * 1024)
        throw new WorkspaceError(422, 'file-type')
      const format = ['audio/wav', 'audio/x-wav'].includes(audio.type)
        ? 'wav'
        : audio.type === 'audio/mpeg'
          ? 'mp3'
          : undefined
      if (!format)
        throw new WorkspaceError(422, 'file-type')
      const result = value(await ai.audio.transcribe({
        audio: {
          data: new Uint8Array(await audio.arrayBuffer()),
          format,
        },
        signal: request.signal,
      }))
      return json({ text: result.text })
    }
    const input = tts.parse(await request.json())
    const audio = value(await ai.audio.synthesize({
      text: input.text,
      voice: input.voice || undefined,
      format: 'wav',
      signal: request.signal,
    }))
    return new Response(Uint8Array.from(audio.data).buffer, {
      headers: { 'Content-Type': 'audio/wav' },
    })
  }
  catch (error) {
    const { status, ...payload } = handleWorkspaceError(error instanceof z.ZodError
      ? new WorkspaceError(400, 'invalid')
      : error)
    return json(payload, { status })
  }
})
