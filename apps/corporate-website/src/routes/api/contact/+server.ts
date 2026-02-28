/**
 * =============================================================================
 * Contact Form API — 使用 @h-ai/reach 发送邮件通知
 * =============================================================================
 */

import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { reach } from '@h-ai/reach'
import { z } from 'zod'

const ContactSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  message: z.string().min(1).max(2000),
})

export const POST = kit.handler(async ({ request }) => {
  const { name, email, message } = await kit.validate.formOrFail(request, ContactSchema)

  if (!reach.isInitialized) {
    core.logger.info('Contact form submission (reach not initialized)', { name, email, message })
    return kit.response.ok({ sent: false, message: 'Message received, but email delivery is not configured' })
  }

  const result = await reach.send({
    provider: 'email',
    to: 'admin@example.com',
    template: 'contact_form',
    vars: { name, email, message },
  })

  if (!result.success) {
    core.logger.error('Failed to send contact email', { error: result.error.message })
    return kit.response.ok({ sent: false, message: 'Message received, but email delivery failed' })
  }

  return kit.response.ok({ sent: true, message: 'Message sent successfully' })
})
