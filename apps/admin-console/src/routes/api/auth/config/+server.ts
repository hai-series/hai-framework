import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const GET = kit.auth.createApi(iam).publicConfig
