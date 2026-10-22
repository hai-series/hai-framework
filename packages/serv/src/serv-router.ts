/**
 * @h-ai/serv — contract-first 链式 procedure 实现器
 *
 * 在 oRPC `implement()` 之上提供 route 名只出现一次的链式 DSL。
 * 应用只接触 contract 路径、上下文与 guard，不需要组装 oRPC router 对象。
 *
 * @module serv-router
 */

import type { HaiResult } from '@h-ai/core'
import type {
  Context,
  ContractProcedure,
  ContractRouter,
  ErrorMap,
  Implementer,
  InferSchemaInput,
  InferSchemaOutput,
  Meta,
  ProcedureHandler,
  Router,
  UnlaziedRouter,
} from '@orpc/server'
import type { ServGuardRequirements } from './pipelines/serv-pipeline-guard.js'
import type { ServContext } from './serv-context.js'
import { implement as orpcImplement } from '@orpc/server'
import { applyServGuards } from './pipelines/serv-pipeline-guard.js'
import { mapHaiError } from './pipelines/serv-pipeline-helper.js'

/**
 * 内部初始 context 空约束，用于保持 oRPC 推导而不伪造运行时字段。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { serv } = await import('@h-ai/serv')
 * const context: ServContext & EmptyContext = serv.parseRequestContext({ request: new Request('https://example.com/ping') })
 * const requestId = context.requestId
 * ```
 */
type EmptyContext = Record<never, never>
/**
 * 提取 contract 的字符串键，排除 symbol/数字索引。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const path: StringKey<typeof contract> = 'ping'
 * const procedure = contract[path]
 * ```
 */
type StringKey<T> = Extract<keyof T, string>
/**
 * 内部 contract 泛型边界；真实 procedure 输出须为 HaiResult。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const checked = contract satisfies ServContract
 * const procedures = implement(checked).context<ServContext>().route('ping', () => ok({ ready: true })).build()
 * ```
 */
type ServContract = ContractRouter<Meta>

/**
 * contract 中所有 procedure 的点分路径。
 *
 * @example
 * ```ts
 * import type { ServRoutePath } from '@h-ai/serv'
 * import type { ServContext } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 * import { serv } from '@h-ai/serv'
 * import { z } from 'zod'
 *
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const path: ServRoutePath<typeof contract> = 'ping'
 * const procedures = serv.implement(contract).context<ServContext>().route(path, () => ok({ ready: true })).build()
 * ```
 */
export type ServRoutePath<TContract extends ServContract>
  = TContract extends ContractProcedure<
    infer _TInputSchema,
    infer _TOutputSchema,
    infer _TErrorMap,
    infer _TMeta
  >
    ? never
    : {
        [K in StringKey<TContract>]: TContract[K] extends ContractProcedure<
          infer _TChildInputSchema,
          infer _TChildOutputSchema,
          infer _TChildErrorMap,
          infer _TChildMeta
        >
          ? K
          : TContract[K] extends ServContract
            ? ServRoutePath<TContract[K]> extends infer TChild extends string
              ? `${K}.${TChild}`
              : never
            : never
      }[StringKey<TContract>]

/**
 * 按点分路径查找原始 contract procedure；不存在的路径推导为 never。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const procedure: ContractAtPath<typeof contract, 'ping'> = contract.ping
 * const scoped = implement({ ping: procedure }).context<ServContext>().route('ping', () => ok({ ready: true })).build()
 * ```
 */
type ContractAtPath<TContract, TPath extends string>
  = TPath extends `${infer THead}.${infer TTail}`
    ? THead extends keyof TContract
      ? ContractAtPath<TContract[THead], TTail>
      : never
    : TPath extends keyof TContract
      ? TContract[TPath]
      : never

/**
 * 将合法路由路径映射到对应 contract，供 handler 推导复用。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const procedure: RouteContract<typeof contract, 'ping'> = contract.ping
 * const scoped = implement({ ping: procedure }).context<ServContext>().route('ping', () => ok({ ready: true })).build()
 * ```
 */
type RouteContract<
  TContract extends ServContract,
  TPath extends ServRoutePath<TContract>,
