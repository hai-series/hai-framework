// @vitest-environment jsdom
import type { GuideController, GuideOptions } from '../src/lib/guide.js'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGuide, GuideHost, HelpCenter } from '../src/lib/guide.js'

const controllers: GuideController[] = []
function makeGuide(options: Partial<GuideOptions> = {}) {
  const guide = createGuide({
    persistence: 'memory',
    tours: [{
      id: 'intro',
      title: 'Introduction',
      description: 'A short tour',
      steps: [{ target: 'first', title: 'First step', description: 'Use this button' }],
    }],
    ...options,
  })
  controllers.push(guide)
  return guide
}
function target(id = 'first') {
  const element = document.createElement('button')
  element.dataset.guide = id
  document.body.append(element)
  return element
}
async function finish() {
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  await vi.waitFor(() => expect(document.querySelector('.driver-popover')).toBeNull())
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() => {
    const rect = new DOMRect(40, 40, 100, 40)
    return {
      0: rect,
      length: 1,
      item: () => rect,
      * [Symbol.iterator]() {
        yield rect
      },
    }
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 40, 100, 40))
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(() => {
  controllers.splice(0).forEach(guide => guide.stop())
  document.body.innerHTML = ''
  for (const cookie of document.cookie.split(';'))
    document.cookie = `${cookie.split('=')[0]!.trim()}=; Path=/; Max-Age=0`
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('guide first-use preferences', () => {
  it('完成后 Cookie 跨实例保留，手动重看始终可用', async () => {
    target()
    const options = { persistence: 'cookie' as const, persistKey: 'guide-test' }
    const guide = makeGuide(options)
    guide.setScope('alice')
    expect(guide.startIfNeeded('intro')).toBe(true)
    expect(await guide.start('intro')).toBe(true)
    await finish()
    expect(guide.getProgress('intro')?.status).toBe('completed')
    const restored = makeGuide(options)
    restored.setScope('alice')
    expect(restored.startIfNeeded('intro')).toBe(false)
    expect(await restored.start('intro')).toBe(true)
    restored.stop()
    expect(restored.getProgress('intro')?.status).toBe('completed')
  })

  it('不再提醒按账号和版本隔离，重置后重新提示', () => {
    const guide = makeGuide({ persistence: 'localStorage' })
    guide.setScope('alice')
    guide.startIfNeeded('intro')
    guide.dismiss()
    expect(guide.startIfNeeded('intro')).toBe(false)
    guide.setScope('bob')
    expect(guide.startIfNeeded('intro')).toBe(true)
    guide.setScope('alice')
    expect(guide.startIfNeeded('intro')).toBe(false)
    const updated = makeGuide({ persistence: 'localStorage', tours: [{ id: 'intro', version: 2, title: 'Updated', steps: [] }] })
    updated.setScope('alice')
    expect(updated.startIfNeeded('intro')).toBe(true)
    guide.reset('intro')
    expect(guide.startIfNeeded('intro')).toBe(true)
  })

  it('稍后提醒暂缓一天，受限存储保留会话内偏好', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100000)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage disabled')
    })
    const guide = makeGuide({ persistence: 'localStorage' })
    expect(guide.startIfNeeded('intro')).toBe(true)
    guide.defer()
    expect(guide.startIfNeeded('intro')).toBe(false)
    now.mockReturnValue(100000 + 86400000)
    expect(guide.startIfNeeded('intro')).toBe(true)
  })
})

