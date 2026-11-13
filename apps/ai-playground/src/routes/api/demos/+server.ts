import type { DemoId, IntegrationDemoId } from '#lib/demo-input.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { DemoInputSchema, integrationDemoIds } from '#lib/demo-input.js'
import * as m from '#lib/paraglide/messages.js'
import { basicDemoUnavailable, runBasicDemo } from '#lib/server/basic-demos.js'
import { readDemoJson } from '#lib/server/demo-json.js'
import { integrationDemoUnavailable, runIntegrationDemo } from '#lib/server/integration-demos.js'

const integrations = new Set<DemoId>(integrationDemoIds)

function isIntegration(id: DemoId): id is IntegrationDemoId {
  return integrations.has(id)
}

export const GET = kit.handler(async () => kit.response.ok({
  unavailable: {
    ...basicDemoUnavailable(),
    ...await integrationDemoUnavailable(),
  },
}))

export const POST = kit.handler(async ({ request, locals }) => {
  const { requestId } = locals
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return kit.response.badRequest(m.demo_request_failed(), requestId)
  const parsed = DemoInputSchema.safeParse(await readDemoJson(request))
  if (!parsed.success)
    return kit.response.badRequest(m.demo_request_failed(), requestId)
  const { id, input } = parsed.data
  const integration = isIntegration(id)
  const unavailable = integration
    ? await integrationDemoUnavailable()
    : basicDemoUnavailable()
  if (Object.hasOwn(unavailable, id))
    return kit.response.badRequest(m.demo_not_configured(), requestId)

  try {
    const result = integration
      ? await runIntegrationDemo(id, input, request.signal, locals.playgroundOwner)
      : await runBasicDemo(id, input, request.signal, locals.playgroundOwner)
    if (result.success)
      return kit.response.ok({ result: result.data })
    // 网关错误可能包含连接地址、用户内容或认证信息，只有状态和业务编号进入响应和日志。
    return kit.response.fromError({
      code: result.error.code,
      httpStatus: result.error.httpStatus,
      message: m.demo_request_failed(),
    }, requestId)
  }
  catch {
    if (!request.signal.aborted)
      core.logger.warn('AI Playground demo execution failed', { requestId, demoId: id })
    return kit.response.internalError(m.demo_request_failed(), requestId)
  }
})
