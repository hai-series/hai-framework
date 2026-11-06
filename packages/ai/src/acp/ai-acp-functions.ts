import type {
  ContentBlock,
  McpServer,
  SessionNotification,
} from '@agentclientprotocol/sdk'
import type { HaiResult } from '@h-ai/core'
import type { z } from 'zod'
import type { AIConfig } from '../ai-config.js'
import type { AIRelStore, AIStoreProvider } from '../store/ai-store-types.js'
import type { ACPConnection } from './ai-acp-client.js'
import type { ACPRuntime } from './ai-acp-runtime.js'
import type {
  ACPAgentAdapter,
  ACPClientOptions,
  ACPCreateSessionOptions,
  ACPSessionInfo,
  ACPSessionWorkspace,
  ACPTransport,
} from './ai-acp-types.js'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'
import { ok } from '@h-ai/core'
import { createResourceRegistry } from '../registry/ai-registry-functions.js'
import {
  nativeAdapters,
  resolveAgentModels,
  resolveEnvironment,
} from './ai-acp-adapters.js'
import { connectACP } from './ai-acp-client.js'
import {
  ACPAgentSchema,
  ACPConfigSchema,
  ACPPublishSchema,
  ACPWorkspaceSchema,
  branchNameSchema,
  sessionIdentitySchema,
} from './ai-acp-config.js'
import { acpError, ACPFailure } from './ai-acp-errors.js'
import { createGitOperations } from './ai-acp-git.js'
import { openRuntime, selectEngine } from './ai-acp-runtime.js'

/**
 * 内部工作区记录。
 * @example
 * ```ts
 * // 模块内部上下文。
 * function workspaceId(workspace: Workspace) { return workspace.id }
 * ```
 */
type Workspace = z.infer<typeof ACPWorkspaceSchema>
/**
 * 内部智能体记录。
 * @example
 * ```ts
 * // 模块内部上下文。
 * function agentName(agent: Agent) { return agent.name }
 * ```
 */
type Agent = z.infer<typeof ACPAgentSchema>
/**
 * 只驻留在拥有者进程的执行句柄。
 * @example
 * ```ts
 * // 模块内部上下文。
 * function localSessionId(session: LiveSession) { return session.info.id }
 * ```
 */
interface LiveSession {
  info: ACPSessionInfo
  connection: ACPConnection
  runtime?: ACPRuntime
  release: () => Promise<void>
}

/**
 * ACP 子系统；资源占用通过 CAS 持久化，不以超时推断失联进程已停止。
 * @param provider - 与 AI 模块共享的持久存储；工厂创建表后由调用方统一初始化。
 * @param config - 经 AIConfigSchema 校验的模块配置，包括只读智能体和工作区。
 * @param extensions - 可信原生配置适配器，可覆盖同名内置适配器。
 * @param modelConfig - 获取包含数据库模型的实时配置；默认使用初始化配置。
 * @param mcpLookup - 将合并清单 ID 解析为原生 MCP 定义，启动时解析环境变量。
 * @returns 智能体、工作区、会话管理器和低层连接入口；业务失败返回 HaiResult。
 * @example
 * ```ts
 * // 模块内部上下文；存储在工厂创建所有表后统一初始化。
 * async function assemble(provider: AIStoreProvider, config: AIConfig) { const acp = createACPOperations(provider, config); await provider.initialize(); return acp }
 * ```
 */
