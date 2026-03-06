/**
 * @h-ai/api-client — 契约调用
 *
 * 基于 EndpointDef 发起类型安全的 API 请求。
 * @module api-client-contract
 */

import type { Result } from '@h-ai/core'
import type { ApiClientError } from './api-client-config.js'
import type { FetchClient } from './api-client-fetch.js'
import type { EndpointDef } from './api-client-types.js'
import { err } from '@h-ai/core'
import { ApiClientErrorCode } from './api-client-config.js'
import { apiClientM } from './api-client-i18n.js'

/**
 * 创建契约调用函数
 *
 * @param fetchClient - Fetch Client 实例
 * @returns call 函数
 */
export function createContractCaller(fetchClient: FetchClient) {
  /**
   * 基于端点契约发起请求
   *
   * 路径、方法、入参、出参类型全由契约保证。
   *
   * @typeParam TInput - 入参类型
   * @typeParam TOutput - 出参类型
   * @param endpoint - 端点契约定义
   * @param input - 入参数据
   * @returns 出参 Result
   *
   * @example
   * ```ts
   * const result = await api.call(iamEndpoints.login, { identifier: 'alice', password: 'xxx' })
   * ```
   */
  async function call<TInput, TOutput>(
    endpoint: EndpointDef<TInput, TOutput>,
    input: TInput,
  ): Promise<Result<TOutput, ApiClientError>> {
    // 客户端输入校验（可选，避免无效请求发送到服务端）
    const parsed = endpoint.input.safeParse(input)
    if (!parsed.success) {
      return err({
        code: ApiClientErrorCode.VALIDATION_FAILED,
        message: apiClientM('apiClient_validationFailed'),
        details: parsed.error.issues,
      })
    }

    const validInput = parsed.data

    switch (endpoint.method) {
      case 'GET':
        return fetchClient.get<TOutput>(endpoint.path, validInput as Record<string, unknown>)

      case 'POST':
        return fetchClient.post<TOutput>(endpoint.path, validInput)

      case 'PUT':
        return fetchClient.put<TOutput>(endpoint.path, validInput)

      case 'PATCH':
        return fetchClient.patch<TOutput>(endpoint.path, validInput)

      case 'DELETE':
        return fetchClient.delete<TOutput>(endpoint.path, validInput as Record<string, unknown>)

      default:
        return err({
          code: ApiClientErrorCode.UNKNOWN,
          message: apiClientM('apiClient_unknown'),
        })
    }
  }

  return call
}
