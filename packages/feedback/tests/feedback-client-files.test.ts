// @vitest-environment jsdom
import { ok } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { saveCapacitorFeedbackFile } from '../src/client/feedback-client-capacitor.js'
import { saveTauriFeedbackFile } from '../src/client/feedback-client-tauri.js'
import { configureFeedbackSaving, saveFeedbackFile } from '../src/client/index.js'

const native = vi.hoisted(() => ({ save: vi.fn(), writeFile: vi.fn(), write: vi.fn(), share: vi.fn(), remove: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: native.save }))
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: native.writeFile }))
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: native.write, rmdir: native.remove } }))
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }))
afterEach(() => {
  configureFeedbackSaving(undefined)
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  Reflect.deleteProperty(window, 'Capacitor')
  vi.resetAllMocks()
})

it('tauri 取消不写文件；选择路径后才保存实际字节', async () => {
  Reflect.set(window, '__TAURI_INTERNALS__', {})
  configureFeedbackSaving(saveTauriFeedbackFile)
  native.save.mockResolvedValueOnce(null).mockResolvedValueOnce('selected/feedback.zip')
  expect(await saveFeedbackFile(new Uint8Array([1]), 'feedback.zip')).toEqual(ok({ status: 'cancelled' }))
  expect(native.writeFile).not.toHaveBeenCalled()
  expect(await saveFeedbackFile(new Uint8Array([2]), 'feedback.zip')).toEqual(ok({ status: 'saved' }))
  expect(native.writeFile).toHaveBeenCalledWith('selected/feedback.zip', new Uint8Array([2]))
})

it('capacitor 只分享缓存文件，完成和失败均清理本次临时目录', async () => {
  Reflect.set(window, 'Capacitor', { isNativePlatform: () => true })
  configureFeedbackSaving(saveCapacitorFeedbackFile)
  native.write.mockResolvedValue({ uri: 'file:///cache/feedback.zip' })
  native.remove.mockResolvedValue(undefined)
  native.share.mockResolvedValueOnce({})
  expect(await saveFeedbackFile(new Uint8Array([97]), 'feedback.zip')).toEqual(ok({ status: 'shared' }))
  expect(native.write).toHaveBeenCalledWith(expect.objectContaining({ data: 'YQ==', directory: 'CACHE' }))
  expect(native.share).toHaveBeenCalledWith({ files: ['file:///cache/feedback.zip'], dialogTitle: 'feedback.zip' })
  native.share.mockRejectedValueOnce(new Error('Native share failed'))
  expect((await saveFeedbackFile(new Uint8Array([97]), 'feedback.zip')).success).toBe(false)
  expect(native.remove).toHaveBeenCalledTimes(2)
})

it('保存对话框未完成时退出账号，迟到的选取不能继续写文件', async () => {
  Reflect.set(window, '__TAURI_INTERNALS__', {})
  configureFeedbackSaving(saveTauriFeedbackFile)
  const controller = new AbortController()
  let choose!: (path: string) => void
  native.save.mockReturnValue(new Promise<string>((resolve) => {
    choose = resolve
  }))
  const pending = saveFeedbackFile(new Uint8Array([2]), 'feedback.zip', 'application/zip', controller.signal)
  await vi.waitFor(() => expect(native.save).toHaveBeenCalledOnce())
  controller.abort()
  choose('selected/feedback.zip')
  expect(await pending).toEqual(ok({ status: 'cancelled' }))
  expect(native.writeFile).not.toHaveBeenCalled()
})
