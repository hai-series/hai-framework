/**
 * =============================================================================
 * hai Admin Console - Paraglide 模块类型声明（兜底）
 * =============================================================================
 */

type ParaglideMessageFn = (params?: Record<string, unknown>) => string

declare module '$lib/paraglide/messages' {
  const messages: Record<string, ParaglideMessageFn>
  export = messages
}

declare module '$lib/paraglide/messages.js' {
  const messages: Record<string, ParaglideMessageFn>
  export = messages
}

declare module '$lib/paraglide/runtime' {
  export function getLocale(): string
  export function setLocale(locale: string): void
  export function deLocalizeUrl(url: URL): URL
}

declare module '$lib/paraglide/runtime.js' {
  export function getLocale(): string
  export function setLocale(locale: string): void
  export function deLocalizeUrl(url: URL): URL
}

declare module '$lib/paraglide/server' {
  export const paraglideMiddleware: (
    request: Request,
    callback: (args: {
      request: Request
      locale: string
    }) => Response | Promise<Response>,
  ) => Response | Promise<Response>
}

declare module '$lib/paraglide/server.js' {
  export const paraglideMiddleware: (
    request: Request,
    callback: (args: {
      request: Request
      locale: string
    }) => Response | Promise<Response>,
  ) => Response | Promise<Response>
}
