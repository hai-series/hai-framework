import { apiClient } from '@h-ai/api-client'
import { mobileApiClient } from '../api.js'

export const authActions = apiClient.createAuthActions(mobileApiClient)
