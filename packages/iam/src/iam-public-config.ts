/** 提供给认证页面的白名单配置；不含连接信息、密钥及安全状态。 */
import type { IamConfig } from './iam-config.js'
import type { IamConfigInput } from './iam-types.js'
import { AuthUiConfigSchema, OtpConfigSchema, PasswordConfigSchema, SessionConfigSchema } from './iam-config.js'

/**
 * 认证页面可读取的白名单配置；能力开关同时考虑实际运行时依赖，不能用于服务端授权。
 * @example
 * ```ts
 * import { iam, type IamPublicConfig } from '@h-ai/iam'
 * const config: IamPublicConfig | null = iam.publicConfig
 * if (config) {
 *   const canOfferEmailOtp = config.login.email
 *   const passwordMinLength = config.password.minLength
 * }
 * ```
 */
export interface IamPublicConfig {
  /** 页面显示密码策略，不包含密码哈希或账户信息。 */
  password: ReturnType<typeof PasswordConfigSchema.parse>
  /** 自助注册开关；管理端创建账户仍需要独立授权。 */
  register: { enabled: boolean }
  /** 方式开关同时考虑配置和发送回调就绪状态，避免展示无法使用的入口。 */
  login: { password: boolean, otp: boolean, ldap: boolean, email: boolean, sms: boolean }
  /** 重置能力同时要求配置启用和通知发送回调就绪。 */
  passwordReset: { enabled: boolean, mode: 'email' | 'phone' }
  /** 单位：验证码位数、重发间隔秒；安全计数与期限只由服务端执行。 */
  otp: { length: number, resendInterval: number }
  /** 用户协议及隐私政策展示配置。 */
  agreements: IamConfig['agreements']
  /** 已经由外观 Schema 校验的标题、图像 URL 和布局。 */
  ui: ReturnType<typeof AuthUiConfigSchema.parse>
  /** 默认 access 有效时长，单位秒；真实认证期限由服务端会话状态决定。 */
  session: { maxAge: number, endOnPageHide: boolean }
  /** 仅公开操作清单，便于界面在选定操作前请求再鉴别。 */
  reauthentication: { enabled: boolean, operations: string[] }
  /** 邀请入口同时要求开关、密码重置与通知通道就绪。 */
  initialCredentials: { enabled: boolean }
}

/**
 * 仅公布配置已启用且具备运行时依赖的认证能力。
 * @param config - IamConfigSchema 解析后的设置，不含回调与密钥。
 * @param runtime - 已解析通知回调等运行时依赖；决定哪些已配置入口实际可用。
 * @returns 可序列化给认证页面的配置白名单；不含连接信息与认证凭据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function availableEmailOtp(settings: IamConfig, runtime: IamConfigInput) {
 *   return buildIamPublicConfig(settings, runtime).login.email
 * }
 * ```
 */
export function buildIamPublicConfig(config: IamConfig, runtime: IamConfigInput): IamPublicConfig {
  const otp = OtpConfigSchema.parse(config.otp ?? {})
  const session = SessionConfigSchema.parse(config.session ?? {})
  const email = config.login.otp && !!config.otp && otp.email && !!runtime.onOtpSendEmail
  const sms = config.login.otp && !!config.otp && otp.sms && !!runtime.onOtpSendSms
  return {
    password: PasswordConfigSchema.parse(config.password ?? {}),
    register: { enabled: config.register.enabled },
    login: { password: config.login.password, otp: email || sms, ldap: config.login.ldap && !!config.ldap, email, sms },
    passwordReset: { enabled: config.passwordReset?.enabled !== false && !!runtime.onPasswordResetRequest, mode: config.passwordReset?.mode ?? 'email' },
    otp: { length: otp.length, resendInterval: otp.resendInterval },
    agreements: { ...config.agreements },
    ui: AuthUiConfigSchema.parse(config.ui ?? {}),
    session: { maxAge: session.maxAge, endOnPageHide: session.endOnPageHide },
    reauthentication: { enabled: config.reauthentication?.enabled ?? false, operations: [...config.reauthentication?.operations ?? []] },
    initialCredentials: { enabled: Boolean(config.initialCredentials?.enabled && config.passwordReset?.enabled !== false && runtime.onPasswordResetRequest) },
  }
}
