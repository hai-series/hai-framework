import { kit } from '@h-ai/kit'
/** 认证页面共用标准动作，沿用应用的 CSRF 和加密传输配置。 */
import { apiFetch } from '#lib/utils/api.js'

export const authActions = kit.client.createAuthActions({ apiFetch })
