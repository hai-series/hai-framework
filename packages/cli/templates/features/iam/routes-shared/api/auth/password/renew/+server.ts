/** 首次或过期密码更新；服务端验证账号和原密码后要求重新登录。 */
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.auth.createApi(iam).renewPassword
