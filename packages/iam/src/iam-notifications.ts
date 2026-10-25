/** 将已初始化 Reach 的标准模板接入 IAM，显式回调可覆盖默认发送。 */
import type { IamConfigInput, IamNotificationContext } from './iam-types.js'
import { iamM } from './iam-i18n.js'

/**
 * 返回实际可用的回调；SDK/投递异常由 IAM 的公共边界转为 HaiResult。
 * @param input - 应用注入的 IAM 设置与运行时依赖。
 * @returns 已注入或能由现有 Reach 模板提供的通知回调；不具备发送实现的字段保持 undefined。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const callbacks = await resolveIamNotifications({ login: { otp: false }, passwordReset: { enabled: false } })
 * const emailConfigured = callbacks.onOtpSendEmail !== undefined
 * ```
 */
export async function resolveIamNotifications(input: IamConfigInput): Promise<Pick<IamConfigInput, 'onOtpSendEmail' | 'onOtpSendSms' | 'onPasswordResetRequest'>> {
  const callbacks = { onOtpSendEmail: input.onOtpSendEmail, onOtpSendSms: input.onOtpSendSms, onPasswordResetRequest: input.onPasswordResetRequest }
  const reach = input.reach
  if (!reach?.isInitialized)
    return callbacks
  // 已关闭的功能和显式回调不依赖 Reach；只为缺少发送实现的通道查询模板。
  const needsEmail = input.login?.otp !== false && !!input.otp && input.otp.email !== false && !callbacks.onOtpSendEmail
  const needsSms = input.login?.otp !== false && !!input.otp && input.otp.sms !== false && !callbacks.onOtpSendSms
  const needsReset = input.passwordReset?.enabled !== false && !callbacks.onPasswordResetRequest
  if (!needsEmail && !needsSms && !needsReset)
    return callbacks
  const templates = await reach.template.list()
  if (!templates.success)
    throw new Error(iamM('iam_securityStateFailed'))
  const configured = new Map(templates.data.map(template => [template.name, template.provider]))
  async function send(template: string, to: string, vars: Record<string, string>, context: IamNotificationContext) {
    const provider = configured.get(template)
    if (!reach?.isInitialized || !provider || !to)
      throw new Error(iamM('iam_passwordResetDeliveryFailed'))
    // Reach 的返回结果与投递状态都必须成功，不能把 HTTP/调用完成当作通知送达。
    const result = await reach.send({ provider, to, template, vars, idempotencyKey: context.idempotencyKey, sensitive: true, expiresAt: context.expiresAt.getTime() })
    if (!result.success || !result.data.success)
      throw new Error(iamM('iam_passwordResetDeliveryFailed'))
  }
  if (needsEmail && configured.has('otp_email'))
    callbacks.onOtpSendEmail = (email, code, context) => send('otp_email', email, { code }, context)
  if (needsSms && configured.has('otp_sms'))
    callbacks.onOtpSendSms = (phone, code, context) => send('otp_sms', phone, { code }, context)
  const resetTemplate = input.passwordReset?.mode === 'phone' ? 'password_reset_sms' : 'password_reset'
  if (needsReset && configured.has(resetTemplate)) {
    callbacks.onPasswordResetRequest = (user, token, context) => {
      const url = input.passwordReset?.resetUrl ? new URL(input.passwordReset.resetUrl) : null
      url?.searchParams.set('token', token)
      const vars = { token, expiresAt: context.expiresAt.toISOString(), resetUrl: url?.toString() ?? token }
      return send(resetTemplate, input.passwordReset?.mode === 'phone' ? user.phone ?? '' : user.email ?? '', vars, context)
    }
  }
  return callbacks
}
