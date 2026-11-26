import type { HttpSession, Logger, RequestAccessCheck } from '@h-ai/core'

/**
 * 宿主已鉴别的契约请求上下文。会话、范围和可信地址须来自宿主运行时。
 * @example
 * ```ts
 * import type { HttpContractContext } from '@h-ai/api-contract'
 *
 * const context: HttpContractContext = { requestId: 'orders-1', locale: 'zh-CN' }
 * ```
 */
export interface HttpContractContext {
  readonly requestId: string
  readonly locale?: string
  readonly ip?: string
  readonly userAgent?: string
  readonly terminalType?: 'web' | 'app' | 'desktop' | 'api'
  readonly accessToken?: string
  readonly session?: HttpSession
  readonly scopeId?: string
  readonly request?: Request
  readonly logger?: Logger
}

/**
 * 宿主在处理契约传输端点时选择的加密策略。
 * @example
 * ```ts
 * import type { HttpContractTransport } from '@h-ai/api-contract'
 *
 * const transport: HttpContractTransport = { enabled: false }
 * ```
 */
export interface HttpContractTransport {
  readonly enabled: boolean
  readonly encryption?: RequestAccessCheck['encryption']
}

/**
 * Serv 与 Kit 共用的 Fetch 契约分发器。未命中时返回 undefined 交给宿主后续路由。
 * @example
 * ```ts
 * import type { HttpContractHandler } from '@h-ai/api-contract'
 *
 * async function dispatch(handler: HttpContractHandler, request: Request) {
 *   const transport = { enabled: false }
 *   return handler.preflight(request, transport)
 *     ?? await handler.fetch(request, () => ({ requestId: 'orders-1' }), transport)
 * }
 * ```
 */
export interface HttpContractHandler {
  /** 已含宿主挂载目录的 API 路由前缀。 */
  readonly apiPrefix: `/${string}`
  /** 在宿主解密前拒绝不允许的文件和事件流请求。 */
  readonly preflight: (request: Request, transport: HttpContractTransport) => Response | undefined
  /** 在宿主完成访问策略与会话检查之后分发。 */
  readonly fetch: (
    request: Request,
    createContext: () => HttpContractContext | Promise<HttpContractContext>,
    transport: HttpContractTransport,
  ) => Promise<Response | undefined>
}
