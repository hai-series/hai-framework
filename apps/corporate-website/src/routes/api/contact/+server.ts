/**
 * Contact Form API — 使用 @h-ai/reach 发送邮件通知
 */

import process from 'node:process'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const ContactSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  message: z.string().min(1).max(2000),
})

export const POST = kit.handler(async ({ request }) => {
  const { name, email, message } = await kit.validate.body(request, ContactSchema)

  const reachModule = await import('@h-ai/reach')
    .then(mod => mod.reach)
    .catch(() => null)

  if (!reachModule?.isInitialized) {
    core.logger.info('Contact form submission skipped because reach is not initialized', {
      nameLength: name.length,
      emailDomain: email.split('@')[1] ?? 'unknown',
      messageLength: message.length,
    })
    return kit.response.ok({ sent: false, message: 'Message received, but email delivery is not configured' })
  }

  const recipient = process.env.HAI_CONTACT_RECIPIENT?.trim()
  if (!recipient) {
    core.logger.warn('Contact form submission skipped because HAI_CONTACT_RECIPIENT is not configured', {
      emailDomain: email.split('@')[1] ?? 'unknown',
      messageLength: message.length,
    })
    return kit.response.ok({ sent: false, message: 'Message received, but email delivery is not configured' })
  }

  const result = await reachModule.send({
    provider: 'email',
    to: recipient,
    template: 'contact_form',
    vars: { name, email, message },
  })

  if (!result.success) {
    core.logger.error('Failed to send contact email', { error: result.error?.message ?? 'unknown error' })
    return kit.response.ok({ sent: false, message: 'Message received, but email delivery failed' })
  }

  return kit.response.ok({ sent: true, message: 'Message sent successfully' })
})
