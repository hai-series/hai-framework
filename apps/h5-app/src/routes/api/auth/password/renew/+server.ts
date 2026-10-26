import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.auth.createApi(iam).renewPassword
