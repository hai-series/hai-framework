import type { NavAdapter } from './components/scenes/crud/nav-adapter.js'

/** 业务文案使用函数延迟求值，切换语言时重新读取应用翻译。 */
export type GuideText = string | (() => string)

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

export interface GuideProgress {
  version: number
  status: 'completed' | 'dismissed' | 'deferred'
  updatedAt: number
}

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

/** 浏览器 UI 控制器，操作失败返回 false 并设置 error，不抛业务异常。 */
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
