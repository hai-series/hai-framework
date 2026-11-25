import { aiExtensionContract } from '../ai/ai-extension-contract.js'
import { auditContract } from '../audit/audit-contract.js'
import { iamExtensionContract } from '../iam/iam-extension-contract.js'
import { paymentExtensionContract } from '../payment/payment-extension-contract.js'
import { storageExtensionContract } from '../storage/storage-extension-contract.js'

/**
 * 由宿主在契约树中选用的领域操作。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.create({ audit: apiContract.extensions.audit })
 * void contract.audit.logs.list
 * ```
 */
export const contractExtensions = {
  ai: aiExtensionContract,
  audit: auditContract,
  iam: iamExtensionContract,
  payment: paymentExtensionContract,
  storage: storageExtensionContract,
}
