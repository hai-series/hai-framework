import type { Router } from '@orpc/server'
import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { core, err, ok } from '@h-ai/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { serv } from '../src/serv-main.js'

const logger = core.logger.child({ module: 'serv-router-test' })
const testContract = {
  publicInfo: apiContract
    .route({ method: 'POST', path: '/router/public-info' })
    .output(apiContract.haiResultSchema(z.object({ name: z.string() }))),
  nested: {
    echo: apiContract
      .route({ method: 'POST', path: '/router/echo' })
      .input(z.object({ message: z.string() }))
      .output(apiContract.haiResultSchema(z.object({
        message: z.string(),
        userId: z.string(),
      }))),
  },
}

const nonHaiResultContract = {
  raw: apiContract
    .route({ method: 'POST', path: '/router/raw' })
    .output(z.object({ value: z.string() })),
}

function createContext(session?: ServContext['session']): ServContext {
  return {
    requestId: 'req-router-test',
    locale: 'zh-CN',
    request: new Request('https://example.test/router'),
    logger,
    session,
  }
}

function handlerOptions<THandler extends (...args: never[]) => unknown>(
  handler: THandler,
  context: ServContext,
  input: unknown,
): Parameters<THandler>[0] {
  return {
    context,
    input,
    path: ['nested', 'echo'],
    procedure: undefined,
    signal: undefined,
    lastEventId: undefined,
    errors: {},
  } as Parameters<THandler>[0]
}

function procedureHandler(
  procedure: Router<typeof testContract, ServContext>['nested']['echo'],
) {
  return procedure['~orpc'].handler
}

