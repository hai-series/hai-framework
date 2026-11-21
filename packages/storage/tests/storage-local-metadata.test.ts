import type { FileHandle } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { mkdtemp, readdir, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import * as fileSystem from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    unlink: vi.fn(original.unlink),
  }
})

let root: string
beforeEach(async () => {
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(unlink).mockReset().mockImplementation(original.unlink)
  // 与 Provider 使用同一真实路径，避免 Windows 8.3 别名让故障注入漏掉目标文件。
  root = await realpath(await mkdtemp(join(tmpdir(), 'hai-storage-metadata-')))
  expect((await storage.init({ type: 'local', root })).success).toBe(true)
})
afterEach(async () => {
  await storage.close()
  await rm(root, { recursive: true, force: true })
})

it('unknown filesystem failures retain the full IO error definition and a safe public message', async () => {
  expect((await storage.file.put('report.txt', 'content')).success).toBe(true)
  const failed = vi.spyOn(fileSystem, 'stat').mockRejectedValueOnce(Object.assign(new Error('Fixture private filesystem diagnostic'), { code: 'EIO' }))
  try {
    const result = await storage.file.head('report.txt')
    expect(result).toMatchObject({ success: false, error: HaiStorageError.IO_ERROR })
    if (!result.success)
      expect(result.error.message).not.toContain('Fixture private filesystem diagnostic')
  }
  finally {
    failed.mockRestore()
  }
})

it('metadata preparation failure does not publish or overwrite content', async () => {
  await writeFile(join(root, 'report.txt'), 'legacy content')
  await writeFile(join(root, 'report.txt.meta.json'), JSON.stringify({
    contentType: 'text/plain',
    metadata: { owner: 'legacy' },
  }))
  await writeFile(join(root, '.hai-storage-meta'), 'blocked metadata directory')
  const result = await storage.file.put('report.txt', 'new content', {
    metadata: { owner: 'new' },
  })
  expect(result.success).toBe(false)
  expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('legacy content')
  expect(await readFile(join(root, 'report.txt.meta.json'), 'utf8')).toBe(JSON.stringify({
    contentType: 'text/plain',
    metadata: { owner: 'legacy' },
  }))
  expect((await storage.file.put('new.txt', 'new', { ifNoneMatch: '*' })).success).toBe(false)
  expect(await storage.file.exists('new.txt')).toEqual({ success: true, data: false })
})

it('requires the current generation record and never inherits a legacy sidecar', async () => {
  await writeFile(join(root, 'report.txt'), 'legacy')
  await writeFile(join(root, 'report.txt.meta.json'), JSON.stringify({
    contentType: 'text/html',
    metadata: { owner: 'legacy' },
  }))
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: false,
    error: { code: HaiStorageError.OPERATION_FAILED.code },
  })
  expect((await storage.file.put('report.txt', 'new')).success).toBe(true)
  // 模拟保留的旧旁车文件；新版本必须读取当前代际的显式空记录。
  await writeFile(join(root, 'report.txt.meta.json'), JSON.stringify({
    contentType: 'text/html',
    metadata: { owner: 'legacy' },
  }))
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: true,
    data: { contentType: 'text/plain', metadata: undefined },
  })
})

it.each(['{"secret":"metadata-secret-sentinel",', '{"metadata":{"secret":123}}', 'null'])('invalid records fail safely without returning their contents: %s', async (record) => {
  expect((await storage.file.put('report.txt', 'content')).success).toBe(true)
  const [name] = await readdir(join(root, '.hai-storage-meta'))
  await writeFile(join(root, '.hai-storage-meta', name!), record)
  const result = await storage.file.head('report.txt')
  expect(result).toMatchObject({
    success: false,
    error: { code: HaiStorageError.OPERATION_FAILED.code },
  })
  expect(JSON.stringify(result)).not.toContain('metadata-secret-sentinel')
})

it.each(['file.meta.json/child.txt', 'file.upload.tmp/child.txt', '.hai-storage-meta/child.txt'])('rejects internal metadata namespaces in every path segment: %s', async (key) => {
  for (const result of [await storage.file.put(key, 'blocked'), await storage.file.get(key), await storage.dir.delete(key)]) {
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiStorageError.INVALID_PATH.code)
  }
})

it.each([false, true])('concurrent writes keep content and metadata together without rolling back another writer (conditional=%s)', async (conditional) => {
  let release: () => void = () => {}
  let started: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const writingStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  async function* delayed() {
    started()
    await pending
    yield new TextEncoder().encode('first')
  }
  const first = storage.file.put('shared.txt', delayed(), {
    metadata: { writer: 'first' },
    ...(conditional
      ? { ifNoneMatch: '*' as const }
      : {}),
  })
  await writingStarted
  try {
    expect((await storage.file.put('shared.txt', 'second', {
      metadata: { writer: 'second' },
    })).success).toBe(true)
  }
  finally {
    release()
  }
  const result = await first
  expect(result.success).toBe(!conditional)
  if (!result.success)
    expect(result.error.code).toBe(HaiStorageError.ALREADY_EXISTS.code)
  const expected = conditional ? 'second' : 'first'
  const content = await storage.file.get('shared.txt')
  expect(content.success).toBe(true)
  if (content.success)
    expect(content.data.toString()).toBe(expected)
  expect(await storage.file.head('shared.txt')).toMatchObject({
    success: true,
    data: {
      metadata: { writer: expected },
    },
  })
  expect(await storage.dir.list()).toMatchObject({
    success: true,
    data: {
      files: [
        { key: 'shared.txt' },
      ],
    },
  })
})

