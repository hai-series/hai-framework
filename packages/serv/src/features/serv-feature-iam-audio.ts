import type { AIFunctions } from '@h-ai/ai'
import type { IamFunctions } from '@h-ai/iam'
import type { AudioTicketVerification, ServAudioConfig } from '../serv-app.js'
import type { ServConfig } from '../serv-config.js'
import { core, HaiCommonError } from '@h-ai/core'
import { createAiMediaProcedures } from './serv-feature-ai-media.js'

/**
 * 用 IAM 保护实时语音票据与连接。应用授予 `permission` 后，客户端通过已认证的 HTTP 操作签发票据。
 * 连接消费票据时重查账号和权限，调用服务端默认模型。`false` 禁用签发和升级。
 *
 * @example 限制审计员实时朗读报告
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { apiContract } from '@h-ai/api-contract'
 * import { iam } from '@h-ai/iam'
 * import { serv } from '@h-ai/serv'
 *
 * const voice = serv.createIamAudio({ ai, iam, config: { path: '/live/voice' }, permission: 'reports:read' })
 * const audio = { issueTicket: apiContract.extensions.ai.audio.issueTicket }
 * const app = serv.createApp({
 *   auth: { iam },
 *   audio: voice.config,
 *   contract: { ai: { audio } },
 *   procedures: { ai: { audio: { issueTicket: voice.issueTicket } } },
 * })
 * ```
 */
export function createIamAudio(options: {
  readonly ai: Pick<AIFunctions, 'audio'>
  readonly iam: {
    readonly authz: Pick<IamFunctions['authz'], 'getUserAuthorization'>
    readonly ticket: Pick<IamFunctions['ticket'], 'issue' | 'consume'>
    readonly user: Pick<IamFunctions['user'], 'getUser'>
  }
  readonly config: ServConfig['audio']
  readonly permission: string
}) {
  const { ai, iam, config, permission } = options
  const canUseAudio = (permissions: readonly string[]) => core.auth.matchPermission(permission, permissions)
  const media = createAiMediaProcedures({
    ai,
    audioTickets: config
      ? {
          issue: input => iam.ticket.issue(input),
        }
      : undefined,
    authorizeMedia: ({ context, model }) => canUseAudio(context.session.permissions) && model === undefined
      ? core.ok({})
      : core.err(HaiCommonError.FORBIDDEN),
  })
  const audio: ServAudioConfig | undefined = config
    ? {
        ...config,
        ai,
        async verifyTicket(ticket) {
          const consumed = await iam.ticket.consume(ticket, { purpose: 'ai-audio' })
          if (!consumed.success)
            return consumed
          const { subjectId, grant } = consumed.data
          if ((grant.operation !== 'transcribe' && grant.operation !== 'synthesize') || grant.model !== undefined)
            return core.err(HaiCommonError.FORBIDDEN)

          const account = await iam.user.getUser(subjectId)
          if (!account.success)
            return account
          const user = account.data
          if (!user || user.accountStatus !== 'active' || user.mustChangePassword
            || (user.accountType === 'temporary' && !user.accountExpiresAt)
            || (user.accountExpiresAt && user.accountExpiresAt.getTime() <= Date.now())) {
            return core.err(HaiCommonError.FORBIDDEN)
          }

          const authorization = await iam.authz.getUserAuthorization(subjectId)
          if (!authorization.success)
            return authorization
          if (!canUseAudio(authorization.data.permissions))
            return core.err(HaiCommonError.FORBIDDEN)
          return core.ok<AudioTicketVerification>({
            session: { userId: subjectId, ...authorization.data },
            grant: { operation: grant.operation },
          })
        },
      }
    : undefined

  return { config: audio, issueTicket: media.audio.issueTicket }
}
