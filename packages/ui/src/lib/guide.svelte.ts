import type { Config, Driver, DriveStep } from 'driver.js'
import type { GuideController, GuideOptions, GuideProgress, GuideStep, GuideText, GuideTour } from './guide-types.js'
import { tick } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import { createBrowserNavAdapter } from './components/scenes/crud/nav-adapter.js'
import { createGuideStorage } from './guide-storage.js'
import { getUILocale, uiM } from './messages.js'

/** 同一浏览器页面只允许一个导览拥有遮罩和键盘监听。 */
let stopActiveGuide: (() => void) | undefined

/**
 * 解析业务文案；既支持普通字符串，也支持应用 i18n 函数。
 * @param text - 待处理文本。
 * @returns 业务字符串或延迟翻译函数的当前文本；空输入为空字符串。
 *
 * @example
 * ```ts
 * import { resolveGuideText } from '@h-ai/ui'
 * const title = resolveGuideText(() => '操作说明')
 * ```
 */
export function resolveGuideText(text?: GuideText): string {
  return typeof text === 'function' ? text() : text ?? ''
}

function escapeGuideText(text: GuideText): string {
  return resolveGuideText(text).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  })[character]!)
}

function findTarget(step: GuideStep): Element | null {
  try {
    const element = typeof step.target === 'function'
      ? step.target()
      : [...document.querySelectorAll('[data-guide]')].find(item => item.getAttribute('data-guide') === step.target)
    if (!element?.isConnected || !element.getClientRects().length || element.closest('[hidden], [aria-hidden="true"]'))
      return null
    const style = getComputedStyle(element)
    return style.visibility === 'hidden' || style.display === 'none' ? null : element
  }
  catch { return null }
}

/** 等待异步渲染、页签展开或布局变化，所有退出路径均清理监听和计时器。 */
function waitForTarget(step: GuideStep, signal: AbortSignal, timeout: number, ready: () => boolean): Promise<Element | null> {
  return new Promise((resolve) => {
    let observer: MutationObserver | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let poll: ReturnType<typeof setInterval> | undefined
    const finish = (element: Element | null) => {
      observer?.disconnect()
      clearTimeout(timer)
      clearInterval(poll)
      signal.removeEventListener('abort', aborted)
      resolve(element)
    }
    function aborted() {
      finish(null)
    }
    const check = () => {
      if (signal.aborted) {
        finish(null)
        return
      }
      try {
        const element = ready() ? findTarget(step) : null
        if (element)
          finish(element)
      }
      catch { finish(null) }
    }
    if (signal.aborted) {
      finish(null)
      return
    }
    try {
      const initial = ready() ? findTarget(step) : null
      if (initial) {
        finish(initial)
        return
      }
    }
    catch {
      finish(null)
      return
    }
    observer = new MutationObserver(check)
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    signal.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(finish, timeout, null)
    poll = setInterval(check, 50)
  })
}

/**
 * 创建应用独享的新手引导控制器。SSR 可创建，DOM 操作只在客户端启动时发生。
 * 配置和控制器应在布局组件内创建，避免在 SSR 模块级共享用户状态。
 * @param options - 本次操作的行为与显示选项。
 * @returns 导览与帮助中心控制器；交互失败使用 false/error 表达。
 *
 * @example
 * ```ts
 * import { createGuide } from '@h-ai/ui'
 * const guide = createGuide({ tours: [{ id: 'intro', title: '入门', steps: [{ target: 'save', title: '保存', description: '提交当前资料' }] }], persistence: 'memory' })
 * const offered = guide.startIfNeeded('intro')
 * if (offered) guide.openHelp()
 * guide.stop()
 * ```
 */
