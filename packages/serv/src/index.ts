/**
 * @h-ai/serv — 包入口
 *
 * 根入口聚合 `serv` 扁平命名空间、预置 procedure 工厂及公开类型。
 * feature 子路径转发同一对象，调用方通常只需一次根入口导入。
 * @module index
 */

export type { AiObjectAuthorizationRequest, AiProcedureDeps } from './features/serv-feature-ai.js'
export type { FeedbackProcedureDeps } from './features/serv-feature-feedback.js'
export type { IamProcedureDeps } from './features/serv-feature-iam.js'
export type { StorageAccessRequest, StorageProcedureDeps } from './features/serv-feature-storage.js'
export * from './serv-main.js'
export * from './serv-types.js'
