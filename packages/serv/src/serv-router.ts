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
} from '@orpc/server'
import type { ServGuardRequirements } from './pipelines/serv-pipeline-guard.js'
import type { ServContext } from './serv-context.js'
import { implement as orpcImplement } from '@orpc/server'
import { applyServGuards } from './pipelines/serv-pipeline-guard.js'
import { mapHaiError } from './pipelines/serv-pipeline-helper.js'

type EmptyContext = Record<never, never>
type StringKey<T> = Extract<keyof T, string>
type ServContract = ContractRouter<Meta>

/** contract 中所有 procedure 的点分路径。 */
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

type ContractAtPath<TContract, TPath extends string>
  = TPath extends `${infer THead}.${infer TTail}`
    ? THead extends keyof TContract
      ? ContractAtPath<TContract[THead], TTail>
      : never
    : TPath extends keyof TContract
      ? TContract[TPath]
      : never

type RouteContract<
  TContract extends ServContract,
  TPath extends ServRoutePath<TContract>,
> = ContractAtPath<TContract, TPath>

/** `.auth()`、`.permission()`、`.role()` 后的非空会话上下文。 */
export type AuthenticatedServContext<TContext extends ServContext = ServContext>
  = TContext & {
    readonly session: NonNullable<TContext['session']>
  }

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

/** 从 contract procedure 精确推导当前 route 的 HaiResult handler。 */
export type ServRouteHandler<
  TContract extends ServContract,
  TPath extends ServRoutePath<TContract>,
  TContext extends Context,
> = RouteHandler<RouteContract<TContract, TPath>, TContext>

type ServGuardedRouteHandler<
  TContract extends ServContract,
  TPath extends ServRoutePath<TContract>,
  TContext extends ServContext,
> = RouteHandler<RouteContract<TContract, TPath>, AuthenticatedServContext<TContext>>

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

/** 尚未声明 guard 的单 route 注册器。 */
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

/** 已声明认证或授权 guard 的单 route 注册器。 */
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

type ServRouterBuilderBuild<
  TContract extends ServContract,
  TInitialContext extends Context,
  TRemaining,
> = [TRemaining] extends [never]
  ? {
      /** 所有 contract procedures 均实现后才可调用。 */
      readonly build: () => Router<TContract, TInitialContext>
    }
  : {
      /** 仅供 TypeScript/IDE 展示尚未实现的 route；运行时不存在。 */
      readonly missingRoutes: TRemaining
    }

/**
 * 链式 router builder。
 *
 * `TRemaining` 会随着 `.route()` 注册逐步收窄；未实现完整 contract 时没有 `.build()`。
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

/** hai-framework 链式 contract 实现器。 */
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
 * serv
 *   .implement(contract)
 *   .context<ServContext>()
 *   .route('info', infoHandler)
 *   .route('echo')
 *   .auth()
 *   .handle(echoHandler)
 *   .build()
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

type RuntimeProcedureHandler = ProcedureHandler<
  ServContext,
  unknown,
  HaiResult<unknown>,
  ErrorMap,
  Meta
>
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
