import { aiContract } from './ai/ai-contract.js'
/**
 * @h-ai/api-contract — 统一命名空间入口
 *
 * 将 contract 组合工厂、HaiResult schema 工具与各领域 contract 集中暴露在
 * `apiContract.*` 之下。应用层只需 `import { apiContract } from '@h-ai/api-contract'`
 * 即可完成所有 contract 装配，无需感知子模块路径或 `@orpc/contract` 实现细节。
 *
 * @module api-contract-main
 *
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.create({
 *   iam: apiContract.iam,
 *   storage: apiContract.storage,
 *   ai: apiContract.ai,
 * })
 * ```
 */

import { paginatedSchema } from './common/pagination-schemas.js'
import { haiResultSchema, HaiVoidResultSchema } from './common/result-schemas.js'
import { pathOf, route } from './common/route.js'
import { contractExtensions } from './composition/contract-extensions.js'
import { createApiContract } from './composition/create-api-contract.js'
import { apiContract as feedbackApiContract } from './feedback/index.js'
import { iamContract } from './iam/iam-contract.js'
import { paymentContract } from './payment/payment-contract.js'
import { storageContract } from './storage/storage-contract.js'

/**
 * hai-framework API contract 统一入口（扁平命名空间）。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.create({ iam: apiContract.iam, payment: false })
 * // 通过键访问已组合的 IAM 登录端点。
 * void contract.iam.auth.login
 * ```
 */
export const apiContract = {
  ...feedbackApiContract,
  /** 组合任意领域 contract，过滤掉 `false` / `undefined`，输出可被 serv 挂载的 router。 */
  create: createApiContract,

  /** 把 data schema 包成 `HaiResult<T>` 区分联合，供 procedure `.output(...)` 使用。 */
  haiResultSchema,
  /** `HaiResult<void>` 常量 schema。 */
  voidResultSchema: HaiVoidResultSchema,
  /** 分页响应 schema 工厂。 */
  paginatedSchema,
  /** 创建 oRPC contract 路由节点，供自定义 contract 定义 HTTP 元数据。 */
  route,
  /** 从单个端点定义读取已声明的业务路径模板。 */
  pathOf,

  /** 宿主按需装配的领域操作。 */
  extensions: contractExtensions,

  // 领域 contract（框架内置）
  /** IAM 领域 contract（认证 / 用户 / 角色 / 权限）。 */
  iam: iamContract,
  /** Storage 领域 contract（预签名 URL / 文件管理）。 */
  storage: storageContract,
  /** AI 领域 contract（聊天 / 记忆 / 会话）。 */
  ai: aiContract,
  /** Payment 领域 contract。 */
  payment: paymentContract,
  /** 用户反馈、对话和附件。 */
}
