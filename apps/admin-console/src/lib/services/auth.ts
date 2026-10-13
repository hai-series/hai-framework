/** 认证页面共用标准动作，沿用应用的 CSRF 和加密传输配置。 */
import { apiFetch } from '$lib/utils/api'
import { kit } from '@h-ai/kit'

export const authActions = kit.client.createAuthActions({ apiFetch })
