/** 敏感操作的短期单次再鉴别凭据；不属于匿名端点。 */
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.auth.createApi(iam).reauthenticate
