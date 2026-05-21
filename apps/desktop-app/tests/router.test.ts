import { beforeEach, describe, expect, it } from 'vitest'
import {
  createHashNavAdapter,
  currentPathname,
  currentSearch,
  installRouter,
  navigate,
} from '../src/lib/router.svelte.js'

describe('hash router', () => {
  beforeEach(() => {
    // 重置 hash 并安装监听器
    globalThis.location.hash = ''
    installRouter()
  })

  it('initial pathname defaults to "/"', () => {
    expect(currentPathname()).toBe('/')
    expect(currentSearch()).toBe('')
  })

  it('navigate updates hash and pathname', async () => {
    navigate('/dashboard')
    expect(globalThis.location.hash).toBe('#/dashboard')
    // hashchange 是同步事件
    expect(currentPathname()).toBe('/dashboard')
  })

  it('navigate preserves query string', () => {
    navigate('/users?page=2&size=20')
    expect(currentPathname()).toBe('/users')
    expect(currentSearch()).toBe('?page=2&size=20')
  })

  it('createHashNavAdapter exposes reactive pathname', () => {
    const nav = createHashNavAdapter()
    navigate('/profile')
    expect(nav.pathname).toBe('/profile')
    nav.navigate('/dashboard')
    expect(nav.pathname).toBe('/dashboard')
  })
})