> = ContractAtPath<TContract, TPath>

/**
 * `.auth()`、`.permission()`、`.role()` 后的非空会话上下文。
 *
 * @example
 * ```ts
 * import type { AuthenticatedServContext } from '@h-ai/serv'
 *
 * function owner(context: AuthenticatedServContext): string {
 *   return context.session.userId
 * }
 * // 仅成功 guard 或可信认证结果能建立此上下文，禁止用客户端字段断言。
 * ```
 */
export type AuthenticatedServContext<TContext extends ServContext = ServContext>
  = TContext & {
    readonly session: NonNullable<TContext['session']>
  }

/**
 * 内部从具体 procedure 的输入/输出与 context 推导 HaiResult handler。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const handler: RouteHandler<typeof contract.ping, ServContext> = () => ok({ ready: true })
 * const procedures = implement(contract).context<ServContext>().route('ping', handler).build()
 * ```
 */
type RouteHandler<
  TRouteContract,
  TContext extends Context,
> = TRouteContract extends ContractProcedure<
  infer TInputSchema,
  infer TOutputSchema,
  infer TErrorMap,
  infer TMeta
>
  ? InferSchemaInput<TOutputSchema> extends HaiResult<unknown>
    ? ProcedureHandler<
      TContext,
      InferSchemaOutput<TInputSchema>,
      InferSchemaInput<TOutputSchema>,
      TErrorMap,
      TMeta
    >
    : never
  : never

/**
 * 从 contract procedure 精确推导当前 route 的 HaiResult handler。
 *
 * @example
 * ```ts
 * import type { ServRouteHandler } from '@h-ai/serv'
 * import type { ServContext } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 * import { serv } from '@h-ai/serv'
 * import { z } from 'zod'
 *
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const handler: ServRouteHandler<typeof contract, 'ping', ServContext> = () => ok({ ready: true })
 * const procedures = serv.implement(contract).context<ServContext>().route('ping', handler).build()
 * ```
 */
export type ServRouteHandler<
  TContract extends ServContract,
  TPath extends ServRoutePath<TContract>,
  TContext extends Context,
> = RouteHandler<RouteContract<TContract, TPath>, TContext>

/**
 * 内部认证成功 handler 类型；session 在 guard 之后非空。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const handler: ServGuardedRouteHandler<typeof contract, 'ping', ServContext> = ({ context }) => ok({ ready: context.session.userId.length > 0 })
 * const procedures = implement(contract).context<ServContext>().route('ping').auth().handle(handler).build()
 * ```
 */
type ServGuardedRouteHandler<
  TContract extends ServContract,
  TPath extends ServRoutePath<TContract>,
  TContext extends ServContext,
> = RouteHandler<RouteContract<TContract, TPath>, AuthenticatedServContext<TContext>>

/**
 * 一次注册后移除该路径的 builder；全部路径完成才提供 build。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const next: NextBuilder<typeof contract, ServContext, ServContext, 'ping', 'ping'> = implement(contract).context<ServContext>().route('ping', () => ok({ ready: true }))
 * const procedures = next.build()
 * ```
 */
type NextBuilder<
  TContract extends ServContract,
  TInitialContext extends Context,
  TCurrentContext extends ServContext,
  TRemaining extends ServRoutePath<TContract>,
  TPath extends TRemaining,
> = ServRouterBuilder<
  TContract,
  TInitialContext,
  TCurrentContext,
  Exclude<TRemaining, TPath>
>

/**
 * 尚未声明 guard 的单 route 注册器。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const route: ServRouteRegistration<typeof contract, ServContext, ServContext, 'ping', 'ping'> = implement(contract).context<ServContext>().route('ping')
 * const procedures = route.auth().handle(() => ok({ ready: true })).build()
 * ```
 */
export interface ServRouteRegistration<
  TContract extends ServContract,
  TInitialContext extends Context,
  TCurrentContext extends ServContext,
  TRemaining extends ServRoutePath<TContract>,
  TPath extends TRemaining,
> {
  readonly auth: () => ServGuardedRouteRegistration<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining,
    TPath
  >
  readonly permission: (permission: string) => ServGuardedRouteRegistration<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining,
    TPath
  >
  readonly role: (role: string) => ServGuardedRouteRegistration<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining,
    TPath
  >
}

