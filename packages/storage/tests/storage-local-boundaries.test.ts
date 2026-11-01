import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-storage-boundary-'))
  expect((await storage.init({ type: 'local', root: join(directory, 'store') })).success).toBe(true)
})
afterEach(async () => {
  await storage.close()
  await rm(directory, { recursive: true, force: true })
})

it('rejects directory links before reading, writing, copying or deleting outside the root', async () => {
  const outside = join(directory, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'private.txt'), 'private')
  await symlink(outside, join(directory, 'store/link'), process.platform === 'win32' ? 'junction' : 'dir')
  for (const result of [await storage.file.get('link/private.txt'), await storage.file.put('link/new.txt', 'new'), await storage.file.copy('link/private.txt', 'copy.txt'), await storage.dir.delete('link')]) {
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiStorageError.INVALID_PATH.code)
  }
  expect(await readFile(join(outside, 'private.txt'), 'utf8')).toBe('private')
})

it('blocks reserved suffix case variants and Windows trailing characters or alternate streams', async () => {
  expect((await storage.file.put('file.txt', 'one', { metadata: { owner: 'old' } })).success).toBe(true)
  const keys = ['file.txt.META.JSON', 'file.UPLOAD.TMP', ...(process.platform === 'win32' ? ['file.txt.meta.json.', 'file.txt.meta.json ', 'file.txt.meta.json:stream'] : [])]
  for (const key of keys) {
    for (const result of [await storage.file.get(key), await storage.file.put(key, 'overwrite'), await storage.file.delete(key)]) {
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiStorageError.INVALID_PATH.code)
    }
  }
  expect(await storage.file.head('file.txt')).toMatchObject({ success: true, data: { metadata: { owner: 'old' } } })
})

it('overwriting and copying replace stale destination metadata', async () => {
  expect((await storage.file.put('target.txt', 'one', { contentType: 'text/html', metadata: { old: 'yes' } })).success).toBe(true)
  expect((await storage.file.put('target.txt', 'two')).success).toBe(true)
  expect(await storage.file.head('target.txt')).toMatchObject({ success: true, data: { contentType: 'text/plain', metadata: undefined } })
  expect((await storage.file.put('source.txt', 'source', { contentType: 'application/json', metadata: { source: 'yes' } })).success).toBe(true)
  expect((await storage.file.copy('source.txt', 'target.txt')).success).toBe(true)
  expect(await storage.file.head('target.txt')).toMatchObject({ success: true, data: { contentType: 'application/json', metadata: { source: 'yes' } } })
})
