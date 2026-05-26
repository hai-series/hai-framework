/**
 * api-service 应用级 contract。
 *
 * 合并 @h-ai/api-contract 提供的领域 contract（iam/storage/ai）以及 api-service 自有的 `app` contract。
 * `api-service` 服务端与 `desktop-app` 客户端都从本包导入，避免应用之间跨源码目录依赖。
 */

import { apiContract } from '@h-ai/api-contract'
import { appContract } from './app-contract.js'

/** api-service 完整应用级 contract。 */
export const apiServiceContract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  app: appContract,
})

export type ApiServiceContract = typeof apiServiceContract
