// 功能子路径复用根入口的服务对象，并提供本功能的输入类型。
export { serv } from '../serv-main.js'

export type { AiAuthorizedMediaRequest, AiExtensionOperationRequest, AiExtensionProcedureDeps, AiMemoryWriteAuthorizationRequest } from './serv-feature-ai-extension.js'
export type { AiObjectAuthorizationRequest, AiProcedureDeps } from './serv-feature-ai.js'
