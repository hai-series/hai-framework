/**
 * @h-ai/api-contract — 默认 API Service contract 预设
 *
 * 组合了 iam/storage/ai 三个领域的标准 contract，供 `apps/api-service` 直接使用。
 * 需要更多领域（如 payment）时，在组合根 `createApiContract` 中追加即可。
 * @module api-service-contract
 */

import { aiContract } from '../ai/ai-contract.js'
import { createApiContract } from '../composition/create-api-contract.js'
import { iamContract } from '../iam/iam-contract.js'
import { storageContract } from '../storage/storage-contract.js'

/**
 * hai-framework 默认 API Service contract。
 *
 * 默认包含 iam/storage/ai，应用可在组合根继续合并自定义领域。
 */
export const apiServiceContract = createApiContract({
  iam: iamContract,
  storage: storageContract,
  ai: aiContract,
})

export type ApiServiceContract = typeof apiServiceContract
