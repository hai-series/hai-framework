/**
 * @h-ai/api-contract — 包入口
 *
 * 推荐入口为 `apiContract` 扁平命名空间。Schema 与类型仍以命名方式导出，
 * 应用 procedure 在 `.input/.output(...)` 中需要直接引用具体 schema。
 *
 * 不再导出 `createApiContract` / `iamContract` 等顶层函数与领域 contract 常量——
 * 全部统一在 `apiContract.create` / `apiContract.iam` 等下访问。
 */

// 领域 contract 类型（用于推导客户端类型签名）。
export type { AiContract, AiExtensionContract } from './ai/ai-contract.js'
// Schemas（含运行时 schema 常量 + 推导类型）。
export * from './ai/audio/ai-audio-ws-schemas.js'
export * from './ai/chats/ai-chat-schemas.js'
export * from './ai/memories/ai-memory-schemas.js'
export * from './ai/sessions/ai-session-schemas.js'
// 扁平命名空间——所有 functionality 通过 `apiContract.*` 调用。
export { apiContract } from './api-contract-main.js'
export type { AuditContract } from './audit/audit-contract.js'
export * from './audit/audit-schemas.js'
export { PaginationQuerySchema } from './common/pagination-schemas.js'
export * from './common/response-schemas.js'
// result-schema：仅保留 HaiErrorSchema；工厂与 void 常量走 `apiContract.haiResultSchema` / `apiContract.voidResultSchema`。
export { HaiErrorSchema } from './common/result-schemas.js'
// 组合 contract 输入/输出类型。
export type { CreateApiContractOptions, CreatedApiContract } from './composition/create-api-contract.js'
export * from './feedback/index.js'

export type { IamContract } from './iam/iam-contract.js'

export {
  IamApiKeySchema,
  IamCreateApiKeyInputSchema,
  IamListApiKeysInputSchema,
  IamReplaceRolePermissionsInputSchema,
} from './iam/iam-extension-contract.js'
export type { IamExtensionContract } from './iam/iam-extension-contract.js'
export * from './iam/iam-schemas.js'
export type { PaymentContract } from './payment/payment-contract.js'
export type { PaymentExtensionContract } from './payment/payment-extension-contract.js'
export * from './payment/payment-schemas.js'
export type { StorageContract } from './storage/storage-contract.js'

export { STORAGE_PROXY_MAX_FILE_BYTES, StorageUploadFileInputSchema } from './storage/storage-extension-contract.js'
export type { StorageExtensionContract } from './storage/storage-extension-contract.js'
export * from './storage/storage-schemas.js'

// 保留推导 contract 声明所需的上游公共类型，避免应用引用依赖内部路径。
export type { ContractProcedureBuilderWithInputOutput, ContractProcedureBuilderWithOutput, Schema } from '@orpc/contract'
