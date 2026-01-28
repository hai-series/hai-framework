/**
 * =============================================================================
 * @hai/kit - SvelteKit Handle Hook
 * =============================================================================
 * 提供 SvelteKit handle hook 的创建和组合功能
 * =============================================================================
 */

import type { Handle, RequestEvent } from '@sveltejs/kit'
import { createLogger, generateId } from '@hai/core'
import type { HookConfig, Middleware, MiddlewareContext, SessionData, GuardConfig, GuardResult } from '../types.js'

const logger = createLogger({ name: 'kit-handle' })

/**
 * 创建 hai handle hook
 * 
 * @param config - hook 配置
 */
export function createHandle(config: HookConfig = {}): Handle {
  const {
    sessionCookieName = 'hai_session',
    validateSession,
    middleware = [],
    guards = [],
    onError,
    logging = true,
  } = config
  
  return async ({ event, resolve }) => {
    const startTime = Date.now()
    const requestId = generateId('req')
    
    // 添加请求 ID 到 event.locals
    ;(event.locals as any).requestId = requestId
    
    if (logging) {
      logger.info(
        {
          requestId,
          method: event.request.method,
          path: event.url.pathname,
        },
        'Request started',
      )
    }
    
    try {
      // 解析会话
      let session: SessionData | undefined
      
      if (validateSession) {
        const sessionToken = event.cookies.get(sessionCookieName)
        
        if (sessionToken) {
          session = await validateSession(sessionToken) ?? undefined
          ;(event.locals as any).session = session
        }
      }
      
      // 执行守卫
      for (const guardConfig of guards) {
        const guardResult = await executeGuard(guardConfig, event, session)
        
        if (!guardResult.allowed) {
          if (guardResult.redirect) {
            return new Response(null, {
              status: 302,
              headers: { Location: guardResult.redirect },
            })
          }
          
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: guardResult.message ?? 'Access denied',
              },
              requestId,
            }),
            {
              status: guardResult.status ?? 403,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      }
      
      // 构建中间件上下文
      const context: MiddlewareContext = {
        event,
        session,
        requestId,
      }
      
      // 执行中间件链
      const response = await executeMiddlewareChain(
        middleware,
        context,
        () => resolve(event),
      )
      
      // 添加请求 ID 到响应头
      response.headers.set('X-Request-Id', requestId)
      
      if (logging) {
        const duration = Date.now() - startTime
        logger.info(
          {
            requestId,
            status: response.status,
            duration,
          },
          'Request completed',
        )
      }
      
      return response
    }
    catch (error) {
      logger.error({ requestId, error }, 'Request failed')
      
      if (onError) {
        return onError(error, event)
      }
      
      // 默认错误响应
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
          requestId,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  }
}

/**
 * 执行守卫
 */
async function executeGuard(
  config: GuardConfig,
  event: RequestEvent,
  session?: SessionData,
): Promise<GuardResult> {
  const { guard, paths, exclude } = config
  const pathname = event.url.pathname
  
  // 检查是否排除
  if (exclude?.some(pattern => matchPath(pathname, pattern))) {
    return { allowed: true }
  }
  
  // 检查是否匹配路径
  if (paths && !paths.some(pattern => matchPath(pathname, pattern))) {
    return { allowed: true }
  }
  
  return guard(event, session)
}

/**
 * 执行中间件链
 */
async function executeMiddlewareChain(
  middleware: Middleware[],
  context: MiddlewareContext,
  final: () => Promise<Response>,
): Promise<Response> {
  if (middleware.length === 0) {
    return final()
  }
  
  const [current, ...rest] = middleware
  
  return current(context, () => executeMiddlewareChain(rest, context, final))
}

/**
 * 简单路径匹配
 */
function matchPath(pathname: string, pattern: string): boolean {
  // 支持简单的通配符
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return pathname.startsWith(prefix)
  }
  
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return pathname.startsWith(prefix)
  }
  
  return pathname === pattern
}

/**
 * 组合多个 handle
 */
export function sequence(...handles: Handle[]): Handle {
  return async ({ event, resolve }) => {
    let currentResolve = resolve
    
    for (let i = handles.length - 1; i >= 0; i--) {
      const handle = handles[i]
      const nextResolve = currentResolve
      
      currentResolve = (event) => handle({ event, resolve: nextResolve })
    }
    
    return currentResolve(event)
  }
}
