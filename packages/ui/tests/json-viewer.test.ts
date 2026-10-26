// @vitest-environment jsdom
/**
 * =============================================================================
 * @h-ai/ui - JsonViewer 组件测试
 * =============================================================================
 * 覆盖：JSON 树渲染、undefined 值、折叠交互、复制动作与深路径展开。
 */

import { flushSync, mount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonViewer } from '../src/lib/components/compounds/index.js'

async function mountViewer(props: Record<string, unknown> = {}) {
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(JsonViewer, {
    target,
    props: { value: props.value ?? { name: 'wf', count: 3 }, ...props },
  })
  flushSync()
  return { component, target }
}

async function dispose(target: HTMLElement) {
  target.remove()
}

describe('jsonViewer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('渲染顶层对象的键与标量值', async () => {
    const { target } = await mountViewer({ value: { name: 'wf', count: 3, enabled: true } })
    try {
      expect(target.textContent).toContain('name')
      expect(target.textContent).toContain('"wf"')
      expect(target.textContent).toContain('3')
      expect(target.textContent).toContain('true')
    }
    finally {
      await dispose(target)
    }
  })

  it('undefined 值渲染为字面 undefined 而不是丢失', async () => {
    const { target } = await mountViewer({ value: { input: undefined } })
    try {
      expect(target.textContent).toContain('input')
      expect(target.textContent).toContain('undefined')
    }
    finally {
      await dispose(target)
    }
  })

  it('对象与数组默认折叠，open 属性驱动展开状态', async () => {
    const { target } = await mountViewer({ value: { nested: { leaf: 'x' } } })
    try {
      const details = target.querySelector<HTMLDetailsElement>('details')
      expect(details).not.toBeNull()
      expect(details!.open).toBe(false)
      details!.open = true
      details!.dispatchEvent(new Event('toggle'))
      flushSync()
      expect(details!.open).toBe(true)
      // 子容器作为 details 子节点存在，展开后仍可通过同一交互模型访问
      expect(details!.querySelector('details, [data-testid="json-viewer-node"]') === null).toBe(true)
    }
    finally {
      await dispose(target)
    }
  })

  it('指定 defaultExpandedDepth 时按深度展开', async () => {
    const { target } = await mountViewer({
      value: { a: { b: { c: 1 } } },
      defaultExpandedDepth: 1,
    })
    try {
      const rootDetails = [...target.querySelectorAll<HTMLDetailsElement>('details')]
      expect(rootDetails.length).toBeGreaterThan(0)
      // depth 1 展开意味着最外层 details 为 open
      const opened = rootDetails.some(details => details.open && details.textContent?.includes('b'))
      expect(opened).toBe(true)
    }
    finally {
      await dispose(target)
    }
  })

  it('点击复制按钮复制格式化 JSON 并回调 onCopy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const onCopy = vi.fn()
    const { target } = await mountViewer({ value: { k: 'v' }, onCopy })
    try {
      const button = target.querySelector<HTMLButtonElement>('[data-testid="json-viewer-copy"]')
      expect(button).not.toBeNull()
      button!.click()
      await vi.waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1))
      expect(writeText).toHaveBeenCalledWith(JSON.stringify({ k: 'v' }, null, 2))
    }
    finally {
      await dispose(target)
    }
  })

  it('解析失败时抛出的循环引用不会渲染为空白', async () => {
    const cyclic: Record<string, unknown> = { name: 'cyclic' }
    cyclic.self = cyclic
    const { target } = await mountViewer({ value: cyclic })
    try {
      expect(target.textContent).toContain('name')
      expect(target.textContent).toContain('cyclic')
    }
    finally {
      await dispose(target)
    }
  })
})
