import type { ClientCapabilities, ClientRequestHandlersByMethod, McpServer, SessionNotification } from '@agentclientprotocol/sdk'
import type { z } from 'zod'
import type { ResolvedModelConfig } from '../ai-config.js'
import type { ACPAgentSchema } from './ai-acp-config.js'
import type { createACPOperations } from './ai-acp-functions.js'

/**
 * 原生传输参数；HTTP/WS 使用锁定版本的官方实验传输，不进行隐式转换。
 * @example
 * ```ts
 * import type { ACPTransport } from '@h-ai/ai'
 * const transport: ACPTransport = { type: 'stdio', command: 'codex-acp' }
 * ```
 */
export type ACPTransport
  = | {
    /** 通过独占子进程 stdin/stdout 传输 ACP。 */
    type: 'stdio'
    /** 直接执行的程序路径，不通过 shell。 */
    command: string
    /** 原生参数数组。 */
    args?: string[]
    /** 子进程工作目录。 */
    cwd?: string
    /** 传给子进程的环境变量，与最小宿主环境合并。 */
    env?: Record<string, string>
  }
  | {
    /** 原生远程传输；对端必须支持相同 SDK 协议版本。 */
    type: 'http' | 'ws'
    /** ACP 服务地址，协议应与 type 一致。 */
    url: string
    /** 当前连接的认证请求头，仅保存在内存。 */
    headers?: Record<string, string>
  }
/**
 * 可信宿主回调。声明能力必须提供对应实现；默认拒绝权限请求。
 * @example
 * ```ts
 * import type { ACPClientOptions } from '@h-ai/ai'
 * const options: ACPClientOptions = { handlers: { 'session/request_permission': () => ({ outcome: { outcome: 'cancelled' } }) } }
 * ```
 */
export interface ACPClientOptions {
  /** 接收原生会话事件，包括 session/new 完成前的事件；抛错将关闭连接。 */
  onEvent?: (event: SessionNotification) => void
  /** 可信客户端回调实现；未提供权限回调时默认拒绝。 */
  handlers?: Partial<ClientRequestHandlersByMethod>
  /** 向智能体声明的能力；声明的文件、终端和 elicitation 能力必须配齐回调。 */
  capabilities?: ClientCapabilities
  /** 初始化连接的取消信号；每轮 prompt 的取消信号独立传入。 */
  signal?: AbortSignal
}

/**
 * 可信原生配置扩展；返回值只传给进程，不写入 Agent 定义存储。
 * @example
 * ```ts
 * import type { ACPAgentAdapter } from '@h-ai/ai'
 * const adapter: ACPAgentAdapter = { configure: () => ({ command: 'my-agent', args: ['--acp'], env: {} }) }
 * ```
 */
export interface ACPAgentAdapter {
  /** 仅已验证无原生越权入口、能安全隔离并关闭会话的适配器可声明。 */
  sharedSessions?: true
  /** 验证原生扩展并返回实际生效的选项。 */
  nativeOptions?: z.ZodType<Record<string, import('@h-ai/runner').RunnerJson>>
  /**
   * 生成当前会话的原生启动参数；实现可以异步，不应在此启动进程或持久保存密钥。
   * @param input - 智能体、已解析模型与独立状态目录。
   * @returns 原生可执行文件、参数、临时环境和可选配置文件。
   * @example
   * ```ts
   * const adapter: ACPAgentAdapter = { configure: ({ statePath }) => ({ command: 'my-agent', args: ['--acp'], env: { AGENT_HOME: statePath } }) }
   * ```
   */
  configure: (input: ACPAgentAdapterInput) => ACPAgentLaunch | Promise<ACPAgentLaunch>
}
/**
 * 原生适配器输入；模型来源由框架统一解析，适配器不维护独立模型清单。
 * @example
 * ```ts
 * import type { ACPAgentAdapterInput } from '@h-ai/ai'
 * function selected(input: ACPAgentAdapterInput) { return input.models.find(model => model.id === input.modelId) }
 * ```
 */
export interface ACPAgentAdapterInput {
  /** 合并清单中的智能体定义。 */
  agent: z.infer<typeof ACPAgentSchema>
  /** 智能体绑定的全部模型及已解析协议、凭据、容量和模态信息。 */
  models: Array<{ id: string, config: ResolvedModelConfig }>
  /** 本次会话选择的模型 ID。 */
  modelId?: string
  /** 已创建的专属状态目录；托管容器内使用 /state/<会话 ID>。 */
  statePath: string
  /** 受管任务请求的权限范围。 */
  permissionProfile?: 'read-only' | 'workspace' | 'full-access'
  /** 已由适配器 Schema 校验的原生扩展选项。 */
  nativeOptions?: Record<string, import('@h-ai/runner').RunnerJson>
  /** 模型声明支持且适配器可落实的推理级别。 */
  reasoningEffort?: string
}
/**
 * 单次启动的原生配置；env 可能含凭据，不可向浏览器或日志直接公开。
 * @example
 * ```ts
 * import type { ACPAgentLaunch } from '@h-ai/ai'
 * const launch: ACPAgentLaunch = { command: 'my-agent', args: ['--acp'], env: {} }
 * ```
 */
export interface ACPAgentLaunch {
  /** 直接执行的程序，禁止拼接 shell 命令。 */
  command: string
  /** 原生参数数组。 */
  args: string[]
  /** 仅向当前执行环境注入的变量。 */
  env: Record<string, string>
  /** 状态目录下的普通配置文件，文件名不允许路径分隔符。 */
  files?: Record<string, string>
}

