/**
 * =============================================================================
 * @hai/iam - 浏览器入口
 * =============================================================================
 * 浏览器环境的轻量入口，仅提供前端客户端能力。
 *
 * 注意：浏览器环境不支持 iam.init / iam.auth / iam.user / iam.authz / iam.session。
 * 如需服务端能力，请在 Node.js 环境使用 @hai/iam。
 *
 * @example
 * ```ts
 * import { createIamClient } from '@hai/iam'
 *
 * const client = createIamClient({ baseUrl: '/api/iam' })
 *
 * // 登录
 * const result = await client.login({
 *   identifier: 'admin',
 *   password: 'Password123',
 * })
 *
 * // 获取当前用户
 * const user = await client.getCurrentUser()
 * ```
 * =============================================================================
 */

// 前端客户端
export * from './client/iam-client.js'
