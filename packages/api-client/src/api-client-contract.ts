/**
 * @h-ai/api-client — 契约调用
 *
 * 基于 EndpointDef 发起类型安全的 API 请求。
 * @module api-client-contract
 */

import type { HaiResult } from '@h-ai/core'
import type { FetchClient } from './api-client-fetch.js'
import type { EndpointDef } from './api-client-types.js'
import { err, ok } from '@h-ai/core'
import { apiClientM } from './api-client-i18n.js'
import { HaiApiClientError } from './api-client-types.js'

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
  ): Promise<HaiResult<TOutput>> {
    // 客户端入参校验（避免无效请求发送到服务端）
    const parsed = endpoint.input.safeParse(input)
    if (!parsed.success) {
      return err(
        HaiApiClientError.VALIDATION_FAILED,
        apiClientM('apiClient_validationFailed'),
        parsed.error.issues,
      )
    }

    const validInput = parsed.data

    let result: HaiResult<unknown>

    switch (endpoint.method) {
      case 'GET':
        result = await fetchClient.get(endpoint.path, validInput as Record<string, unknown>)
        break

      case 'POST':
        result = await fetchClient.post(endpoint.path, validInput)
        break

      case 'PUT':
        result = await fetchClient.put(endpoint.path, validInput)
        break

      case 'PATCH':
        result = await fetchClient.patch(endpoint.path, validInput)
        break

      case 'DELETE':
        result = await fetchClient.delete(endpoint.path, validInput as Record<string, unknown>)
        break

      default:
        return err(
          HaiApiClientError.UNKNOWN,
          apiClientM('apiClient_unknown'),
        )
    }

    if (!result.success) {
      return result
    }

    // 响应数据校验（确保服务端返回的数据符合契约）
    const outputParsed = endpoint.output.safeParse(result.data)
    if (!outputParsed.success) {
      return err(
        HaiApiClientError.VALIDATION_FAILED,
        apiClientM('apiClient_responseValidationFailed'),
        outputParsed.error.issues,
      )
    }

    return ok(outputParsed.data)
  }

  return call
}
