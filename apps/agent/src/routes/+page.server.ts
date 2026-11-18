import type { Actions, PageServerLoad } from './$types'
import { resolve } from '$app/paths'
import { core } from '@h-ai/core'
import { iam, IamConfigSchema } from '@h-ai/iam'
import { fail, redirect } from '@sveltejs/kit'
import { z } from 'zod'
import { production } from '#lib/server/config.js'

const login = z.object({
  username: z.string().trim().min(3).max(100),
  password: z.string().min(1).max(128),
})
const registration = () => IamConfigSchema.parse(core.config.get('iam')).register.enabled
export const load: PageServerLoad = ({ locals, cookies, request }) => {
  const configured = core.config.get<{ defaultLocale?: string }>('core')?.defaultLocale
  const language = cookies.get('PARAGLIDE_LOCALE') || configured || request.headers.get('accept-language')?.split(',')[0]
  return {
    user: locals.agentUser,
    registration: registration(),
    language,
  }
}

export const actions = {
  async login({ request, cookies, getClientAddress }) {
    const body = await request.formData()
    const input = login.safeParse({
      username: body.get('username'),
      password: body.get('password'),
    })
    if (!input.success)
      return fail(400, { error: 'credentials' })
    const context = {
      ip: getClientAddress(),
      userAgent: request.headers.get('user-agent') ?? undefined,
    }
    const signUp = body.get('operation') === 'signup'
    if (signUp && !registration())
      return fail(403, { error: 'credentials' })
    const result = signUp
      ? await iam.auth.registerAndLogin({ username: input.data.username, password: input.data.password }, context)
      : await iam.auth.login({ identifier: input.data.username, password: input.data.password }, context)
    if (!result.success) {
      return fail((result.error.httpStatus ?? 500) >= 500
        ? 503
        : 400, { error: 'credentials' })
    }
    cookies.set('agent_session', result.data.tokens.accessToken, {
      path: resolve('/'),
      httpOnly: true,
      secure: production(),
      sameSite: 'strict',
      maxAge: result.data.tokens.expiresIn,
    })
    redirect(303, resolve('/'))
  },
  async logout({ cookies }) {
    const cookie = cookies.get('agent_session')
    if (cookie) {
      const result = await iam.auth.logout(cookie)
      if (!result.success) {
        const traceId = result.error.traceId ?? core.id.uuid()
        core.logger.error('Agent logout revocation not confirmed', { module: 'agent', traceId, errorCode: result.error.code })
        return fail(503, { error: 'logout-unconfirmed' as const, traceId })
      }
    }
    cookies.delete('agent_session', {
      path: resolve('/'),
    })
    redirect(303, resolve('/'))
  },
} satisfies Actions
