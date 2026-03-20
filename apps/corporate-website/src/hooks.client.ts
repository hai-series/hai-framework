import { corporateAuthTokenStore } from '$lib/utils/auth.js'
import { kit } from '@h-ai/kit'

export const handleFetch = kit.auth.createHandleFetch(corporateAuthTokenStore)
