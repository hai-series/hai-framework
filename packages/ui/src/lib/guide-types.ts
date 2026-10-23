import type { NavAdapter } from './components/scenes/crud/nav-adapter.js'

/**
 * 业务文案使用函数延迟求值，切换语言时重新读取应用翻译。
 *
 * @example
 * ```ts
 * import type { GuideText } from '@h-ai/ui'
 * const example: GuideText = () => '开始使用'
 * ```
 */
export type GuideText = string | (() => string)

/**
 * 导览步骤；目标缺失时按 optional 决定跳过或停止，准备动作接受取消信号。
 *
 * @example
 * ```ts
 * import type { GuideStep } from '@h-ai/ui'
 * const example: GuideStep = { target: 'save', title: '保存', description: '点击保存资料', side: 'bottom' }
 * ```
 */
export interface GuideStep {
  /** data-guide 的值；复杂定位可传入返回元素的函数。 */
  target: string | (() => Element | null)
  title: GuideText
  description: GuideText
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** 只准备页面交互状态，例如展开页签；可通过 signal 取消异步等待。 */
  before?: (signal: AbortSignal) => void | Promise<void>
  /** 可选元素缺失时跳过，必要元素缺失时停止并显示提示。 */
  optional?: boolean
}

/**
 * 具备稳定 id 和版本的导览定义；enabled 仅控制界面是否提供此导览。
 *
 * @example
 * ```ts
 * import type { GuideTour } from '@h-ai/ui'
 * const example: GuideTour = { id: 'profile', title: '完善资料', version: 1, steps: [{ target: 'save', title: '保存', description: '保存当前资料' }] }
 * ```
 */
export interface GuideTour {
  id: string
  title: GuideText
  description?: GuideText
  version?: number
  /** 目标页面路径；导航由宿主的 NavAdapter 提供。 */
  route?: string
  steps: readonly GuideStep[]
  /** 按当前权限或功能开关决定是否提供此导览。 */
  enabled?: () => boolean
}

/**
 * 帮助中心文章；业务文案可延迟翻译，Markdown 按组件安全策略渲染。
 *
 * @example
 * ```ts
 * import type { GuideArticle } from '@h-ai/ui'
 * const example: GuideArticle = { id: 'start', title: '开始使用', content: '# 操作说明', category: '入门' }
 * ```
 */
export interface GuideArticle {
  id: string
  title: GuideText
  description?: GuideText
  category?: GuideText
  /** Markdown 正文；原始 HTML 默认关闭。 */
  content: GuideText
  tourId?: string
  enabled?: () => boolean
}

/**
 * 非敏感的导览偏好记录；版本变化后可重新向用户提供导览。
 *
 * @example
 * ```ts
 * import type { GuideProgress } from '@h-ai/ui'
 * const example: GuideProgress = { version: 1, status: 'completed', updatedAt: 1790812800000 }
 * ```
 */
export interface GuideProgress {
  version: number
  status: 'completed' | 'dismissed' | 'deferred'
  updatedAt: number
}

/**
 * 导览控制器配置；持久化仅存 UI 偏好，不保存凭证或服务端业务状态。
 *
 * @example
 * ```ts
 * import type { GuideOptions } from '@h-ai/ui'
 * const example: GuideOptions = { tours: [{ id: 'intro', title: '入门', steps: [{ target: 'save', title: '保存', description: '提交当前资料' }] }], persistence: 'memory', persistKey: 'demo-guide' }
 * ```
 */
export interface GuideOptions {
  tours: readonly GuideTour[]
  articles?: readonly GuideArticle[]
  persistence?: 'cookie' | 'localStorage' | 'memory'
  /** 同源多个应用应使用不同前缀。 */
  persistKey?: string
  nav?: NavAdapter
  /** 每个目标元素的等待上限，默认 3000 毫秒。 */
  waitTimeout?: number
}

/**
 * 浏览器 UI 控制器，操作失败返回 false 并设置 error，不抛业务异常。
 *
 * @example
 * ```ts
 * import { createGuide } from '@h-ai/ui'
 * import type { GuideController } from '@h-ai/ui'
 * const guide: GuideController = createGuide({ tours: [], articles: [{ id: 'start', title: '开始', content: '# 操作说明' }], persistence: 'memory' })
 * guide.openHelp('start')
 * guide.closeHelp()
 * guide.stop()
 * ```
 */
export interface GuideController {
  readonly tours: readonly GuideTour[]
  readonly articles: readonly GuideArticle[]
  readonly offeredTour: GuideTour | undefined
  readonly activeTourId: string | null
  readonly busy: boolean
  readonly error: string
  readonly locale: string
  readonly pathname: string
  readonly helpOpen: boolean
  readonly articleId: string | null
  start: (id: string) => Promise<boolean>
  startIfNeeded: (id: string) => boolean
  defer: () => void
  dismiss: () => void
  stop: () => void
  reset: (id: string) => void
  getProgress: (id: string) => GuideProgress | null
  openHelp: (articleId?: string) => void
  closeHelp: () => void
  clearError: () => void
  /** GuideHost 负责同步以下宿主状态，应用通常不需要手动调用。 */
  setLocale: (locale: string) => void
  setScope: (scope: string) => void
  handleNavigation: (pathname: string) => void
  resume: () => Promise<boolean>
}
