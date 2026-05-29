/**
 * @h-ai/iam — 协议展示构建
 *
 * 登录页与注册页共用的用户协议/隐私协议展示信息构建逻辑。
 * @module iam-agreement
 */

import type { AgreementConfig } from './iam-config.js'
import type { AgreementDisplay } from './user/iam-user-types.js'

/**
 * 根据展示开关构建协议展示信息；未启用或未配置任何协议链接时返回 undefined。
 *
 * @param config - 协议配置
 * @param enabled - 当前场景（登录/注册）是否展示协议
 */
export function buildAgreementDisplay(
  config: AgreementConfig,
  enabled: boolean,
): AgreementDisplay | undefined {
  if (!enabled)
    return undefined
  if (!config.userAgreementUrl && !config.privacyPolicyUrl)
    return undefined
  return {
    userAgreementUrl: config.userAgreementUrl,
    privacyPolicyUrl: config.privacyPolicyUrl,
    showOnRegister: config.showOnRegister,
    showOnLogin: config.showOnLogin,
  }
}