describe('serv chain router', () => {
  it('builds an empty contract router', () => {
    const emptyContract = apiContract.create({})
    const procedures = serv
      .implement(emptyContract)
      .context<ServContext>()
      .build()

    expect(procedures).toEqual({})
  })

  it('preserves nested empty routers in the runtime shape', () => {
    const nestedEmptyContract = { empty: {} }
    const procedures = serv
      .implement(nestedEmptyContract)
      .context<ServContext>()
      .build()

    expect(procedures.empty).toEqual({})
  })

  it('derives route input/output and narrows authenticated context', () => {
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .auth()
      .handle(({ input, context }) => {
        expectTypeOf(input.message).toEqualTypeOf<string>()
        expectTypeOf(context.session.userId).toEqualTypeOf<string>()
        return ok({ message: input.message, userId: context.session.userId })
      })
      .build()

    expectTypeOf(procedures).toMatchTypeOf<Router<typeof testContract, ServContext>>()
    expect(procedures.nested.echo).toBeDefined()
  })

  it('does not expose build until every contract procedure is registered', () => {
    const incomplete = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))

    if (false) {
      // @ts-expect-error contract 仍缺少 nested.echo
      incomplete.build()
    }
    expectTypeOf(incomplete.missingRoutes).toEqualTypeOf<'nested.echo'>()
  })

  it('rejects duplicate, unknown, and non-HaiResult routes at compile time', () => {
    const incomplete = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))

    if (false) {
      // @ts-expect-error publicInfo 已实现，不能重复注册
      incomplete.route('publicInfo', () => ok({ name: 'again' }))
      // @ts-expect-error missing 不属于 contract
      incomplete.route('missing', () => ok({ name: 'missing' }))
      // @ts-expect-error 单参数 route 必须先声明 guard，公开 route 使用双参数形式
      incomplete.route('nested.echo').handle(({ input }) => ok({
        message: input.message,
        userId: 'unguarded',
      }))
      serv
        .implement(nonHaiResultContract)
        .context<ServContext>()
        // @ts-expect-error serv procedure contract 的 output 必须是 HaiResult
        .route('raw', () => ({ value: 'raw' }))
    }

    expectTypeOf(incomplete.missingRoutes).toEqualTypeOf<'nested.echo'>()
  })

  it('rejects missing procedures at runtime when static types are bypassed', () => {
    const incomplete = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
    const build = Reflect.get(incomplete, 'build')

    expect(typeof build).toBe('function')
    expect(() => Reflect.apply(build, incomplete, []))
      .toThrow('Cannot build router. Missing procedures: nested.echo')
  })

  it('maps exceptions from public handlers to HaiResult', async () => {
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => {
        throw new Error('boom')
      })
      .route('nested.echo', ({ input }) => ok({
        message: input.message,
        userId: 'public',
      }))
      .build()

    const handler = procedures.publicInfo['~orpc'].handler
    const result = await handler(handlerOptions(handler, createContext(), undefined))

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.httpStatus).toBe(500)
  })

  it('returns unauthorized before invoking an auth handler', async () => {
    let invoked = false
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .auth()
      .handle(({ input, context }) => {
        invoked = true
        return ok({ message: input.message, userId: context.session.userId })
      })
      .build()

    const handler = procedureHandler(procedures.nested.echo)
    const result = await handler(handlerOptions(
      handler,
      { ...createContext(), accessToken: 'unverified-token' },
      { message: 'hello' },
    ))

    expect(invoked).toBe(false)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.httpStatus).toBe(401)
      expect(result.error.message).toBe('未登录或登录已失效')
    }
  })

  it('treats null session as unauthenticated when runtime input bypasses types', async () => {
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .auth()
      .handle(({ input, context }) => ok({
        message: input.message,
        userId: context.session.userId,
      }))
      .build()
    const handler = procedureHandler(procedures.nested.echo)
    const context = createContext()
    Reflect.defineProperty(context, 'session', { value: null })

    const result = await handler(handlerOptions(handler, context, { message: 'hello' }))

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.httpStatus).toBe(401)
  })

  it('preserves oRPC handler options after guard checks', async () => {
    let received: Record<string, unknown> | undefined
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .auth()
      .handle((options) => {
        received = options
        return ok({
          message: options.input.message,
          userId: options.context.session.userId,
        })
      })
      .build()
    const handler = procedureHandler(procedures.nested.echo)
    const context = createContext({
      userId: 'u1',
      roles: [],
      permissions: [],
    })
    const options = handlerOptions(handler, context, { message: 'hello' })

    await handler(options)

    expect(received?.path).toBe(options.path)
    expect(received?.procedure).toBe(options.procedure)
    expect(received?.signal).toBe(options.signal)
    expect(received?.lastEventId).toBe(options.lastEventId)
    expect(received?.errors).toBe(options.errors)
    expect(received?.context).toBe(context)
  })

  it('requires every declared permission and supports wildcard permission', async () => {
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .permission('app.echo')
      .permission('app.audit')
      .handle(({ input, context }) => ok({
        message: input.message,
        userId: context.session.userId,
      }))
      .build()
    const handler = procedureHandler(procedures.nested.echo)

    const denied = await handler(handlerOptions(handler, createContext({
      userId: 'u1',
      roles: [],
      permissions: ['app.echo'],
    }), { message: 'hello' }))
    expect(denied.success).toBe(false)
    if (!denied.success) {
      expect(denied.error.httpStatus).toBe(403)
      expect(denied.error.message).toBe('无权执行该操作')
    }

    const allowed = await handler(handlerOptions(handler, createContext({
      userId: 'u1',
      roles: [],
      permissions: [serv.WILDCARD_PERMISSION],
    }), { message: 'hello' }))
    expect(allowed).toEqual(ok({ message: 'hello', userId: 'u1' }))
  })

  it('permission and role guards imply authentication', async () => {
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .permission('app.echo')
      .role('member')
      .handle(({ input, context }) => ok({
        message: input.message,
        userId: context.session.userId,
      }))
      .build()
    const handler = procedureHandler(procedures.nested.echo)

    const result = await handler(handlerOptions(
      handler,
      createContext(),
      { message: 'hello' },
    ))

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.httpStatus).toBe(401)
  })

  it('requires every declared role and supports wildcard role', async () => {
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .role('admin')
      .role('auditor')
      .handle(({ input, context }) => ok({
        message: input.message,
        userId: context.session.userId,
      }))
      .build()
    const handler = procedureHandler(procedures.nested.echo)

    const denied = await handler(handlerOptions(handler, createContext({
      userId: 'u1',
      roles: ['admin'],
      permissions: [],
    }), { message: 'hello' }))
    expect(denied.success).toBe(false)
    if (!denied.success)
      expect(denied.error.httpStatus).toBe(403)

    const allowed = await handler(handlerOptions(handler, createContext({
      userId: 'u1',
      roles: [serv.WILDCARD_ROLE],
      permissions: [],
    }), { message: 'hello' }))
    expect(allowed).toEqual(ok({ message: 'hello', userId: 'u1' }))
  })

  it('preserves handler HaiResult failures', async () => {
    const expected = err(
      { code: 'router:test', httpStatus: 418, system: 'router', module: 'test' },
      'expected',
    )
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .auth()
      .handle(() => expected)
      .build()
    const handler = procedureHandler(procedures.nested.echo)
    const result = await handler(handlerOptions(handler, createContext({
      userId: 'u1',
      roles: [],
      permissions: [],
    }), { message: 'hello' }))

    expect(result).toBe(expected)
  })

  it('maps guarded async exceptions with the request locale', async () => {
    const procedures = serv
      .implement(testContract)
      .context<ServContext>()
      .route('publicInfo', () => ok({ name: 'hai' }))
      .route('nested.echo')
      .auth()
      .handle(async () => {
        await Promise.resolve()
        throw new Error('boom')
      })
      .build()
    const handler = procedureHandler(procedures.nested.echo)
    const context = {
      ...createContext({
        userId: 'u1',
        roles: [],
        permissions: [],
      }),
      locale: 'en-US',
    }

    const result = await handler(handlerOptions(handler, context, { message: 'hello' }))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.httpStatus).toBe(500)
      expect(result.error.message).toBe('Internal server error')
    }
  })

  it('rejects duplicate and unknown paths when types are bypassed', () => {
    const builder = serv.implement(testContract).context<ServContext>()
    const route = Reflect.get(builder, 'route')

    Reflect.apply(route, builder, ['publicInfo', () => ok({ name: 'hai' })])
    expect(() => Reflect.apply(route, builder, [
      'publicInfo',
      () => ok({ name: 'again' }),
    ])).toThrow('Duplicate procedure implementation: publicInfo')
    expect(() => Reflect.apply(route, builder, [
      'missing',
      () => ok({ name: 'missing' }),
    ])).toThrow('Contract path is not implementable: missing')
  })

  it('rejects non-function handlers when types are bypassed', () => {
    const builder = serv.implement(testContract).context<ServContext>()
    const route = Reflect.get(builder, 'route')

    expect(() => Reflect.apply(route, builder, ['publicInfo', null]))
      .toThrow('Procedure handler must be a function: publicInfo')
  })
})
