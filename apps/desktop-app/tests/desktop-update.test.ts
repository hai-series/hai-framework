import type { DownloadEvent } from '@tauri-apps/plugin-updater'
import { getVersion } from '@tauri-apps/api/app'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Update } from '@tauri-apps/plugin-updater'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopUpdate } from '../../../packages/cli/templates/shared/desktop-update/desktop-update.svelte.js'

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}))
vi.mock(import('@tauri-apps/api/core'), async importOriginal => ({
  ...await importOriginal(),
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))
function available(body: string | null = 'Release notes') {
  return {
    status: 'available',
    update: {
      rid: 7,
      version: '1.3.0',
      currentVersion: '1.2.0',
      body,
      rawJson: {},
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isTauri).mockReturnValue(true)
  vi.mocked(getVersion).mockResolvedValue('1.2.0')
  vi.mocked(invoke).mockResolvedValue(true)
})

afterEach(() => vi.restoreAllMocks())

describe('桌面应用更新', () => {
  it('浏览器预览与未配置的安装包均不发起更新请求', async () => {
    vi.mocked(isTauri).mockReturnValueOnce(false)
    const browser = new DesktopUpdate()
    await browser.initialize()
    expect(browser.version).toBe('')
    expect(getVersion).not.toHaveBeenCalled()

    vi.mocked(invoke).mockResolvedValueOnce(false)
    const native = new DesktopUpdate()
    await native.initialize()
    await native.check()
    expect(native.version).toBe('1.2.0')
    expect(native.enabled).toBe(false)
    expect(invoke).not.toHaveBeenCalledWith('desktop_update_check')
  })

  it('区分最新版、当前平台缺包和请求失败', async () => {
    const updater = new DesktopUpdate()
    await updater.initialize()
    vi.mocked(invoke)
      .mockResolvedValueOnce({ status: 'current' })
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockRejectedValueOnce(new Error('Network unavailable'))
    for (const status of ['current', 'unavailable', 'check-failed']) {
      await updater.check()
      expect(updater.status).toBe(status)
    }
  })

  it('仅在明确安装时下载安装，重复操作共享同一个安装流程', async () => {
    const updater = new DesktopUpdate()
    const close = vi.spyOn(Update.prototype, 'close').mockResolvedValue()
    const download = vi.spyOn(Update.prototype, 'downloadAndInstall').mockImplementation(async function (this: Update, onEvent?: (event: DownloadEvent) => void) {
      expect(this.rid).toBe(7)
      onEvent?.({
        event: 'Started',
        data: { contentLength: 8 },
      })
      onEvent?.({
        event: 'Progress',
        data: { chunkLength: 3 },
      })
      expect(updater.percent).toBe(37)
      onEvent?.({ event: 'Finished' })
      expect(updater.status).toBe('installing')
    })
    await updater.initialize()
    vi.mocked(invoke).mockResolvedValueOnce(available())
    await updater.check()
    expect(updater.status).toBe('available')
    expect(updater.latestVersion).toBe('1.3.0')
    expect(updater.notes).toBe('Release notes')
    expect(download).not.toHaveBeenCalled()

    await Promise.all([
      updater.install(),
      updater.install(),
    ])
    expect(updater.status).toBe('installed')
    expect(download).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('检查和验签失败后均可重试，并回收失败的安装资源', async () => {
    const close = vi.spyOn(Update.prototype, 'close').mockResolvedValue()
    vi.spyOn(Update.prototype, 'downloadAndInstall').mockRejectedValueOnce(new Error('Invalid signature'))
    const updater = new DesktopUpdate()
    await updater.initialize()
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error('Insecure download transport'))
      .mockResolvedValueOnce(available(null))
      .mockResolvedValueOnce({ status: 'current' })
    await updater.check()
    expect(updater.status).toBe('check-failed')
    expect(close).not.toHaveBeenCalled()
    await updater.check()
    expect(updater.notes).toBe('')
    await updater.install()
    expect(updater.status).toBe('install-failed')
    expect(close).toHaveBeenCalledOnce()
    await updater.check()
    expect(updater.status).toBe('current')
  })

  it('销毁视图后回收迟到的更新资源', async () => {
    const close = vi.spyOn(Update.prototype, 'close').mockResolvedValue()
    const updater = new DesktopUpdate()
    await updater.initialize()
    let reply!: (result: ReturnType<typeof available>) => void
    vi.mocked(invoke).mockReturnValueOnce(new Promise<ReturnType<typeof available>>((resolve) => {
      reply = resolve
    }))
    const checking = updater.check()
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('desktop_update_check'))
    updater.dispose()
    reply(available())
    await checking
    expect(close).toHaveBeenCalledOnce()
    expect(updater.status).not.toBe('available')
  })
})