it('copies metadata and bytes from the same source version during an overwrite', async () => {
  expect(await storage.file.put('source.txt', 'first', {
    contentType: 'text/plain',
    metadata: { writer: 'first' },
  })).toMatchObject({ success: true })

  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const metadataRead = Promise.withResolvers<void>()
  const continueCopy = Promise.withResolvers<void>()
  const read = vi.spyOn(fileSystem, 'readFile').mockImplementationOnce(async (...args) => {
    const record = await original.readFile(...args)
    metadataRead.resolve()
    await continueCopy.promise
    return record
  })

  const copying = storage.file.copy('source.txt', 'copy.txt')
  try {
    await expect(Promise.race([
      metadataRead.promise.then(() => 'metadata-read'),
      copying.then(() => 'finished'),
    ])).resolves.toBe('metadata-read')
    expect(await storage.file.put('source.txt', '{"writer":"second"}', {
      contentType: 'application/json',
      metadata: { writer: 'second' },
    })).toMatchObject({ success: true })
  }
  finally {
    continueCopy.resolve()
    read.mockRestore()
    await copying
  }

  expect(await copying).toMatchObject({
    success: true,
    data: { key: 'copy.txt', size: 5 },
  })
  expect(await storage.file.get('copy.txt')).toEqual({
    success: true,
    data: Buffer.from('first'),
  })
  expect(await storage.file.head('copy.txt')).toMatchObject({
    success: true,
    data: {
      contentType: 'text/plain',
      metadata: { writer: 'first' },
    },
  })
})

it('reads the opened generation after a concurrent overwrite replaces the key', async () => {
  expect((await storage.file.put('shared.txt', 'first', {
    contentType: 'text/plain',
    metadata: { writer: 'first' },
  })).success).toBe(true)

  const opened = await storage.file.getStreamWithMetadata('shared.txt')
  if (!opened.success)
    throw new Error(opened.error.message)
  try {
    expect((await readdir(root)).some(name => name.endsWith('.upload.tmp'))).toBe(false)
    expect((await storage.file.put('shared.txt', '{"writer":"second"}', {
      contentType: 'application/json',
      metadata: { writer: 'second' },
    })).success).toBe(true)
    const chunks: Uint8Array[] = []
    for await (const chunk of opened.data.stream)
      chunks.push(chunk)
    expect(Buffer.concat(chunks)).toEqual(Buffer.from('first'))
    expect(opened.data.metadata).toMatchObject({
      size: 5,
      contentType: 'text/plain',
      metadata: { writer: 'first' },
    })
  }
  finally {
    await opened.data.close()
  }
})

it('keeps an actively consumed ordinary stream on its original bytes during an overwrite', async () => {
  const original = Buffer.alloc(256 * 1024, 'a')
  expect((await storage.file.put('shared.bin', original)).success).toBe(true)
  const opened = await storage.file.getStream('shared.bin', { rangeStart: 1, rangeEnd: original.length - 2 })
  if (!opened.success)
    throw new Error(opened.error.message)
  const iterator = opened.data[Symbol.asyncIterator]()
  const chunks: Uint8Array[] = []
  try {
    const first = await iterator.next()
    expect(first.done).toBe(false)
    if (!first.done)
      chunks.push(first.value)
    expect((await storage.file.put('shared.bin', 'replacement')).success).toBe(true)
    for (let next = await iterator.next(); !next.done; next = await iterator.next())
      chunks.push(next.value)
    expect(Buffer.concat(chunks)).toEqual(original.subarray(1, -1))
    expect(await storage.file.get('shared.bin')).toEqual({
      success: true,
      data: Buffer.from('replacement'),
    })
  }
  finally {
    await iterator.return?.()
  }
})

it.each(['return', 'abort'] as const)('releases an active ordinary stream when the consumer chooses %s', async (operation) => {
  expect((await storage.file.put('report.bin', Buffer.alloc(256 * 1024))).success).toBe(true)
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handles: FileHandle[] = []
  const open = vi.spyOn(fileSystem, 'open').mockImplementationOnce(async (...args) => {
    const handle = await original.open(...args)
    handles.push(handle)
    return handle
  })
  const controller = new AbortController()
  const opened = await storage.file.getStream('report.bin', { signal: controller.signal })
  if (!opened.success)
    throw new Error(opened.error.message)
  const iterator = opened.data[Symbol.asyncIterator]()
  try {
    expect((await iterator.next()).done).toBe(false)
    expect(handles).toHaveLength(1)
    if (operation === 'abort') {
      controller.abort()
      await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
    }
    else {
      await iterator.return?.()
    }
    expect(handles[0]?.fd).toBe(-1)
    expect((await readdir(root)).some(name => name.endsWith('.upload.tmp'))).toBe(false)
  }
  finally {
    await iterator.return?.()
    open.mockRestore()
  }
})

