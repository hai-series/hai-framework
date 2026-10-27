/**
 * 工作区导航标题按实例共享，读取 getter 以跟随路由及语言变化。
 * @example 模块内部上下文
 * ```ts
 * const context: WorkspaceContext = { title: '用户管理' }
 * void context
 * ```
 */
export interface WorkspaceContext {
  readonly title: string
}

/**
 * 仅供布局和标题组件协作，不属于公开 API。
 * @example 模块内部上下文
 * ```ts
 * const key: symbol = workspaceContextKey
 * void key
 * ```
 */
export const workspaceContextKey = Symbol('hai-workspace')
