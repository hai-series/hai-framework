// @vitest-environment jsdom
import type { HaiResult } from '@h-ai/core'
import { err, ok } from '@h-ai/core'
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { createSensitiveActions } from '../src/lib/components/scenes/iam/index.js'
import SensitiveActionsHarness from './fixtures/SensitiveActionsHarness.svelte'

function setup() {
  const reauthenticate = vi.fn<(password: string, operation: string) => Promise<HaiResult<{ ticket: string }>>>(async () => ok({ ticket: 'proof' }))
  const actions = createSensitiveActions({ reauthenticate })
  actions.configure({ enabled: true, operations: ['orders.approve'] })
  return { actions, reauthenticate }
}

describe('通用敏感操作确认', () => {
  it('宿主effect更新策略不会因弹窗状态变化而取消确认，真实对话框可完成提交', async () => {
    const reauthenticate = vi.fn(async () => ok({ ticket: 'one-action-proof' }))
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(SensitiveActionsHarness, { target, props: { actions: { reauthenticate } } })
    try {
      flushSync()
      target.querySelector<HTMLButtonElement>('[data-testid="sensitive-start"]')!.click()
      flushSync()
      const form = target.querySelector<HTMLFormElement>('[data-testid="reauthentication-form"]')!
      expect(form).not.toBeNull()
      const input = form.querySelector<HTMLInputElement>('input[type=password]')!
      input.value = 'Current-password-123!'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => {
        flushSync()
        expect(target.querySelector('[data-testid="sensitive-result"]')?.textContent).toBe('one-action-proof')
      })
      expect(reauthenticate).toHaveBeenCalledWith('Current-password-123!', 'orders.approve')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('未开启或不在清单时不弹窗，也不请求密码验证', async () => {
    const { actions, reauthenticate } = setup()
    expect(await actions.authorize('orders.read')).toBeUndefined()
    actions.configure({ enabled: false, operations: ['orders.approve'] })
    expect(await actions.authorize('orders.approve')).toBeUndefined()
    expect(actions.open).toBe(false)
    expect(reauthenticate).not.toHaveBeenCalled()
  })

  it('密码错误可在同一弹窗重试，成功证明只返回给原动作', async () => {
    const { actions, reauthenticate } = setup()
    reauthenticate.mockResolvedValueOnce(err({ code: 'test:password', message: 'Incorrect password' }))
    const pending = actions.authorize('orders.approve')
    expect(actions.open).toBe(true)
    expect(await actions.authorize('orders.approve')).toBeNull()
    await actions.submit('wrong')
    expect(actions.error).toBe('Incorrect password')
    expect(actions.open).toBe(true)
    await actions.submit('correct')
    expect(await pending).toBe('proof')
    expect(reauthenticate).toHaveBeenLastCalledWith('correct', 'orders.approve')
    expect(actions.open).toBe(false)
    expect(actions.loading).toBe(false)
    await actions.submit('ignored')
    expect(reauthenticate).toHaveBeenCalledTimes(2)
  })

  it('取消不请求验证，也不放行待执行动作', async () => {
    const { actions, reauthenticate } = setup()
    const pending = actions.authorize('orders.approve')
    actions.cancel()
    expect(await pending).toBeNull()
    expect(actions.open).toBe(false)
    expect(reauthenticate).not.toHaveBeenCalled()
  })

  it('取消后的迟到响应不能放行下一次动作或覆盖其状态', async () => {
    const { actions, reauthenticate } = setup()
    let complete!: (value: HaiResult<{ ticket: string }>) => void
    reauthenticate.mockImplementationOnce(() => new Promise((resolve) => {
      complete = resolve
    }))
    const first = actions.authorize('orders.approve')
    const submitting = actions.submit('old-password')
    expect(actions.loading).toBe(true)
    actions.cancel()
    expect(await first).toBeNull()
    const second = actions.authorize('orders.approve')
    complete(ok({ ticket: 'stale-proof' }))
    await submitting
    expect(actions.open).toBe(true)
    expect(actions.loading).toBe(false)
    await actions.submit('new-password')
    expect(await second).toBe('proof')
  })

  it('提交中重复确认只发出一次验证请求', async () => {
    const { actions, reauthenticate } = setup()
    let complete!: (value: HaiResult<{ ticket: string }>) => void
    reauthenticate.mockImplementationOnce(() => new Promise((resolve) => {
      complete = resolve
    }))
    const pending = actions.authorize('orders.approve')
    const submitting = actions.submit('current-password')
    await actions.submit('duplicate')
    expect(reauthenticate).toHaveBeenCalledTimes(1)
    complete(ok({ ticket: 'only-proof' }))
    await submitting
    expect(await pending).toBe('only-proof')
  })

  it('网络失败保留弹窗供重试，显示本地化通用提示', async () => {
    const { actions, reauthenticate } = setup()
    reauthenticate.mockRejectedValueOnce(new Error('Private network details'))
    const pending = actions.authorize('orders.approve')
    await actions.submit('current-password')
    expect(actions.open).toBe(true)
    expect(actions.error).not.toBe('')
    expect(actions.error).not.toContain('Private network details')
    expect(actions.loading).toBe(false)
    actions.cancel()
    expect(await pending).toBeNull()
  })

  it('策略撤销当前操作时取消旧确认，不复用未完成授权', async () => {
    const { actions } = setup()
    const pending = actions.authorize('orders.approve')
    actions.configure({ enabled: false, operations: [] })
    expect(await pending).toBeNull()
    expect(actions.open).toBe(false)
  })

  it('数据库新增的规则由标准公开配置实时同步，失败不会静默放行', async () => {
    const reauthenticate = vi.fn(async () => ok({ ticket: 'db-proof' }))
    const publicConfig = vi.fn(async () => ok({ reauthentication: { enabled: true, operations: ['db.operation'] } }))
    const actions = createSensitiveActions({ reauthenticate, publicConfig })
    actions.configure({ enabled: true, operations: [] })
    const pending = actions.authorize('db.operation')
    await vi.waitFor(() => expect(actions.open).toBe(true))
    await actions.submit('password')
    expect(await pending).toBe('db-proof')
    publicConfig.mockResolvedValueOnce(err({ code: 'database-unavailable', message: 'Unavailable', httpStatus: 500 }))
    expect(await actions.authorize('db.operation')).toBeNull()
  })
})
