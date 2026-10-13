import { apiClient } from '@h-ai/api-client'
import { desktopApiClient } from '../api.js'

export const authActions = apiClient.createAuthActions(desktopApiClient)