export function createGuide(options: GuideOptions): GuideController {
  const storage = createGuideStorage(options)
  const nav = options.nav ?? createBrowserNavAdapter()
  const persistKey = options.persistKey ?? 'hai-guide'
  const pendingKey = `${persistKey}-pending`
  let scope = 'anonymous'
  let locale = $state(getUILocale())
  let offeredId = $state<string | null>(null)
  let activeTourId = $state<string | null>(null)
  let busy = $state(false)
  let error = $state<Parameters<typeof uiM>[0] | ''>('')
  let helpOpen = $state(false)
  let articleId = $state<string | null>(null)
  let driver: Driver | undefined
  let abort: AbortController | undefined
  let generation = 0
  let expectedPath: string | undefined
  let navigating = false
  let focusBefore: HTMLElement | null = null
  let activeElement: Element | null = null
  let targetObserver: MutationObserver | undefined
  const msg = (key: Parameters<typeof uiM>[0]) => uiM(key, undefined, locale)
  const progressKey = (id: string) => `${persistKey}:${scope}:${id}`
  const tourFor = (id: string) => {
    try {
      return options.tours.find(tour => tour.id === id && (!tour.enabled || tour.enabled()))
    }
    catch { return undefined }
  }

  function clearPending(): void {
    try {
      sessionStorage.removeItem(pendingKey)
    }
    catch {
      // 存储受限时仅支持宿主客户端导航。
    }
  }

  function stop(): void {
    generation++
    abort?.abort()
    abort = undefined
    targetObserver?.disconnect()
    targetObserver = undefined
    const previousDriver = driver
    driver = undefined
    previousDriver?.destroy()
    activeTourId = null
    activeElement = null
    busy = false
    expectedPath = undefined
    if (!navigating)
      clearPending()
    if (stopActiveGuide === stop)
      stopActiveGuide = undefined
    if (focusBefore?.isConnected)
      focusBefore.focus()
    focusBefore = null
  }

  function mark(tour: GuideTour, status: GuideProgress['status']): void {
    storage.set(progressKey(tour.id), { version: tour.version ?? 1, status, updatedAt: Date.now() })
  }

  function getProgress(id: string): GuideProgress | null {
    return storage.get(progressKey(id))
  }

  function driverSteps(tour: GuideTour): DriveStep[] {
    return tour.steps.map(step => ({
      element: () => findTarget(step) ?? document.body,
      popover: {
        title: escapeGuideText(step.title),
        description: escapeGuideText(step.description),
        side: step.side ?? 'bottom',
      },
    }))
  }

  function translatedConfig(tour: GuideTour): Config {
    return {
      steps: driverSteps(tour),
      nextBtnText: msg('guide_next'),
      prevBtnText: msg('guide_previous'),
      doneBtnText: msg('guide_done'),
      closeBtnLabel: msg('guide_close'),
      progressText: uiM('guide_progress', { current: '{{current}}', total: '{{total}}' }, locale),
    }
  }

  async function start(id: string): Promise<boolean> {
    if (typeof document === 'undefined')
      return false
    stopActiveGuide?.()
    stop()
    navigating = false
    error = ''
    offeredId = null
    helpOpen = false
    const tour = tourFor(id)
    if (!tour?.steps.length) {
      error ||= 'guide_unavailable'
      return false
    }
    const run = generation
    const signal = new AbortController()
    abort = signal
    activeTourId = id
    busy = true
    stopActiveGuide = stop
    focusBefore = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const requiredSeen = new SvelteSet<number>()
    let finishHighlight: (() => void) | undefined
    function hasPreviousStep(index = driver?.getActiveIndex() ?? 0): boolean {
      return [...requiredSeen].some(stepIndex => stepIndex < index)
    }
    function disableNavigation(disabled: boolean): void {
      const popover = driver?.getState().popover
      if (popover) {
        popover.nextButton.disabled = disabled
        popover.previousButton.disabled = disabled || !hasPreviousStep()
      }
    }

    async function showStep(index: number, direction = 1): Promise<boolean> {
      if (signal.signal.aborted || run !== generation)
        return false
      busy = true
      disableNavigation(true)
      try {
        while (index >= 0 && index < tour!.steps.length) {
          const step = tour!.steps[index]!
          await step.before?.(signal.signal)
          await tick()
          if (signal.signal.aborted || run !== generation)
            return false
          const element = await waitForTarget(step, signal.signal, options.waitTimeout ?? 3000, () => !expectedPath || nav.pathname === expectedPath)
          if (signal.signal.aborted || run !== generation)
            return false
          if (!element) {
            if (step.optional) {
              index += direction
              continue
            }
            error = 'guide_targetMissing'
            stop()
            return false
          }
          requiredSeen.add(index)
          activeElement = element
          driver?.setConfig({ ...driver.getConfig(), ...translatedConfig(tour!) })
          // 等到引擎完成首帧定位后再报告启动成功，键盘此时已可操作。
          await new Promise<void>((resolve) => {
            const finished = () => {
              signal.signal.removeEventListener('abort', finished)
              if (finishHighlight === finished)
                finishHighlight = undefined
              resolve()
            }
            finishHighlight = finished
            signal.signal.addEventListener('abort', finished, { once: true })
            driver?.drive(index)
          })
          if (!signal.signal.aborted && run === generation && !findTarget(step)) {
            error = 'guide_targetMissing'
            stop()
            return false
          }
          return !signal.signal.aborted && run === generation
        }
        if (direction > 0 && tour!.steps.every((step, stepIndex) => step.optional || requiredSeen.has(stepIndex)) && requiredSeen.size) {
          // 完成点击与 DOM 卸载可能发生在同一帧，不能把已消失的目标误记为完成。
          const currentStep = tour!.steps[driver?.getActiveIndex() ?? 0]
          if (!currentStep || !findTarget(currentStep)) {
            error = 'guide_targetMissing'
            stop()
            return false
          }
          mark(tour!, 'completed')
          stop()
          return true
        }
        error = 'guide_targetMissing'
        stop()
        return false
      }
      catch {
        if (!signal.signal.aborted && run === generation) {
          error = 'guide_startFailed'
          stop()
        }
        return false
      }
      finally {
        if (run === generation) {
          busy = false
          disableNavigation(false)
        }
      }
    }

    try {
      // 动态导入引擎，只有开始导览时才加载定位和遮罩实现。
      const { driver: createDriver } = await import('driver.js')
      if (signal.signal.aborted || run !== generation)
        return false
      if (tour.route && nav.pathname !== tour.route.split('?')[0]) {
        expectedPath = tour.route.split('?')[0]
        navigating = true
        try {
          sessionStorage.setItem(pendingKey, JSON.stringify({ id, scope, route: expectedPath, createdAt: Date.now() }))
        }
        catch {
          // Cookie 或 WebView 存储限制不阻止客户端导航。
        }
        await nav.navigate(tour.route)
        if (signal.signal.aborted || run !== generation)
          return false
        if (!options.nav) {
          // 默认导航会完整加载新页面；保留待启动记录，由目标页宿主恢复。
          stop()
          return true
        }
        navigating = false
      }
      expectedPath ??= nav.pathname
      driver = createDriver({
        ...translatedConfig(tour),
        popoverClass: 'hai-guide-popover',
        showProgress: true,
        animate: !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        duration: 200,
        stageRadius: 10,
        stagePadding: 8,
        overlayOpacity: 0.45,
        allowKeyboardControl: true,
        overlayClickBehavior: 'close',
        onNextClick: () => {
          if (!busy)
            void showStep((driver?.getActiveIndex() ?? 0) + 1)
        },
        onPrevClick: () => {
          if (!busy && hasPreviousStep())
            void showStep((driver?.getActiveIndex() ?? 0) - 1, -1)
        },
        onDoneClick: () => {
          if (!busy)
            void showStep(tour.steps.length)
        },
        onHighlighted: () => finishHighlight?.(),
        // 引擎首帧未完成时不会触发 onDestroyed；从关闭开始时统一取消等待。
        onDestroyStarted: stop,
        onDestroyed: () => {
          if (driver) {
            driver = undefined
            stop()
          }
        },
        onPopoverRender: (popover) => {
          try {
          // 第三方默认支持 HTML；业务翻译和插值统一按纯文本写入。
          const index = driver?.getActiveIndex() ?? 0
          const step = tour.steps[index]
          popover.title.textContent = resolveGuideText(step?.title)
          popover.description.textContent = resolveGuideText(step?.description)
          popover.nextButton.textContent = msg(index === tour.steps.length - 1 ? 'guide_done' : 'guide_next')
          popover.previousButton.textContent = msg('guide_previous')
          popover.progress.textContent = uiM('guide_progress', { current: index + 1, total: tour.steps.length }, locale)
          popover.nextButton.disabled = busy
          popover.previousButton.disabled = busy || !hasPreviousStep(index)
          }
          catch {
            error = 'guide_startFailed'
            stop()
          }
        },
      })
      const started = await showStep(0)
      if (started && !signal.signal.aborted) {
        clearPending()
        targetObserver = new MutationObserver(() => {
          if (!busy && activeElement && !findTarget(tour.steps[driver?.getActiveIndex() ?? 0]!)) {
            error = 'guide_targetMissing'
            stop()
          }
        })
        targetObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true })
      }
      return started
    }
    catch {
      if (!signal.signal.aborted && run === generation) {
        navigating = false
        error = 'guide_startFailed'
        stop()
      }
      return false
    }
  }

  return {
    get tours() { return options.tours.filter(tour => !tour.enabled || tour.enabled()) },
    get articles() { return (options.articles ?? []).filter(article => !article.enabled || article.enabled()) },
    get offeredTour() { return offeredId ? tourFor(offeredId) : undefined },
    get activeTourId() { return activeTourId },
    get busy() { return busy },
    get error() { return error ? msg(error) : '' },
    get locale() { return locale },
    get pathname() { return nav.pathname },
    get helpOpen() { return helpOpen },
    get articleId() { return articleId },
    start,
    startIfNeeded(id) {
      const tour = tourFor(id)
      if (!tour || activeTourId || offeredId || typeof document === 'undefined')
        return false
      const progress = getProgress(id)
      if (progress?.version === (tour.version ?? 1)
        && (progress.status !== 'deferred' || Date.now() - progress.updatedAt < 86400000)) {
        return false
      }
      offeredId = id
      return true
    },
    defer() {
      const tour = offeredId ? tourFor(offeredId) : undefined
      if (tour)
        mark(tour, 'deferred')
      offeredId = null
    },
    dismiss() {
      const tour = offeredId ? tourFor(offeredId) : undefined
      if (tour)
        mark(tour, 'dismissed')
      offeredId = null
    },
    stop,
    reset(id) { storage.set(progressKey(id), null) },
    getProgress,
    openHelp(id) {
      stop()
      offeredId = null
      error = ''
      articleId = id ?? null
      helpOpen = true
    },
    closeHelp() { helpOpen = false },
    clearError() { error = '' },
    setLocale(value) {
      locale = value
      const tour = activeTourId ? tourFor(activeTourId) : undefined
      if (driver && tour) {
        try {
          driver.setConfig({ ...driver.getConfig(), ...translatedConfig(tour) })
          driver.drive(driver.getActiveIndex() ?? 0)
        }
        catch {
          error = 'guide_startFailed'
          stop()
        }
      }
    },
    setScope(value) {
      if (scope !== value) {
        // 首次装配 scope 时保留上一页面的待启动记录，账号切换才取消当前交互。
        if (activeTourId || offeredId || helpOpen) {
          navigating = false
          stop()
        }
        scope = value
        offeredId = null
        helpOpen = false
        error = ''
      }
    },
    handleNavigation(pathname) {
      if (!navigating && activeTourId && expectedPath && pathname !== expectedPath)
        stop()
    },
    async resume() {
      try {
        const raw = sessionStorage.getItem(pendingKey)
        if (!raw)
          return false
        clearPending()
        const pending: unknown = JSON.parse(raw)
        if (pending && typeof pending === 'object'
          && 'id' in pending && typeof pending.id === 'string'
          && 'scope' in pending && pending.scope === scope
          && 'route' in pending && pending.route === nav.pathname
          && 'createdAt' in pending && typeof pending.createdAt === 'number'
          && Date.now() - pending.createdAt < 300000) {
          return await start(pending.id)
        }
      }
      catch {
        // 过期或损坏的导航记录不阻止页面使用。
      }
      return false
    },
  }
}
