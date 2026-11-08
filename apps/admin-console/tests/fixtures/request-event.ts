/** 直调路由的宿主夹具：提供真实请求、URL、Cookie 和会话；不模拟 IAM/数据库业务。 */
import type { Cookies, RequestEvent } from '@sveltejs/kit'
import { randomUUID } from 'node:crypto'

type Session = NonNullable<App.Locals['session']>
type FixtureLocals = Omit<Partial<App.Locals>, 'session'> & {
  session?: (Omit<Session, 'username'> & { username?: string }) | null
}

/** 输入只覆盖本用例关心的宿主字段，其余使用可预测的隔离默认值。 */
interface RequestFixtureOptions {
  request?: Request
  url?: URL
  params?: RequestEvent['params']
  locals?: FixtureLocals
  cookies?: Partial<Cookies>
  getClientAddress?: () => string
}

/** 构造 handler 实际消费的事件；未覆盖的 SvelteKit tracing 等生命周期由真实 E2E 验证。 */
export function createRequestEvent(options: RequestFixtureOptions = {}): RequestEvent {
  const request = options.request ?? new Request(options.url ?? 'https://app.test/api/fixture')
  const session = options.locals?.session
  const values = new Map<string, string>()
  const cookies: Cookies = {
    get: name => values.get(name),
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    set: (name, value) => { values.set(name, value) },
    delete: (name) => { values.delete(name) },
    serialize: () => { throw new Error('Cookie serialization is not configured in this fixture') },
    parse: () => { throw new Error('Cookie parsing is not configured in this fixture') },
    ...options.cookies,
  }
  const fixture: Pick<RequestEvent, 'request' | 'url' | 'params' | 'locals' | 'cookies' | 'getClientAddress' | 'fetch' | 'setHeaders' | 'isDataRequest' | 'isSubRequest' | 'isRemoteRequest' | 'platform' | 'route'> = {
    request,
    url: options.url ?? new URL(request.url),
    params: options.params ?? {},
    locals: {
      ...options.locals,
      requestId: options.locals?.requestId ?? `fixture-${randomUUID()}`,
      session: session
        ? { ...session, username: session.username ?? session.userId }
        : undefined,
    },
    cookies,
    getClientAddress: options.getClientAddress ?? (() => '127.0.0.1'),
    fetch: async () => { throw new Error('Unexpected event.fetch in this route fixture') },
    setHeaders: () => {},
    isDataRequest: false,
    isSubRequest: false,
    isRemoteRequest: false,
    platform: undefined,
    route: { id: null },
  }
  // tracing 是 SvelteKit 的宿主对象，直调路由不访问；此处是有界宿主断言，不伪造 Span。
  return fixture as RequestEvent
}
