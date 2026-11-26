/**
 * @h-ai/serv — 包入口
 *
 * 根入口聚合 `serv` 扁平命名空间、预置 procedure 工厂及公开类型。
 * @module index
 */

export type { AiAuthorizedMediaRequest, AiMediaOperationRequest, AiMediaProcedureDeps } from './features/serv-feature-ai-media.js'
export type { AiMemoryWriteAuthorizationRequest, AiMemoryWriteProcedureDeps } from './features/serv-feature-ai-memory-write.js'
export type { AiStreamingProcedureDeps } from './features/serv-feature-ai-streaming.js'
export type { AiObjectAuthorizationRequest, AiProcedureDeps } from './features/serv-feature-ai.js'
export type { AuditProcedureDeps, AuditReadScope } from './features/serv-feature-audit.js'
export type { FeedbackProcedureDeps } from './features/serv-feature-feedback.js'
export type { IamManagementAccessRequest, IamManagementProcedureDeps } from './features/serv-feature-iam-management.js'
export type { IamProcedureDeps } from './features/serv-feature-iam.js'
export type { PaymentCloseOrderProcedureDeps } from './features/serv-feature-payment-close-order.js'
export type { StorageTransferAccessRequest, StorageTransferProcedureDeps } from './features/serv-feature-storage-transfer.js'
export type { StorageAccessRequest, StorageProcedureDeps } from './features/serv-feature-storage.js'
export * from './serv-main.js'
export * from './serv-types.js'