/**
 * 已声明认证或授权 guard 的单 route 注册器。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const guarded: ServGuardedRouteRegistration<typeof contract, ServContext, ServContext, 'ping', 'ping'> = implement(contract).context<ServContext>().route('ping').permission('reports.read')
 * const procedures = guarded.handle(() => ok({ ready: true })).build()
 * ```
 */
export interface ServGuardedRouteRegistration<
  TContract extends ServContract,
  TInitialContext extends Context,
  TCurrentContext extends ServContext,
  TRemaining extends ServRoutePath<TContract>,
  TPath extends TRemaining,
> {
  readonly auth: () => ServGuardedRouteRegistration<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining,
    TPath
  >
  readonly permission: (permission: string) => ServGuardedRouteRegistration<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining,
    TPath
  >
  readonly role: (role: string) => ServGuardedRouteRegistration<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining,
    TPath
  >
  readonly handle: (
    handler: ServGuardedRouteHandler<TContract, TPath, TCurrentContext>,
  ) => NextBuilder<TContract, TInitialContext, TCurrentContext, TRemaining, TPath>
}

/**
 * 内部 route 重载：直接 handler 或先声明 guard，再收窄剩余路径。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const route: ServRouteMethod<typeof contract, ServContext, ServContext, 'ping'> = implement(contract).context<ServContext>().route
 * const procedures = route('ping', () => ok({ ready: true })).build()
 * ```
 */
interface ServRouteMethod<
  TContract extends ServContract,
  TInitialContext extends Context,
  TCurrentContext extends ServContext,
  TRemaining extends ServRoutePath<TContract>,
> {
  <TPath extends TRemaining>(
    path: TPath,
    handler: ServRouteHandler<TContract, TPath, TCurrentContext>,
  ): NextBuilder<TContract, TInitialContext, TCurrentContext, TRemaining, TPath>
  <TPath extends TRemaining>(
    path: TPath,
  ): ServRouteRegistration<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining,
    TPath
  >
}

/**
 * 剩余路径为 never 时才暴露 build，否则仅提供缺失路径类型提示。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { apiContract } = await import('@h-ai/api-contract')
 * const { z } = await import('zod')
 * const { ok } = await import('@h-ai/core')
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const complete: ServRouterBuilderBuild<typeof contract, ServContext, never> = implement(contract).context<ServContext>().route('ping', () => ok({ ready: true }))
 * const procedures = complete.build()
 * ```
 */
type ServRouterBuilderBuild<
  TContract extends ServContract,
  TInitialContext extends Context,
  TRemaining,
> = [TRemaining] extends [never]
  ? {
      /** 同步返回完整的普通 router，允许按需选用嵌套的默认 procedures。 */
      readonly build: () => UnlaziedRouter<Router<TContract, TInitialContext>>
    }
  : {
      /** 仅供 TypeScript/IDE 展示尚未实现的 route；运行时不存在。 */
      readonly missingRoutes: TRemaining
    }

/**
 * 链式 router builder。
 *
 * `TRemaining` 会随着 `.route()` 注册逐步收窄；未实现完整 contract 时没有 `.build()`。
 *
 * @example
 * ```ts
 * import type { ServRouterBuilder } from '@h-ai/serv'
 * import type { ServContext } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 * import { serv } from '@h-ai/serv'
 * import { z } from 'zod'
 *
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const builder: ServRouterBuilder<typeof contract, ServContext, ServContext> = serv.implement(contract).context<ServContext>()
 * const procedures = builder.route('ping', () => ok({ ready: true })).build()
 * ```
 */
export type ServRouterBuilder<
  TContract extends ServContract,
  TInitialContext extends Context,
  TCurrentContext extends ServContext,
  TRemaining extends ServRoutePath<TContract> = ServRoutePath<TContract>,
> = {
  readonly route: ServRouteMethod<
    TContract,
    TInitialContext,
    TCurrentContext,
    TRemaining
  >
} & ServRouterBuilderBuild<TContract, TInitialContext, TRemaining>