/**
 * 已准备的工程位置，供同一节点上的可信预览或检查进程使用。
 * @example
 * ```ts
 * import type { ACPSessionWorkspace } from '@h-ai/ai'
 * function webPath(workspace: ACPSessionWorkspace) { return workspace.repositories.find(repo => repo.id === 'web')?.path }
 * ```
 */
export interface ACPSessionWorkspace {
  /** 本机真实目录，或实际使用的引擎、源码卷和容器挂载点。 */
  storage:
    | { type: 'directory', path: string }
    | { type: 'volume', engine: 'podman' | 'docker', name: string, mountPath: string }
  /** 当前会话的聚合目录，位于上述宿主目录或容器挂载点内。 */
  path: string
  /** 登记仓库在同一文件系统中的绝对路径。 */
  repositories: Array<{ id: string, path: string }>
}

/**
 * 持久会话绑定；原生 ID 不等于框架 ID，工作目录只能由登记信息生成。
 * @example
 * ```ts
 * import type { ACPSessionInfo } from '@h-ai/ai'
 * function sessionStatus(session: ACPSessionInfo) { return session.status }
 * ```
 */
export interface ACPSessionInfo {
  /** 框架会话 ID，与智能体返回的 nativeId 分开维护。 */
  id: string
  /** 合并清单中的智能体 ID。 */
  agentId: string
  /** 受管理工作区 ID；远程自定义服务可省略。 */
  workspaceId?: string
  /** 作为会话工作目录的已登记仓库；省略时使用聚合目录。 */
  repositoryId?: string
  /** 智能体实际可见的绝对工作目录。 */
  cwd: string
  /** 是否使用独立检出目录；false 表示共享工作区主目录。 */
  newWorktree: boolean
  /** 独立会话中所有工程共用的分支名。 */
  branch?: string
  /** 受管目录交接信息；创建失败时可能只有部分工作树，旧记录或远程会话可能没有该字段。 */
  workspace?: ACPSessionWorkspace
  /** 显式回收已开始或完成。此时 workspace 仅供历史追溯，不可恢复会话或发布工作树。 */
  worktreeStatus?: 'reclaiming' | 'reclaimed'
  /** 启动时选定的 Hai 模型 ID。 */
  modelId?: string
  /** 模型非密钥配置的摘要；用于阻止不兼容的会话恢复。 */
  modelSignature?: string
  /** 智能体原生会话 ID，恢复时原样传回。 */
  nativeId?: string
  /** 打开中、运行中、已关闭或打开失败。 */
  status: 'opening' | 'active' | 'closed' | 'failed'
  /** 创建会话时的智能体定义快照。 */
  agent: z.infer<typeof ACPAgentSchema>
  /** 直接绑定的原生 MCP 参数；可能含凭据，仅供可信服务端管理。 */
  mcpServers: McpServer[]
  /** 从 MCP 合并清单选择的服务 ID；凭据在启动时解析。 */
  mcpServerIds?: string[]
  /** 当前拥有的容器；关闭后清空，volume 内容仍保留。 */
  resource?: { engine?: 'podman' | 'docker', container: string }
}
/**
 * 创建会话参数；远程服务使用它自身可见的绝对路径。
 * @example
 * ```ts
 * import type { ACPCreateSessionOptions } from '@h-ai/ai'
 * const options: ACPCreateSessionOptions = { agentId: 'coder', workspaceId: 'project', newWorktree: true }
 * ```
 */
export interface ACPCreateSessionOptions extends ACPClientOptions {
  /** 可选业务会话 ID；省略时生成 UUID。 */
  id?: string
  /** 合并清单中的智能体 ID。 */
  agentId: string
  /** 托管模式必填的工作区 ID。 */
  workspaceId?: string
  /** 以已登记仓库的根目录启动与恢复；不改变 worktree 和 Git 发布的仓库范围。 */
  repositoryId?: string
  /** 自定义远程服务可见的绝对路径；托管模式由工作区计算。 */
  cwd?: string
  /** 默认 false；true 时从每个工程当前本地主分支创建 worktree。 */
  newWorktree?: boolean
  /** 独立会话分支名；默认 acp/<会话 ID>。 */
  branch?: string
  /** 本次会话的模型 ID，必须在智能体 modelIds 内。 */
  modelId?: string
  /** 直接传给智能体的 MCP 定义；与 mcpServerIds 合并。 */
  mcpServers?: McpServer[]
  /** 从 ai.mcp.servers 选择的登记服务。 */
  mcpServerIds?: string[]
}
/**
 * 每个工程分别报告，保留失败前已发生的提交和推送结果。
 * @example
 * ```ts
 * import type { ACPGitReport } from '@h-ai/ai'
 * function failedRepositories(reports: ACPGitReport[]) { return reports.filter(report => !report.success).map(report => report.repositoryId) }
 * ```
 */
export interface ACPGitReport {
  /** 工作区中声明的工程 ID。 */
  repositoryId: string
  /** 该工程是否完成全部请求操作。 */
  success: boolean
  /** 成功时为 done；失败时标明停止阶段。 */
  phase: 'check' | 'commit' | 'fetch' | 'merge' | 'push' | 'done'
  /** 已创建或发布的提交 SHA；失败前可能已经产生提交。 */
  commit?: string
  /** 脱敏的失败原因，不包含 Git stderr 或认证资料。 */
  error?: string
}
/**
 * ACP 操作入口。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * async function listAgents() { const result = await ai.acp.agents.list(); if (!result.success) return result; return result.data }
 * ```
 */
export type ACPOperations = ReturnType<typeof createACPOperations>
