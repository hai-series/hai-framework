// @vitest-environment jsdom
import type { CodeWorkspaceSearchPage, CodeWorkspaceSearchQuery, CodeWorkspaceSource } from '../src/lib/components/scenes/code/code-types.js'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import CodeWorkspace from '../src/lib/components/scenes/code/CodeWorkspace.svelte'
import { uiM } from '../src/lib/messages.js'

class PaginatedSource implements CodeWorkspaceSource {
  #secondPage: CodeWorkspaceSearchPage = {
    hits: [
      {
        node: { id: 'second', kind: 'file', name: 'second-result.ts' },
      },
    ],
  }

  #attempts = 0

  listChildren() {
    return []
  }

  readFile() {
    return { text: '' }
  }

  search(query: CodeWorkspaceSearchQuery): CodeWorkspaceSearchPage {
    if (query.cursor === 'page-2') {
      if (this.#attempts++ === 0)
        throw new Error('Temporary search failure')
      return this.#secondPage
    }
    return {
      hits: [
        {
          node: { id: 'first', kind: 'file', name: 'first-result.ts' },
        },
      ],
      nextCursor: 'page-2',
    }
  }
}

it('搜索分页及重试均使用同一个数据源实例和游标', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const target = document.body.appendChild(document.createElement('div'))
  const source = new PaginatedSource()
  const search = vi.spyOn(source, 'search')
  const component = mount(CodeWorkspace, {
    target,
    props: { source },
  })
  const button = (key: string) => [
    ...target.querySelectorAll('button'),
  ].find(item => item.textContent?.trim() === uiM(key))!
  try {
    flushSync()
    button('code_findFiles').click()
    flushSync()
    const query = target.querySelector<HTMLInputElement>('input[type="search"]')!
    query.value = 'result'
    query.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(target.textContent).toContain('first-result.ts'))

    button('code_more').click()
    await vi.waitFor(() => expect(target.textContent).toContain(uiM('code_searchFailed')))
    button('code_retry').click()
    await vi.waitFor(() => expect(target.textContent).toContain('second-result.ts'))
    expect(target.textContent).toContain('first-result.ts')
    expect(search.mock.calls.map(([query]) => query)).toEqual([
      { mode: 'files', query: 'result' },
      { mode: 'files', query: 'result', cursor: 'page-2' },
      { mode: 'files', query: 'result', cursor: 'page-2' },
    ])
  }
  finally {
    await unmount(component)
    target.remove()
    vi.unstubAllGlobals()
  }
})