/**
 * hai-framework 链式 contract 实现器。
 *
 * @example
 * ```ts
 * import type { ServImplementer } from '@h-ai/serv'
 * import type { ServContext } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 * import { serv } from '@h-ai/serv'
 * import { z } from 'zod'
 *
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const implementer: ServImplementer<typeof contract> = serv.implement(contract)
 * const procedures = implementer.context<ServContext>().route('ping', () => ok({ ready: true })).build()
 * ```
 */
export interface ServImplementer<TContract extends ServContract> {
  readonly context: <TContext extends ServContext>() => ServRouterBuilder<
    TContract,
    TContext & EmptyContext,
    TContext
  >
}

/**
 * 创建链式 contract 实现器。
 *
 * @example
 * ```ts
 * import type { ServContext } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 * import { serv } from '@h-ai/serv'
 * import { z } from 'zod'
 *
 * const contract = { ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))) }
 * const procedures = serv.implement(contract).context<ServContext>().route('ping', () => ok({ ready: true })).build()
 * ```
 */
export function implement<TContract extends ServContract>(
  contract: TContract,
): ServImplementer<TContract> {
  return {
    context: <TContext extends ServContext>() => {
      const native = orpcImplement(contract).$context<TContext>()
      return createServRouterBuilder(contract, native)
    },
  }
}

function createServRouterBuilder<
  TContract extends ServContract,
  TInitialContext extends Context,
  TCurrentContext extends ServContext,
>(
  contract: TContract,
  implementer: Implementer<TContract, TInitialContext, TCurrentContext>,
): ServRouterBuilder<TContract, TInitialContext, TCurrentContext> {
  const runtime = new ServRouterBuilderRuntime(contract, implementer)

  // oRPC 的 contract 泛型只能在编译期表示；运行时 builder 由同一 contract
  // 创建并逐项校验路径，因此这里将动态实现收敛到唯一的类型边界。
  return runtime as unknown as ServRouterBuilder<
    TContract,
    TInitialContext,
    TCurrentContext
  >
}

/**
 * 内部运行时 handler 边界；最终输入/输出验证仍由对应 contract 决定。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { ok } = await import('@h-ai/core')
 * const handler: RuntimeProcedureHandler = ({ input }) => ok(input)
 * // 动态装配边界仍由相同 contract 校验路径与 options，不提升未知输入类型。
 * ```
 */
type RuntimeProcedureHandler = ProcedureHandler<
  ServContext,
  unknown,
  HaiResult<unknown>,
  ErrorMap,
  Meta
>
/**
 * 内部认证后的运行时 handler，原始 oRPC options 与可信 session 保留。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const { ok } = await import('@h-ai/core')
 * const handler: AuthenticatedRuntimeProcedureHandler = ({ context }) => ok({ userId: context.session.userId })
 * const guarded = applyServGuards({ auth: true }, handler)
 * ```
 */
type AuthenticatedRuntimeProcedureHandler = ProcedureHandler<
  AuthenticatedServContext,
  unknown,
  HaiResult<unknown>,
  ErrorMap,
  Meta
>

class ServRouterBuilderRuntime {
  private readonly expectedPaths: ReadonlySet<string>
  private readonly implementedRoutes: Record<string, unknown>
  private readonly registeredPaths = new Set<string>()

  constructor(
    contract: ServContract,
    private readonly implementer: object,
  ) {
    this.expectedPaths = new Set(collectProcedurePaths(contract))
    this.implementedRoutes = createRouterShape(contract)
  }

  route(path: string, handler?: unknown): unknown {
    if (handler !== undefined)
      return this.register(path, {}, handler)

    return new ServRouteRegistrationRuntime(this, path)
  }