export function createACPOperations(
  provider: AIStoreProvider,
  config: AIConfig,
  extensions: Record<string, ACPAgentAdapter> = {},
  modelConfig: () => Promise<AIConfig> = async () => config,
  mcpLookup?: (ids: string[]) => Promise<McpServer[]>,
) {
  const workspaces = provider.createRelStore<Workspace>(
    'hai_ai_acp_workspaces',
  )
  const agents = provider.createRelStore<Agent>('hai_ai_acp_agents')
  const sessions = provider.createRelStore<ACPSessionInfo>(
    'hai_ai_acp_sessions',
  )
  const locks = provider.createRelStore<{ owner: string | null }>(
    'hai_ai_acp_locks',
  )
  const adapters = { ...nativeAdapters, ...extensions }
  const live = new Map<string, LiveSession>()
  const connections = new Set<ACPConnection>()
  const limits = ACPConfigSchema.parse(config.acp ?? {})
  const pending = new Set<Promise<unknown>>()
  const stopping = new Map<string, Promise<void>>()
  let closed = false
  const agentRegistry = createResourceRegistry(
    agents,
    ACPAgentSchema,
    config.acp?.agents ?? [],
    () => !closed,
  )
  const workspaceRegistry = createResourceRegistry(
    workspaces,
    ACPWorkspaceSchema,
    config.acp?.workspaces ?? [],
    () => !closed,
  )
  function ensure() {
    if (closed)
      throw new ACPFailure('closed')
  }
  async function protect<T>(operation: () => Promise<T>) {
    const task = (async () => {
      try {
        ensure()
        return ok(await operation())
      }
      catch (error) {
        return acpError(error)
      }
    })()
    pending.add(task)
    try {
      return await task
    }
    finally {
      pending.delete(task)
    }
  }
  async function modelSignature(agent: Agent) {
    return createHash('sha256')
      .update(
        JSON.stringify(
          resolveAgentModels(agent, await modelConfig()).map(
            ({ id, config: model }) => ({
              id,
              model: model.model,
              protocol: model.protocol,
              baseUrl: model.baseUrl,
              capabilities: model.capabilities,
            }),
          ),
        ),
      )
      .digest('hex')
  }
  async function protectResult<T>(operation: () => Promise<HaiResult<T>>) {
    const result = await protect(operation)
    return result.success ? result.data : result
  }
  async function getAgent(id: string) {
    const entry = await agentRegistry.read(id)
    if (!entry)
      throw new ACPFailure('missing', { id })
    return entry.value
  }
  async function getWorkspace(id: string) {
    const entry = await workspaceRegistry.read(id)
    if (!entry)
      throw new ACPFailure('missing', { id })
    const workspace = await normalizeWorkspace(entry.value)
    await checkWorkspaceOverlap(workspace)
    return workspace
  }
  const workspaceKey = (workspace: Workspace) =>
    workspace.storage.type === 'directory'
      ? `directory:${process.platform === 'win32' ? workspace.storage.path.toLowerCase() : workspace.storage.path}`
      : `volume:${workspace.storage.engine}:${workspace.storage.name}`
  const sessionDirectory = (info: ACPSessionInfo) =>
    info.newWorktree ? `sessions/${info.id}` : 'main'
  function describeWorkspace(workspace: Workspace, runtime: ACPRuntime, info: ACPSessionInfo): ACPSessionWorkspace {
    const directory = sessionDirectory(info)
    const { storage } = workspace
    let location: ACPSessionWorkspace['storage']
    if (storage.type === 'directory') {
      location = { type: 'directory', path: runtime.root }
    }
    else {
      const { engine, name } = storage
      if (engine === 'auto')
        throw new ACPFailure('runtime')
      location = { type: 'volume', engine, name, mountPath: runtime.root }
    }
    return {
      storage: location,
      path: runtime.path(directory),
      repositories: workspace.repositories.map(repo => ({
        id: repo.id,
        path: runtime.path(`${directory}/${repo.id}`),
      })),
    }
  }
  function checkStorage(workspace: Workspace, info: ACPSessionInfo) {
    const pinned = info.workspace?.storage
    if (!pinned)
      return
    const current = workspace.storage
    const matches = pinned.type === 'directory'
      ? current.type === 'directory' && pinned.path === current.path
      : current.type === 'volume' && pinned.name === current.name && pinned.engine === current.engine
    if (!matches)
      throw new ACPFailure('conflict')
  }
  function checkLayout(workspace: Workspace, runtime: ACPRuntime, info: ACPSessionInfo) {
    const current = describeWorkspace(workspace, runtime, info)
    const paths = new Map(current.repositories.map(repo => [repo.id, repo.path]))
    const cwd = info.repositoryId ? paths.get(info.repositoryId) : current.path
    if (info.cwd !== cwd)
      throw new ACPFailure('conflict')
    const pinned = info.workspace
    if (pinned && (pinned.path !== current.path || pinned.repositories.length !== paths.size
      || pinned.repositories.some(repo => paths.get(repo.id) !== repo.path))) {
      throw new ACPFailure('conflict')
    }
  }
  async function normalizeWorkspace(workspace: Workspace) {
    if (workspace.storage.type === 'directory') {
      await mkdir(workspace.storage.path, { recursive: true })
      workspace.storage.path = await realpath(resolve(workspace.storage.path))
    }
    else {
      workspace.storage.engine = await selectEngine(workspace.storage.engine)
    }
    return workspace
  }
  // 对未准备的配置目录仅解析最近已存在父路径，不创建无关目录或探测无关引擎。
  async function canonicalDirectory(path: string): Promise<string> {
    const target = resolve(path)
    try {
      return await realpath(target)
    }
    catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT'
        || dirname(target) === target
      ) {
        throw error
      }
      return resolve(
        await canonicalDirectory(dirname(target)),
        basename(target),
      )
    }
  }
  async function checkWorkspaceOverlap(workspace: Workspace) {
    for (const entry of await workspaceRegistry.values()) {
      if (entry.id === workspace.id)
        continue
      if (
        entry.storage.type === 'directory'
        && workspace.storage.type === 'directory'
      ) {
        const existing = await canonicalDirectory(entry.storage.path)
        const child = relative(existing, workspace.storage.path)
        const parent = relative(workspace.storage.path, existing)
        if (
          (!child.startsWith('..') && !isAbsolute(child))
          || (!parent.startsWith('..') && !isAbsolute(parent))
        ) {
          throw new ACPFailure('conflict')
        }
      }
      else if (
        entry.storage.type === 'volume'
        && workspace.storage.type === 'volume'
        && entry.storage.name === workspace.storage.name
        && (entry.storage.engine === 'auto'
          || entry.storage.engine === workspace.storage.engine)
      ) {
        throw new ACPFailure('conflict')
      }
    }
  }
  async function get<T>(store: AIRelStore<T>, id: string) {
    sessionIdentitySchema.parse(id)
    const data = await store.get(id)
    if (!data)
      throw new ACPFailure('missing', { id })
    return data
  }
  async function acquire(key: string) {
    const previous = await locks.readVersioned(key)
    if (previous?.data.owner)
      throw new ACPFailure('busy')
    const owner = randomUUID()
    const version = await locks.compareAndSwap(key, {
      expectedVersion: previous?.version,
      data: { owner },
    })
    if (!version)
      throw new ACPFailure('busy')
    return async () => {
      if (
        !(await locks.compareAndSwap(key, {
          expectedVersion: version,
          data: { owner: null },
        }))
      ) {
        throw new ACPFailure('cleanup')
      }
    }
  }
  // 定义删改与创建会话绑定共享一把 CAS 锁，避免先检查无引用、随后被会话引用的竞态。
  async function withDefinitions<T>(operation: () => Promise<T>) {
    const release = await acquire('definition-registry')
    try {
      return await operation()
    }
    finally {
      await release()
    }
  }
  async function workspaceOperation<T>(
    workspace: Workspace,
    action: (runtime: ACPRuntime) => Promise<T>,
  ) {
    const release = await acquire(`${workspaceKey(workspace)}:main`)
    let runtime: ACPRuntime | undefined
    try {
      runtime = await openRuntime(workspace)
      return await action(runtime)
    }
    finally {
      await runtime?.close()
      await release()
    }
  }
  async function unique<T>(store: AIRelStore<T>, id: string, data: T) {
    if (!(await store.compareAndSwap(id, { expectedVersion: undefined, data })))
      throw new ACPFailure('conflict', { id })
    return data
  }
  async function validateAgent(agent: Agent) {
    if (agent.mode === 'custom-service')
      return
    if (!adapters[agent.adapter])
      throw new ACPFailure('unsupported', { adapter: agent.adapter })
    resolveAgentModels(agent, await modelConfig())
  }
  async function launchAgent(
    agent: Agent,
    runtime: ACPRuntime | undefined,
    info: ACPSessionInfo,
  ) {
    if (agent.mode === 'custom-service') {
      return {
        type: agent.transport,
        url: agent.url,
        headers: resolveEnvironment(agent.headerEnv),
      } satisfies ACPTransport
    }
    if (!runtime)
      throw new ACPFailure('missing')
    const statePath = await runtime.stateDirectory(info.id)
    const native = await adapters[agent.adapter]!.configure({
      agent,
      models: resolveAgentModels(agent, await modelConfig()),
      modelId: info.modelId,
      statePath,
    })
    for (const [name, content] of Object.entries(native.files ?? {}))
      await runtime.writeState(info.id, name, content)
    return runtime.transport(native.command, native.args, info.cwd, {
      HOME: statePath,
      USERPROFILE: statePath,
      ...resolveEnvironment(agent.environmentRefs),
      ...native.env,
    })
  }
  async function stop(id: string) {
    const existing = stopping.get(id)
    if (existing)
      return existing
    const task = stopOne(id)
    stopping.set(id, task)
    try {
      await task
    }
    finally {
      stopping.delete(id)
    }
  }
  async function stopOne(id: string) {
    const current = live.get(id)
    if (!current)
      return
    await current.connection.cancel()
    // 先请求协议关闭，再关闭进程/容器。任一清理失败都保留锁和恢复记录。
    try {
      await current.connection.closeSession()
    }
    catch {
      /* 协议关闭失败仍以拥有的进程/容器停止结果为准。 */
    }
    finally {
      await current.connection.close()
      await current.runtime?.close()
    }
    current.info.status = 'closed'
    current.info.resource = undefined
    await sessions.save(id, current.info)
    await current.release()
    live.delete(id)
  }
  async function start(
    info: ACPSessionInfo,
    options: ACPClientOptions,
    resume: boolean,
  ) {
    const releaseSession = await acquire(`session:${info.id}`)
    let releaseDirectory: (() => Promise<void>) | undefined
    let runtime: ACPRuntime | undefined
    let connection: ACPConnection | undefined
    let recordMutable = !resume
    try {
      if (resume) {
        info = await get(sessions, info.id)
        if (info.status === 'opening' || info.status === 'active')
          throw new ACPFailure('busy')
        if (info.worktreeStatus)
          throw new ACPFailure('closed')
        recordMutable = true
      }
      const agent = info.agent
      const workspace = info.workspaceId
        ? await getWorkspace(info.workspaceId)
        : undefined
      if (!agent.enabled)
        throw new ACPFailure('unsupported')
      if (workspace) {
        if (agent.mode === 'custom-service')
          throw new ACPFailure('unsupported')
        if (
          (agent.mode === 'embedded'
            && workspace.storage.type !== 'directory')
          || (agent.mode === 'builtin-service'
            && workspace.storage.type !== 'volume')
        ) {
          throw new ACPFailure('unsupported')
        }
        if (
          agent.mode === 'builtin-service'
          && workspace.storage.type === 'volume'
          && (agent.image !== workspace.storage.image
            || (agent.engine !== 'auto'
              && agent.engine !== workspace.storage.engine))
        ) {
          throw new ACPFailure('conflict')
        }
        if (!info.newWorktree)
          releaseDirectory = await acquire(`${workspaceKey(workspace)}:main`)
        checkStorage(workspace, info)
        const directory = sessionDirectory(info)
        if (!resume) {
          const releasePrepare = info.newWorktree
            ? await acquire(`${workspaceKey(workspace)}:main`)
            : undefined
          try {
            runtime = await openRuntime(workspace)
            info.resource = runtime.resource
            await sessions.save(info.id, info)
            const git = createGitOperations(workspace, runtime)
            await git.prepare()
            const layout = describeWorkspace(workspace, runtime, info)
            if (info.newWorktree) {
              await runtime.file('mkdir', 'sessions')
              // 独占新目录后才保存其归属；已有目录可能来自已经移除记录的历史会话。
              await runtime.file('mkdir-exclusive', directory)
            }
            info.workspace = layout
            info.cwd = layout.repositories.find(repo => repo.id === info.repositoryId)?.path ?? layout.path
            await sessions.save(info.id, info)
            if (info.newWorktree)
              await git.createWorktree(info.id, info.branch!)
          }
          finally {
            await releasePrepare?.()
          }
        }
        else {
          runtime = await openRuntime(workspace)
        }
        checkLayout(workspace, runtime, info)
        await runtime.file('directory', info.cwd)
      }
      else if (
        agent.mode !== 'custom-service'
        || !info.cwd
        || info.newWorktree
      ) {
        throw new ACPFailure('invalid')
      }
      ensure()
      const transport = await launchAgent(agent, runtime, info)
      connection = await connectACP(transport, options, limits)
      if (info.mcpServerIds?.length && !mcpLookup)
        throw new ACPFailure('unsupported')
      const mcpServers = [
        ...info.mcpServers,
        ...(info.mcpServerIds?.length && mcpLookup
          ? await mcpLookup(info.mcpServerIds)
          : []),
      ]
      if (resume) {
        if (!info.nativeId)
          throw new ACPFailure('unsupported')
        await connection.resumeSession(info.nativeId, info.cwd, mcpServers)
      }
      else {
        info.nativeId = (
          await connection.createSession(info.cwd, mcpServers)
        ).sessionId
      }
      ensure()
      info.status = 'active'
      info.resource = runtime?.resource
      await sessions.save(info.id, info)
      const value: LiveSession = {
        info,
        connection,
        runtime,
        release: async () => {
          await releaseDirectory?.()
          await releaseSession()
        },
      }
      live.set(info.id, value)
      return handle(info.id, value)
    }
    catch (error) {
      await connection?.close()
      await runtime?.close()
      info.status = 'failed'
      info.resource = undefined
      if (recordMutable)
        await sessions.save(info.id, info)
      await releaseDirectory?.()
      await releaseSession()
      throw error
    }
  }
  function handle(id: string, expected?: LiveSession) {
    function current() {
      ensure()
      const value = live.get(id)
      if (!value || (expected && value !== expected))
        throw new ACPFailure('closed')
      return value
    }
    async function gitOperation(publish?: z.input<typeof ACPPublishSchema>) {
      const request = publish ? ACPPublishSchema.parse(publish) : undefined
      const info = await get(sessions, id)
      if (!info.workspaceId || (request && !info.newWorktree))
        throw new ACPFailure('unsupported')
      // 关闭执行环境后才发布，防止后台工具仍修改文件；后续使用显式 resume。
      await stop(id)
      const release = await acquire(`session:${id}`)
      try {
        const current = await get(sessions, id)
        if (!current.workspaceId || (request && !current.newWorktree))
          throw new ACPFailure('unsupported')
        if (request && current.worktreeStatus)
          throw new ACPFailure('closed')
        const workspace = await getWorkspace(current.workspaceId)
        checkStorage(workspace, current)
        return await workspaceOperation(workspace, (runtime) => {
          const git = createGitOperations(workspace, runtime)
          if (!request)
            return git.updateMain()
          checkLayout(workspace, runtime, current)
          return git.publish(id, current.branch!, request)
        })
      }
      finally {
        await release()
      }
    }
    return {
      id,
      /**
       * 读取持久会话信息，包括状态、原生 ID 和当前容器。
       * @returns 包含 ACPSessionInfo 的 HaiResult；记录不存在时返回失败。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.info()
       * ```
       */
      info: () => protect(() => get(sessions, id)),
      /**
       * 发送一轮内容，等待最终停止原因、最终消息文本和完整事件；同一会话不允许并发轮次。
       * @param content - 原生 ACP 内容块，不允许同一会话并发执行。
       * @param signal - 本轮取消信号；取消超时会关闭连接。
       * @returns 最终文本、停止原因和事件的 HaiResult。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.prompt([{ type: 'text', text: '检查工程' }])
       * ```
       */
      prompt: (content: ContentBlock[], signal?: AbortSignal) =>
        protect(() => current().connection.prompt(content, signal)),
      /**
       * 仅接受正常结束的一份 JSON（允许完整 JSON 代码围栏），再按 schema 校验；前后夹杂文本视为失败。
       * @param content - 要求返回结构化 JSON 的原生内容块。
       * @param schema - 最终 JSON 的 Zod 校验器。
       * @param signal - 可选的本轮取消信号。
       * @returns 经过 schema 校验的数据；输出不合法时返回 ACP_OUTPUT_INVALID。
       * @example
       * ```ts
       * import { z } from 'zod'
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.promptStructured([{ type: 'text', text: '返回 JSON' }], z.object({ ok: z.boolean() }))
       * ```
       */
      promptStructured: <T>(
        content: ContentBlock[],
        schema: z.ZodType<T>,
        signal?: AbortSignal,
      ) =>
        protect(async () => {
          const response = await current().connection.prompt(content, signal)
          if (response.stopReason !== 'end_turn')
            throw new ACPFailure('output')
          let text = response.text.trim()
          const fenced = /^```(?:json)?[ \t]*\n([\s\S]*?)\n```$/.exec(text)
          if (fenced)
            text = fenced[1]!
          try {
            return schema.parse(JSON.parse(text))
          }
          catch {
            throw new ACPFailure('output')
          }
        }),
      /**
       * 迭代本轮 ACP 事件；中途退出迭代会取消本轮，失败会抛错，调用方需 try/finally 清理。
       * @param content - 本轮原生内容块。
       * @param signal - 可选取消信号；结束迭代同样会取消本轮。
       * @returns 异步事件迭代器；流式失败抛出异常，需在调用方捕获。
       * @throws 连接关闭、取消超时、输出超限或原生请求失败。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * for await (const event of session.stream([{ type: 'text', text: '检查工程' }])) { const update = event.update }
       * ```
       */
      async* stream(
        content: ContentBlock[],
        signal?: AbortSignal,
      ): AsyncGenerator<SessionNotification> {
        const value = current()
        const controller = new AbortController()
        const queue: SessionNotification[] = []
        let wake: (() => void) | undefined
        const completion = { done: false }
        let error: unknown
        const unsubscribe = value.connection.subscribe((event) => {
          if (queue.length >= limits.maxPendingEvents)
            throw new ACPFailure('output')
          queue.push(event)
          wake?.()
        })
        const task = value.connection
          .prompt(
            content,
            signal
              ? AbortSignal.any([signal, controller.signal])
              : controller.signal,
          )
          .catch((reason) => {
            error = reason
          })
          .finally(() => {
            completion.done = true
            wake?.()
          })
        try {
          while (!completion.done || queue.length) {
            if (queue.length) {
              yield queue.shift()!
            }
            else {
              await new Promise<void>((resolve) => {
                wake = resolve
              })
            }
          }
          if (error)
            throw error
        }
        finally {
          unsubscribe()
          controller.abort()
          await task
        }
      },
      /**
       * 请求取消正在执行的一轮；超时未停止时关闭所拥有的传输。
       * @returns 取消完成的 HaiResult；超时或清理失败返回错误。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.cancel()
       * ```
       */
      cancel: () => protect(() => current().connection.cancel()),
      /**
       * 选择智能体公布的原生模式 ID；不兼容时返回协议失败。
       * @param mode - 握手或事件中公布的原生模式 ID。
       * @returns 原生模式设置结果的 HaiResult。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.setMode('code')
       * ```
       */
      setMode: (mode: string) =>
        protect(() => current().connection.setMode(mode)),
      /**
       * 设置智能体公布的原生配置选项；值必须符合该智能体的选项定义。
       * @param key - 原生配置选项 ID。
       * @param value - 该选项允许的值。
       * @returns 原生配置更新结果的 HaiResult。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.setConfigOption('model', 'coding')
       * ```
       */
      setConfigOption: (key: string, value: string) =>
        protect(() => current().connection.setConfigOption(key, value)),
      /**
       * 先关闭会话执行环境，再 fetch 并仅快进各工程明确配置的主分支；不修改会话分支。
       * @returns 各仓更新报告；部分失败时报告位于 error.cause.reports。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.updateMain()
       * ```
       */
      updateMain: () => protect(() => gitOperation()),
      /**
       * 关闭执行环境后逐仓提交并推送；仅支持受管理的独立会话，部分失败保留各仓报告，禁止强推。
       * @param request - 发布模式、提交说明和作者；仅支持受管理的独立会话。
       * @returns 各仓提交/推送报告；部分失败时报告位于 error.cause.reports。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.publish({ mode: 'merge-main', message: '完成任务', author: { name: 'Developer', email: 'dev@example.com' } })
       * ```
       */
      publish: (request: z.input<typeof ACPPublishSchema>) =>
        protect(() => gitOperation(request)),
      /**
       * 停止拥有的进程或容器，释放占用；保留工作目录和原生状态，供后续显式恢复。
       * @returns 关闭完成的 HaiResult；清理失败时不释放仍在占用的资源。
       * @example
       * ```ts
       * // session 为 sessions.create/get/resume 成功返回的 data。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await session.close()
       * ```
       */
      close: () => protect(() => stop(id)),
    }
  }
  return {
    agents: {
      /**
       * 校验模型与适配器后新增数据库智能体；配置同名条目只读。
       * @param input - 完整智能体定义，必须引用已有 Hai 模型 ID。
       * @returns 带 source/version 的新增条目；配置同 ID 返回只读错误。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.agents.register({ id: 'coder', name: 'Coder', mode: 'embedded', adapter: 'codex', modelIds: ['coding'] })
       * ```
       */
      register: (input: z.input<typeof ACPAgentSchema>) =>
        protectResult(async () => {
          const agent = ACPAgentSchema.parse(input)
          await validateAgent(agent)
          return agentRegistry.operations.register(agent)
        }),
      /**
       * 按 ID 读取合并清单条目；source 区分配置与数据库，数据库 get 返回 version。
       * @param id - 智能体 ID。
       * @returns 合并后的资源条目；未找到时返回资源不存在错误。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.agents.get('coder')
       * ```
       */
      get: agentRegistry.operations.get,
      /**
       * 列出配置与数据库合并后的智能体；同 ID 配置优先。
       * @returns 去重后的智能体条目列表；列表项不带数据库 version。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.agents.list()
       * ```
       */
      list: agentRegistry.operations.list,
      /**
       * 整体替换数据库智能体；可传入 get 返回的版本防止覆盖并发修改，配置条目不可改。
       * @param input - 包含原 ID 的完整替换定义。
       * @param version - get 返回的数据库版本；传入时校验并发修改。
       * @returns 更新后的资源条目；配置只读、版本冲突均返回失败。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // definition 为完整替换定义；entry 为 get 成功返回的条目。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.agents.update(definition, entry.version)
       * ```
       */
      update: (input: z.input<typeof ACPAgentSchema>, version?: string) =>
        protectResult(async () => {
          const agent = ACPAgentSchema.parse(input)
          await validateAgent(agent)
          return agentRegistry.operations.update(agent, version)
        }),
      /**
       * 删除无会话引用的数据库智能体定义；不删除镜像或外部服务。
       * @param id - 数据库智能体 ID。
       * @param version - 可选的期望版本。
       * @returns 删除完成的 HaiResult；存在会话引用时返回 ACP_BUSY。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // entry 为 get 成功返回的数据库条目。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.agents.remove('coder', entry.version)
       * ```
       */
      remove: (id: string, version?: string) =>
        protectResult(async () => {
          return withDefinitions(async () => {
            const existing = await agentRegistry.read(id)
            if (existing?.source === 'config')
              return agentRegistry.operations.remove(id, version)
            if ((await sessions.query({ where: { agentId: id } })).length)
              throw new ACPFailure('busy')
            return agentRegistry.operations.remove(id, version)
          })
        }),
      /**
       * 解析模型和原生配置，验证适配器是否兼容；不持久保存模型凭据。
       * @param id - 已登记智能体 ID。
       * @param modelId - 可选模型 ID，须在智能体 modelIds 中。
       * @returns 智能体模式与绑定模型摘要；不返回凭据或原生配置内容。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.agents.initialize('coder')
       * ```
       */
      initialize: (id: string, modelId?: string) =>
        protect(async () => {
          const agent = await getAgent(id)
          await validateAgent(agent)
          if (agent.mode === 'custom-service')
            return { agentId: id, mode: agent.mode, modelIds: [] }
          await adapters[agent.adapter]!.configure({
            agent,
            models: resolveAgentModels(agent, await modelConfig()),
            modelId: modelId ?? agent.defaultModelId ?? agent.modelIds[0],
            statePath: '/state/validation',
          })
          return { agentId: id, mode: agent.mode, modelIds: agent.modelIds }
        }),
      /**
       * 实际启动并握手后关闭连接，返回智能体能力；托管模式需指定工作区。
       * @param id - 已登记智能体 ID。
       * @param options - 回调、能力及工作区；托管模式必须传 workspaceId。
       * @returns 原生初始化结果（智能体能力、认证方法等）的 HaiResult。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.agents.check('coder', { workspaceId: 'project' })
       * ```
       */
      check: (
        id: string,
        options: ACPClientOptions & { workspaceId?: string } = {},
      ) =>
        protect(async () => {
          const agent = await getAgent(id)
          await validateAgent(agent)
          if (agent.mode !== 'custom-service') {
            if (!options.workspaceId)
              throw new ACPFailure('invalid')
            const workspace = await getWorkspace(options.workspaceId)
            if (
              (agent.mode === 'embedded'
                && workspace.storage.type !== 'directory')
              || (agent.mode === 'builtin-service'
                && (workspace.storage.type !== 'volume'
                  || workspace.storage.image !== agent.image))
            ) {
              throw new ACPFailure('unsupported')
            }
            return workspaceOperation(workspace, async (runtime) => {
              const info: ACPSessionInfo = {
                id: randomUUID(),
                agentId: id,
                cwd: runtime.root,
                newWorktree: false,
                agent,
                status: 'opening',
                mcpServers: [],
                modelId: agent.defaultModelId ?? agent.modelIds[0],
              }
              const connection = await connectACP(
                await launchAgent(agent, runtime, info),
                options,
                limits,
              )
              try {
                return connection.initialized
              }
              finally {
                await connection.close()
              }
            })
          }
          const connection = await connectACP(
            {
              type: agent.transport,
              url: agent.url,
              headers: resolveEnvironment(agent.headerEnv),
            },
            options,
            limits,
          )
          try {
            return connection.initialized
          }
          finally {
            await connection.close()
          }
        }),
    },
    workspaces: {
      /**
       * 新增数据库工作区并归一化存储位置；拒绝目录重叠或同一 volume 重复登记。
       * @param input - 工作区存储位置、显式 Git 主分支和环境变量引用。
       * @returns 带来源和版本的工作区条目；重叠位置返回冲突错误。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.workspaces.register({ id: 'project', storage: { type: 'directory', path: '/srv/project' } })
       * ```
       */
      register: (input: z.input<typeof ACPWorkspaceSchema>) =>
        protectResult(async () => {
          const workspace = ACPWorkspaceSchema.parse(input)
          if ((await workspaceRegistry.read(workspace.id))?.source === 'config')
            return workspaceRegistry.operations.register(workspace)
          await normalizeWorkspace(workspace)
          const release = await acquire('definition-registry')
          try {
            await checkWorkspaceOverlap(workspace)
            return await workspaceRegistry.operations.register(workspace)
          }
          finally {
            await release()
          }
        }),
      /**
       * 读取工作区定义及来源；配置条目无数据库版本。
       * @param id - 工作区 ID。
       * @returns 工作区资源条目；未找到时返回资源不存在错误。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.workspaces.get('project')
       * ```
       */
      get: workspaceRegistry.operations.get,
      /**
       * 列出配置与数据库合并后的工作区；不创建路径或克隆工程。
       * @returns 去重后的工作区列表；列表项不含数据库 version。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.workspaces.list()
       * ```
       */
      list: workspaceRegistry.operations.list,
      /**
       * 整体替换无会话引用的数据库工作区，重新检查存储位置重叠；配置条目不可修改。
       * @param input - 包含原 ID 的完整替换定义。
       * @param version - 可选的数据库期望版本。
       * @returns 更新后的工作区；有会话引用、位置冲突或版本冲突时失败。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // definition 为完整替换定义；entry 为 get 成功返回的条目。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.workspaces.update(definition, entry.version)
       * ```
       */
      update: (input: z.input<typeof ACPWorkspaceSchema>, version?: string) =>
        protectResult(async () => {
          const workspace = ACPWorkspaceSchema.parse(input)
          const existing = await workspaceRegistry.read(workspace.id)
          if (existing?.source === 'config')
            return workspaceRegistry.operations.update(workspace, version)
          const release = await acquire('definition-registry')
          try {
            if (
              (await sessions.query({ where: { workspaceId: workspace.id } }))
                .length
            ) {
              throw new ACPFailure('busy')
            }
            await normalizeWorkspace(workspace)
            await checkWorkspaceOverlap(workspace)
            return await workspaceRegistry.operations.update(
              workspace,
              version,
            )
          }
          finally {
            await release()
          }
        }),
      /**
       * 创建目录并克隆缺失工程；已有内容不自动 pull 或覆盖，Git 不存在时返回明确错误。
       * @param id - 已登记工作区 ID。
       * @returns 准备后的 main 绝对目录；克隆失败保留现场供检查。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.workspaces.prepare('project')
       * ```
       */
      prepare: (id: string) =>
        protect(async () =>
          workspaceOperation(await getWorkspace(id), runtime =>
            createGitOperationsInput(id, runtime)),
        ),
      /**
       * 将有限大小的文件写入 main/files，拒绝覆盖、路径逃逸和符号链接；失败前已写入文件会保留。
       * @param id - 已登记工作区 ID。
       * @param files - 相对路径和 UTF-8 文本或二进制；不允许覆盖或路径逃逸。
       * @returns 已导入相对路径列表；写入中途失败不回滚已有文件。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.workspaces.importFiles('project', [{ path: 'notes.txt', content: '需求' }])
       * ```
       */
      importFiles: (
        id: string,
        files: Array<{ path: string, content: string | Uint8Array }>,
      ) =>
        protect(async () => {
          if (
            files.length > 1000
            || files.reduce(
              (sum, file) => sum + Buffer.byteLength(file.content),
              0,
            ) > limits.maxContentBytes
          ) {
            throw new ACPFailure('output')
          }
          for (const file of files) {
            if (
              !file.path
              || file.path
                .split(/[\\/]/)
                .some(
                  part =>
                    !part || part === '.' || part === '..' || part === '.git',
                )
                || isAbsolute(file.path)
            ) {
              throw new ACPFailure('invalid')
            }
          }
          return workspaceOperation(await getWorkspace(id), async (runtime) => {
            await runtime.file('mkdir', 'main/files')
            for (const file of files) {
              if (
                (await runtime.file('exists', `main/files/${file.path}`))
                === 'true'
              ) {
                throw new ACPFailure('conflict')
              }
            }
            for (const file of files) {
              await runtime.file(
                'write',
                `main/files/${file.path}`,
                Buffer.from(file.content).toString('base64'),
              )
            }
            return { imported: files.map(file => file.path) }
          })
        }),
      /**
       * 移除无会话引用的数据库定义，保留磁盘目录、Git 检出和 volume。
       * @param id - 数据库工作区 ID。
       * @param version - 可选的数据库期望版本。
       * @returns 删除定义的 HaiResult；引用存在时失败，文件始终保留。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // entry 为 get 成功返回的数据库条目。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.workspaces.remove('project', entry.version)
       * ```
       */
      remove: (id: string, version?: string) =>
        protectResult(async () => {
          return withDefinitions(async () => {
            const existing = await workspaceRegistry.read(id)
            if (existing?.source === 'config')
              return workspaceRegistry.operations.remove(id, version)
            if ((await sessions.query({ where: { workspaceId: id } })).length)
              throw new ACPFailure('busy')
            return workspaceRegistry.operations.remove(id, version)
          })
        }),
    },
    sessions: {
      /**
       * 绑定模型、工作区和 MCP，准备目录后建立原生会话；newWorktree 可选择独立工程分支。
       * @param options - 智能体、工作区、可选会话仓库、模型、MCP 及可信回调；newWorktree 默认 false。
       * @returns 可用于 prompt/stream/publish 的会话句柄；启动失败保留失败记录。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.sessions.create({ agentId: 'coder', workspaceId: 'project', repositoryId: 'api', newWorktree: true })
       * ```
       */
      create: (options: ACPCreateSessionOptions) =>
        protect(async () => {
          const info = await withDefinitions(async () => {
            const agent = await getAgent(options.agentId)
            await validateAgent(agent)
            if (!agent.enabled)
              throw new ACPFailure('unsupported')
            const id = sessionIdentitySchema.parse(options.id ?? randomUUID())
            const modelId
              = options.modelId ?? agent.defaultModelId ?? agent.modelIds[0]
            if (modelId && !agent.modelIds.includes(modelId))
              throw new ACPFailure('model')
            const workspace = options.workspaceId ? await getWorkspace(options.workspaceId) : undefined
            if (options.repositoryId !== undefined) {
              sessionIdentitySchema.parse(options.repositoryId)
              if (!workspace || agent.mode === 'custom-service' || options.cwd !== undefined)
                throw new ACPFailure('invalid')
              if (!workspace.repositories.some(repo => repo.id === options.repositoryId))
                throw new ACPFailure('missing', { id: options.repositoryId })
            }
            const info: ACPSessionInfo = {
              id,
              agentId: agent.id,
              workspaceId: options.workspaceId,
              repositoryId: options.repositoryId,
              cwd: options.cwd ?? '',
              newWorktree: options.newWorktree ?? false,
              branch: options.newWorktree
                ? branchNameSchema.parse(options.branch ?? `acp/${id}`)
                : undefined,
              modelId,
              modelSignature: await modelSignature(agent),
              status: 'opening',
              agent,
              mcpServers: options.mcpServers ?? [],
              mcpServerIds: options.mcpServerIds,
            }
            await unique(sessions, id, info)
            return info
          })
          return start(info, options, false)
        }),
      /**
       * 获取持久会话的管理句柄；已关闭会话需要 resume 后才能执行 prompt。
       * @param id - 框架会话 ID，不是智能体原生 ID。
       * @returns 管理句柄的 HaiResult；不会自动重新启动智能体。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.sessions.get('task-1')
       * ```
       */
      get: (id: string) =>
        protect(async () => {
          await get(sessions, id)
          return handle(id)
        }),
      /**
       * 列出持久会话，可按工作区 ID 过滤。
       * @param workspaceId - 可选工作区筛选条件；省略返回全部会话。
       * @returns 持久 ACPSessionInfo 列表的 HaiResult。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.sessions.list('project')
       * ```
       */
      list: (workspaceId?: string) =>
        protect(() =>
          sessions.query({ where: workspaceId ? { workspaceId } : {} }),
        ),
      /**
       * 使用原生会话 ID 和保留状态恢复；智能体定义或模型能力已改变时拒绝恢复。
       * @param id - 已关闭或失败的框架会话 ID。
       * @param options - 本次连接的回调、能力和取消信号，不从数据库恢复回调。
       * @returns 恢复后的会话句柄；原生服务不支持恢复或配置变化时失败。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.sessions.resume('task-1')
       * ```
       */
      resume: (id: string, options: ACPClientOptions = {}) =>
        protect(async () => {
          const info = await get(sessions, id)
          if (info.status === 'opening' || info.status === 'active')
            throw new ACPFailure('busy')
          const agent = await getAgent(info.agentId)
          if (
            !agent.enabled
            || JSON.stringify(agent) !== JSON.stringify(info.agent)
          ) {
            throw new ACPFailure('conflict')
          }
          if (info.modelSignature !== (await modelSignature(agent)))
            throw new ACPFailure('conflict')
          return start(info, options, true)
        }),
      /**
       * 关闭本进程拥有的会话并释放锁，不删除历史和工程内容。
       * @param id - 框架会话 ID。
       * @returns 关闭完成的 HaiResult；不允许关闭其他进程拥有的执行环境。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.sessions.close('task-1')
       * ```
       */
      close: (id: string) => protect(() => stop(id)),
      /**
       * 回收停止后由框架登记的干净工作树；调用方须先停止独立预览。
       * @param id - 框架会话 ID；仅支持记录了归属的独立 Git 会话。
       * @returns 回收完成的 HaiResult；可重试，保留分支、普通文件及原生历史。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：已关闭 Agent，已停止预览并提交或另存修改。
       * const result = await ai.acp.sessions.reclaimWorktree('task-1')
       * if (!result.success) throw new Error(result.error.message)
       * ```
       */
      reclaimWorktree: (id: string) =>
        protect(async () => {
          sessionIdentitySchema.parse(id)
          const release = await acquire(`session:${id}`)
          try {
            const info = await get(sessions, id)
            if (info.status === 'opening' || info.status === 'active' || info.resource)
              throw new ACPFailure('busy')
            if (info.worktreeStatus === 'reclaimed')
              return
            if (!info.workspaceId || !info.workspace?.repositories.length || !info.newWorktree || !info.branch)
              throw new ACPFailure('unsupported')
            const workspace = await getWorkspace(info.workspaceId)
            checkStorage(workspace, info)
            await workspaceOperation(workspace, async (runtime) => {
              checkLayout(workspace, runtime, info)
              await createGitOperations(workspace, runtime).reclaimWorktree(id, info.branch!, async () => {
                info.worktreeStatus = 'reclaiming'
                await sessions.save(id, info)
              })
              info.worktreeStatus = 'reclaimed'
              await sessions.save(id, info)
            })
          }
          finally {
            await release()
          }
        }),
      /**
       * 仅删除已关闭或失败的会话记录；不删除工作树及原生文件，不替代 Git worktree 清理。
       * @param id - 框架会话 ID。
       * @returns 删除完成的 HaiResult；活动会话返回忙碌错误。
       * @example
       * ```ts
       * import { ai } from '@h-ai/ai'
       * // 前提：ai 已成功初始化。
       * // 普通 API 先检查 result.success，再读取 data 或 error。
       * const result = await ai.acp.sessions.remove('task-1')
       * ```
       */
      remove: (id: string) =>
        protect(async () => {
          sessionIdentitySchema.parse(id)
          const release = await acquire(`session:${id}`)
          try {
            const info = await get(sessions, id)
            if (info.status === 'active' || info.status === 'opening' || info.worktreeStatus === 'reclaiming')
              throw new ACPFailure('busy')
            await sessions.remove(id)
          }
          finally {
            await release()
          }
        }),
    },
    /**
     * 连接原生 stdio/HTTP/WS 服务；不创建工作区或提供传输兼容桥。
     * @param transport - 智能体实际支持的原生传输与命令或地址。
     * @param options - 可信回调、声明能力和初始化取消信号。
     * @returns 低层连接句柄的 HaiResult；连接失败不自动转换传输。
     * @example
     * ```ts
     * import { ai } from '@h-ai/ai'
     * // 前提：ai 已成功初始化。
     * // 普通 API 先检查 result.success，再读取 data 或 error。
     * const result = await ai.acp.connect({ type: 'http', url: 'https://agent.example.com/acp' })
     * ```
     */
    connect: (transport: ACPTransport, options: ACPClientOptions = {}) =>
      protect(async () => {
        const connection = await connectACP(transport, options, limits)
        connections.add(connection)
        return {
          info: connection.initialized,
          /**
           * 选择对端握手公布的认证方法，返回 HaiResult。
           * @param method - initialize 返回的认证方法 ID。
           * @returns 认证响应的 HaiResult。
           * @example
           * ```ts
           * // connection/session 为已成功连接或创建的句柄，先检查 result.success。
           * const result = await connection.authenticate('api-key')
           * ```
           */
          authenticate: (method: string) =>
            protect(() => connection.authenticate(method)),
          /**
           * 在对端可见的绝对 cwd 创建原生会话，返回 prompt/cancel 句柄。
           * @param cwd - 对端文件系统可见的绝对工作目录。
           * @param mcpServers - 可选原生 MCP 定义；调用方负责凭据与授权。
           * @returns 原生会话句柄；不创建框架持久会话记录。
           * @example
           * ```ts
           * // connection/session 为已成功连接或创建的句柄，先检查 result.success。
           * const result = await connection.createSession('/srv/project', [])
           * ```
           */
          createSession: (cwd: string, mcpServers?: McpServer[]) =>
            protect(async () => {
              const session = await connection.createSession(cwd, mcpServers)
              return {
                id: session.sessionId,
                /**
                 * 发送一轮原生内容，返回最终文本、停止原因和事件。
                 * @param content - 原生 ACP 内容块。
                 * @param signal - 可选本轮取消信号。
                 * @returns 最终文本、停止原因和事件的 HaiResult。
                 * @example
                 * ```ts
                 * // connection/session 为已成功连接或创建的句柄，先检查 result.success。
                 * const result = await session.prompt([{ type: 'text', text: '检查工程' }])
                 * ```
                 */
                prompt: (content: ContentBlock[], signal?: AbortSignal) =>
                  protect(() => connection.prompt(content, signal)),
                /**
                 * 取消当前轮次，超时则关闭连接。
                 * @returns 取消完成的 HaiResult。
                 * @example
                 * ```ts
                 * // connection/session 为已成功连接或创建的句柄，先检查 result.success。
                 * const result = await session.cancel()
                 * ```
                 */
                cancel: () => protect(() => connection.cancel()),
              }
            }),
          /**
           * 读取对端原生会话列表；未声明相应能力时返回错误。
           * @param cursor - 上一次原生列表响应中的分页游标。
           * @returns 原生分页响应的 HaiResult。
           * @example
           * ```ts
           * // connection/session 为已成功连接或创建的句柄，先检查 result.success。
           * const result = await connection.listSessions()
           * ```
           */
          listSessions: (cursor?: string) =>
            protect(() => connection.listSessions(cursor)),
          /**
           * 按原生 ID 删除远端会话；不会删除框架数据库会话记录。
           * @param id - 对端返回的原生会话 ID。
           * @returns 原生删除响应的 HaiResult；不支持时返回协议错误。
           * @example
           * ```ts
           * // connection/session 为已成功连接或创建的句柄，先检查 result.success。
           * const result = await connection.deleteSession('native-id')
           * ```
           */
          deleteSession: (id: string) =>
            protect(() => connection.deleteSession(id)),
          /**
           * 关闭连接和拥有的子进程；不删除远端文件或持久状态。
           * @returns 关闭完成的 HaiResult；可重复关闭。
           * @example
           * ```ts
           * // connection/session 为已成功连接或创建的句柄，先检查 result.success。
           * const result = await connection.close()
           * ```
           */
          close: () =>
            protect(async () => {
              await connection.close()
              connections.delete(connection)
            }),
        }
      }),
    /**
     * 关闭子系统及拥有的资源；由 ai.close 生命周期调用。
     * @returns 所有已接受操作结束和拥有资源完成清理后的 Promise。
     * @throws 清理进程或容器失败时抛出 ACPFailure，由 ai.close 统一处理。
     * @example
     * ```ts
     * import { ai } from '@h-ai/ai'
     * // 前提：ai 已成功初始化。
     * // 普通 API 先检查 result.success，再读取 data 或 error。
     * await ai.close()
     * ```
     */
    async close() {
      closed = true
      await Promise.allSettled(
        [...live.values()].map(value => value.connection.cancel()),
      )
      await Promise.allSettled(
        [...connections].map(connection => connection.close()),
      )
      await Promise.allSettled([...pending])
      const results = await Promise.allSettled([...live.keys()].map(stop))
      const more = await Promise.allSettled(
        [...connections].map(connection => connection.close()),
      )
      connections.clear()
      if ([...results, ...more].some(result => result.status === 'rejected'))
        throw new ACPFailure('cleanup')
    },
  }
  async function createGitOperationsInput(id: string, runtime: ACPRuntime) {
    return createGitOperations(await getWorkspace(id), runtime).prepare()
  }
}