describe('guide tour behavior', () => {
  it.each(['keyboard', 'button', 'overlay'] as const)('首帧定位未完成时通过 %s 退出也会终止等待并释放忙碌状态', async (source) => {
    target()
    // 只执行动画首帧，覆盖浮层已可关闭而高亮尚未完成的窗口。
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    const guide = makeGuide()
    const pending = guide.start('intro')
    await vi.waitFor(() => expect(document.querySelector('.driver-popover')).not.toBeNull())
    frame?.(0)
    expect(guide.busy).toBe(true)
    if (source === 'keyboard')
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
    else if (source === 'button')
      document.querySelector<HTMLButtonElement>('.driver-popover-close-btn')!.click()
    else
      document.querySelector('.driver-overlay path')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(guide.busy).toBe(false)
    expect(guide.activeTourId).toBeNull()
    expect(await pending).toBe(false)
    expect(document.querySelector('.driver-popover')).toBeNull()
    expect(document.querySelector('.driver-overlay')).toBeNull()
    expect(guide.getProgress('intro')).toBeNull()
    expect(guide.error).toBe('')
  })

  it('目标卸载后立即点击完成也不会写入完成记录', async () => {
    const element = target()
    const guide = makeGuide()
    await guide.start('intro')
    element.remove()
    await finish()
    expect(guide.getProgress('intro')).toBeNull()
    expect(guide.error).toBeTruthy()
  })

  it('目标页面首次装配用户范围时保留并恢复完整导航的待启动记录', async () => {
    target()
    const guide = makeGuide({ nav: { pathname: '/new', navigate: () => {} } })
    sessionStorage.setItem('hai-guide-pending', JSON.stringify({ id: 'intro', scope: 'alice', route: '/new', createdAt: Date.now() }))
    guide.setScope('alice')
    expect(await guide.resume()).toBe(true)
    expect(guide.activeTourId).toBe('intro')
    expect(sessionStorage.length).toBe(0)
  })

  it('先导航再等待异步元素，不提前高亮旧页面', async () => {
    let pathname = '/old'
    const guide = makeGuide({
      nav: {
        get pathname() { return pathname },
        navigate: async () => {
          pathname = '/new'
          setTimeout(target, 20)
        },
      },
      tours: [{ id: 'intro', title: 'Tour', route: '/new', steps: [{ target: 'first', title: 'Loaded', description: 'Ready' }] }],
    })
    expect(await guide.start('intro')).toBe(true)
    expect(pathname).toBe('/new')
    expect(document.querySelector('.driver-active-element')?.getAttribute('data-guide')).toBe('first')
    expect(sessionStorage.length).toBe(0)
  })

  it('必要元素缺失不误记完成，可选元素跳过', async () => {
    target()
    const guide = makeGuide({ waitTimeout: 10, tours: [{
      id: 'intro',
      title: 'Tour',
      steps: [
        { target: 'missing', title: 'Optional', description: '', optional: true },
        { target: 'first', title: 'Required', description: '' },
      ],
    }] })
    expect(await guide.start('intro')).toBe(true)
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Required')
    expect(document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')?.disabled).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }))
    expect(guide.activeTourId).toBe('intro')
    expect(guide.error).toBe('')
    await finish()
    expect(guide.getProgress('intro')?.status).toBe('completed')
    const broken = makeGuide({ waitTimeout: 10 })
    document.querySelector('[data-guide]')!.remove()
    expect(await broken.start('intro')).toBe(false)
    expect(broken.error).toBeTruthy()
    expect(broken.getProgress('intro')).toBeNull()
  })

  it('退出、路由变化和目标卸载都会清理遮罩且不标记完成', async () => {
    const element = target()
    const guide = makeGuide({ nav: { pathname: '/current', navigate: () => {} } })
    await guide.start('intro')
    guide.handleNavigation('/other')
    expect(document.querySelector('.driver-overlay')).toBeNull()
    expect(guide.getProgress('intro')).toBeNull()
    await guide.start('intro')
    element.remove()
    await vi.waitFor(() => expect(guide.activeTourId).toBeNull())
    expect(guide.error).toBeTruthy()
    expect(guide.getProgress('intro')).toBeNull()
  })

  it('取消等待或开始另一导览后，旧的异步结果不会重新打开浮层', async () => {
    target('second')
    const guide = makeGuide({ waitTimeout: 10000, tours: [
      { id: 'intro', title: 'Tour', steps: [{ target: 'missing', title: '', description: '' }] },
      { id: 'second', title: 'Second', steps: [{ target: 'second', title: 'Second step', description: '' }] },
    ] })
    const pending = guide.start('intro')
    await vi.waitFor(() => expect(guide.activeTourId).toBe('intro'))
    expect(await guide.start('second')).toBe(true)
    expect(await pending).toBe(false)
    expect(guide.activeTourId).toBe('second')
    guide.stop()
    expect(document.querySelector('.driver-overlay')).toBeNull()
  })

  it('步骤准备钩子在高亮前执行，按键导航经过相同等待流程', async () => {
    target()
    const before = vi.fn(() => {
      target('second')
    })
    const guide = makeGuide({ tours: [{ id: 'intro', title: 'Tour', steps: [
      { target: 'first', title: 'First', description: '' },
      { target: 'second', title: 'Second', description: '', before },
    ] }] })
    await guide.start('intro')
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Second'))
    expect(before).toHaveBeenCalledOnce()
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
    expect(guide.getProgress('intro')).toBeNull()
    expect(document.querySelector('.driver-overlay')).toBeNull()
  })

  it('业务翻译按纯文本显示，切换语言即时刷新按钮和当前步骤', async () => {
    target()
    let language = 'zh'
    const guide = makeGuide({ tours: [{ id: 'intro', title: 'Tour', steps: [{
      target: 'first',
      title: () => language === 'zh' ? '<img src=x onerror=alert(1)>' : 'English title',
      description: () => language === 'zh' ? '中文说明' : 'English description',
    }] }] })
    await guide.start('intro')
    expect(document.querySelector('.driver-popover-title img')).toBeNull()
    expect(document.querySelector('.driver-popover-title')?.textContent).toContain('<img')
    language = 'en'
    guide.setLocale('en-US')
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('English title')
    expect(document.querySelector('.driver-popover-next-btn')?.textContent).toBe('Done')
    expect(document.querySelector('.driver-popover-progress-text')?.textContent).toBe('Step 1 of 1')
  })

  it('权限不可用的导览和文章不会出现在帮助中心', async () => {
    const guide = makeGuide({
      tours: [{ id: 'admin', title: 'Admin', enabled: () => false, steps: [] }],
      articles: [{ id: 'private', title: 'Private', content: '', enabled: () => false }],
    })
    expect(guide.tours).toEqual([])
    expect(guide.articles).toEqual([])
    expect(guide.startIfNeeded('admin')).toBe(false)
    expect(await guide.start('admin')).toBe(false)
  })
})

describe('guide Svelte integration', () => {
  it('帮助中心搜索正文、展示空状态并启动关联导览', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const onstart = vi.fn()
    const component = mount(HelpCenter, { target: root, props: {
      'locale': 'en-US',
      'data-tracking': 'help',
      'articles': [{ id: 'profile', title: 'Profile', content: 'Update your avatar', tourId: 'profile' }],
      'tours': [{ id: 'profile', title: 'Profile tour', steps: [] }],
      onstart,
    } })
    try {
      flushSync()
      expect(root.querySelector('[data-tracking="help"]')).not.toBeNull()
      root.querySelector<HTMLButtonElement>('[data-testid="guide-article-start"]')!.click()
      expect(onstart).toHaveBeenCalledWith('profile')
      const input = root.querySelector('input')!
      input.value = 'avatar'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      expect(root.textContent).toContain('Profile')
      input.value = 'unknown topic'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      expect(root.textContent).toContain('No matching help content')
    }
    finally {
      await unmount(component)
    }
  })

  it('guideHost 首次提示不抢焦点，卸载后终止未完成的导览', async () => {
    const button = target()
    button.focus()
    const root = document.createElement('div')
    document.body.append(root)
    const guide = makeGuide()
    const component = mount(GuideHost, { target: root, props: { guide, 'autoStart': 'intro', 'scope': 'alice', 'locale': 'en-US', 'data-tracking': 'guide' } })
    flushSync()
    await vi.waitFor(() => expect(root.querySelector('[data-testid="guide-offer"]')).not.toBeNull())
    expect(root.querySelector('[data-tracking="guide"]')).not.toBeNull()
    expect(document.activeElement).toBe(button)
    await guide.start('intro')
    await unmount(component)
    expect(guide.activeTourId).toBeNull()
    expect(document.querySelector('.driver-overlay')).toBeNull()
    expect(guide.getProgress('intro')).toBeNull()
  })
})
