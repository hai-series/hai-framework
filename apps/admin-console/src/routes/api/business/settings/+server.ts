import { BusinessSettingsSchema, readBusinessSettings, saveBusinessSettings } from '$lib/server/business-settings.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async ({ locals }) => {
  kit.guard.require(locals.session, 'system:settings')
  const result = await readBusinessSettings()
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})

export const PUT = kit.handler(async (event) => {
  kit.guard.require(event.locals.session, 'system:settings')
  await kit.guard.requireSensitive(iam, event, 'business.settings.update')
  const input = await kit.validate.body(event.request, BusinessSettingsSchema)
  const result = await saveBusinessSettings(input)
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})