it.each(['close', 'abort'] as const)('releases an opened file before the first read (%s)', async (operation) => {
  expect((await storage.file.put('report.txt', 'content')).success).toBe(true)
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handles: FileHandle[] = []
  const open = vi.spyOn(fileSystem, 'open').mockImplementationOnce(async (...args) => {
    const handle = await original.open(...args)
    handles.push(handle)
    return handle
  })
  const controller = new AbortController()
  try {
    const opened = await storage.file.getStreamWithMetadata('report.txt', { signal: controller.signal })
    if (!opened.success)
      throw new Error(opened.error.message)
    try {
      expect(handles).toHaveLength(1)
      expect(handles[0]?.fd).toBeGreaterThanOrEqual(0)
      if (operation === 'abort') {
        controller.abort()
        await expect(opened.data.stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({ name: 'AbortError' })
      }
      else {
        await opened.data.close()
      }
      expect(handles[0]?.fd).toBe(-1)
    }
    finally {
      await opened.data.close()
    }
  }
  finally {
    open.mockRestore()
  }
})

it.skipIf(process.platform !== 'win32').each(['open', 'unlink'] as const)('cleans the Windows read link and handle when %s fails', async (operation) => {
  expect((await storage.file.put('report.txt', 'content')).success).toBe(true)
  const before = (await readdir(root, { recursive: true })).sort()
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handles: FileHandle[] = []
  const failure = Object.assign(new Error('Fixture read preparation denied'), { code: 'EACCES' })
  const open = vi.spyOn(fileSystem, 'open').mockImplementationOnce(async (...args) => {
    if (operation === 'open')
      throw failure
    const handle = await original.open(...args)
    handles.push(handle)
    return handle
  })
  if (operation === 'unlink')
    vi.mocked(unlink).mockRejectedValueOnce(failure)
  try {
    expect(await storage.file.getStreamWithMetadata('report.txt')).toMatchObject({
      success: false,
      error: { code: HaiStorageError.PERMISSION_DENIED.code },
    })
    expect(handles.every(handle => handle.fd === -1)).toBe(true)
    expect((await readdir(root, { recursive: true })).sort()).toEqual(before)
    expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('content')
  }
  finally {
    open.mockRestore()
  }
})

it('closes the source when its generation metadata is missing', async () => {
  await writeFile(join(root, 'report.txt'), 'legacy content')
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handles: FileHandle[] = []
  const open = vi.spyOn(fileSystem, 'open').mockImplementationOnce(async (...args) => {
    const handle = await original.open(...args)
    handles.push(handle)
    return handle
  })
  try {
    expect(await storage.file.getStreamWithMetadata('report.txt')).toMatchObject({
      success: false,
      error: { code: HaiStorageError.OPERATION_FAILED.code },
    })
    expect(handles).toHaveLength(1)
    expect(handles[0]?.fd).toBe(-1)
  }
  finally {
    open.mockRestore()
  }
})

it('cancelled preparation preserves the previous generation and removes only the current temporary files', async () => {
  expect((await storage.file.put('report.txt', 'previous', {
    metadata: { writer: 'previous' },
  })).success).toBe(true)
  const before = (await readdir(root, { recursive: true })).sort()
  const controller = new AbortController()
  async function* cancelled() {
    controller.abort()
    yield new TextEncoder().encode('cancelled')
  }
  const result = await storage.file.put('report.txt', cancelled(), {
    signal: controller.signal,
    metadata: { writer: 'cancelled' },
  })
  expect(result.success).toBe(false)
  expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('previous')
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: true,
    data: {
      metadata: { writer: 'previous' },
    },
  })
  expect((await readdir(root, { recursive: true })).sort()).toEqual(before)
})

it('a failed cleanup of an observed old generation cannot turn a committed write into failure', async () => {
  expect((await storage.file.put('report.txt', 'old', {
    metadata: { writer: 'old' },
  })).success).toBe(true)
  const oldRecords = await readdir(join(root, '.hai-storage-meta'))
  expect(oldRecords).toHaveLength(1)
  const oldRecord = join(root, '.hai-storage-meta', oldRecords[0]!)
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(unlink).mockImplementation(async (path) => {
    if (String(path) === oldRecord)
      throw Object.assign(new Error('Fixture cleanup denied'), { code: 'EACCES' })
    return original.unlink(path)
  })
  expect((await storage.file.put('report.txt', 'new', {
    metadata: { writer: 'new' },
  })).success).toBe(true)
  expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('new')
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: true,
    data: {
      metadata: { writer: 'new' },
    },
  })
  expect((await readdir(join(root, '.hai-storage-meta')))).toContain(oldRecords[0])
})
