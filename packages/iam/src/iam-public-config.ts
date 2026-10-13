/** 提供给认证页面的白名单配置；不含连接信息、密钥及安全状态。 */
import type { IamConfig } from './iam-config.js'
import type { IamConfigInput } from './iam-types.js'
import { AuthUiConfigSchema, OtpConfigSchema, PasswordConfigSchema, SessionConfigSchema } from './iam-config.js'

export interface IamPublicConfig {
  /** 页面显示密码策略，不包含密码哈希或账户信息。 */
  password: ReturnType<typeof PasswordConfigSchema.parse>
  register: { enabled: boolean }
  /** 方式开关同时考虑配置和发送回调就绪状态，避免展示无法使用的入口。 */
  login: { password: boolean, otp: boolean, ldap: boolean, email: boolean, sms: boolean }
  passwordReset: { enabled: boolean, mode: 'email' | 'phone' }
  /** 单位：验证码位数、重发间隔秒；安全计数与期限只由服务端执行。 */
  otp: { length: number, resendInterval: number }
  agreements: IamConfig['agreements']
  ui: ReturnType<typeof AuthUiConfigSchema.parse>
  session: { maxAge: number }
}

/** 仅公布配置已启用且具备运行时依赖的认证能力。 */
export function buildIamPublicConfig(config: IamConfig, runtime: IamConfigInput): IamPublicConfig {
  const otp = OtpConfigSchema.parse(config.otp ?? {})
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
    session: { maxAge: SessionConfigSchema.parse(config.session ?? {}).maxAge },
  }
}