  register(path: string, guards: ServGuardRequirements, handler: unknown): this {
    if (!this.expectedPaths.has(path))
      throw new TypeError(`Contract path is not implementable: ${path}`)
    if (this.registeredPaths.has(path))
      throw new TypeError(`Duplicate procedure implementation: ${path}`)
    if (typeof handler !== 'function')
      throw new TypeError(`Procedure handler must be a function: ${path}`)

    const procedureImplementer = getAtPath(this.implementer, path)
    const implementHandler = getHandlerMethod(procedureImplementer)
    if (!implementHandler)
      throw new TypeError(`Contract path is not implementable: ${path}`)

    // 点路径反射会丢失单条 contract 的泛型；路径已由 expectedPaths 校验，
    // handler 的精确 input/output 则由公开的 ServRouteHandler 在调用侧保证。
    const safeHandler = hasGuards(guards)
      ? applyServGuards(guards, handler as AuthenticatedRuntimeProcedureHandler)
      : mapHaiError(handler as RuntimeProcedureHandler)
    const implemented = Reflect.apply(
      implementHandler,
      procedureImplementer,
      [safeHandler],
    )

    setAtPath(this.implementedRoutes, path, implemented)
    this.registeredPaths.add(path)
    return this
  }

  build(): unknown {
    const missingPaths = [...this.expectedPaths]
      .filter(path => !this.registeredPaths.has(path))
      .sort()
    if (missingPaths.length > 0) {
      throw new TypeError(
        `Cannot build router. Missing procedures: ${missingPaths.join(', ')}`,
      )
    }

    const routerMethod = Reflect.get(this.implementer, 'router')
    if (typeof routerMethod !== 'function')
      throw new TypeError('The oRPC implementer does not expose router()')

    return Reflect.apply(routerMethod, this.implementer, [this.implementedRoutes])
  }
}

class ServRouteRegistrationRuntime {
  private authRequired = false
  private readonly permissions = new Set<string>()
  private readonly roles = new Set<string>()

  constructor(
    private readonly parent: ServRouterBuilderRuntime,
    private readonly path: string,
  ) {}

  auth(): this {
    this.authRequired = true
    return this
  }

  permission(permission: string): this {
    this.authRequired = true
    this.permissions.add(permission)
    return this
  }

  role(role: string): this {
    this.authRequired = true
    this.roles.add(role)
    return this
  }

  handle(handler: unknown): ServRouterBuilderRuntime {
    return this.parent.register(this.path, {
      auth: this.authRequired,
      permissions: [...this.permissions],
      roles: [...this.roles],
    }, handler)
  }
}

function hasGuards(guards: ServGuardRequirements): boolean {
  return guards.auth === true
    || (guards.permissions?.length ?? 0) > 0
    || (guards.roles?.length ?? 0) > 0
}

function collectProcedurePaths(
  contract: ServContract,
  prefix: readonly string[] = [],
): string[] {
  if (isContractProcedure(contract))
    return prefix.length > 0 ? [prefix.join('.')] : []

  return Object.entries(contract).flatMap(([key, child]) =>
    collectProcedurePaths(child, [...prefix, key]))
}

function isContractProcedure(contract: ServContract): boolean {
  return '~orpc' in contract
}

function createRouterShape(contract: ServContract): Record<string, unknown> {
  const shape: Record<string, unknown> = Object.create(null)

  for (const [key, child] of Object.entries(contract)) {
    if (!isContractProcedure(child))
      shape[key] = createRouterShape(child)
  }

  return shape
}

function getAtPath(root: object, path: string): unknown {
  let current: unknown = root

  for (const segment of path.split('.')) {
    if (
      (typeof current !== 'object' && typeof current !== 'function')
      || current === null
      || !(segment in current)
    ) {
      return undefined
    }

    current = Reflect.get(current, segment)
  }

  return current
}

function setAtPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.')
  const leaf = segments.pop()
  if (!leaf)
    throw new TypeError('Procedure path cannot be empty')

  let current = root
  for (const segment of segments) {
    const existing = current[segment]
    if (existing === undefined) {
      const child: Record<string, unknown> = Object.create(null)
      current[segment] = child
      current = child
      continue
    }

    if (!existing || typeof existing !== 'object')
      throw new TypeError(`Procedure path conflicts with an existing route: ${path}`)

    current = existing as Record<string, unknown>
  }

  current[leaf] = value
}

function getHandlerMethod(value: unknown): ((handler: unknown) => unknown) | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return undefined

  const handler = Reflect.get(value, 'handler')
  return typeof handler === 'function'
    ? handler as (handler: unknown) => unknown
    : undefined
}
