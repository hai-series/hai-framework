import type { HaiResult } from '@h-ai/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { expect, it } from 'vitest'

function unwrap<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

it('installed public APIs support streams, scopes, current authorization, templates and pagination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hai-public-capabilities-'))
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hai-public-capabilities-'))
    throw new Error('Unexpected test storage directory')
  try {
    unwrap(await crypto.init())
    unwrap(await reldb.init({ type: 'sqlite', database: ':memory:' }))
    unwrap(await cache.init({ type: 'memory' }))
    unwrap(await audit.init())
    unwrap(await iam.init({ login: { password: true, apikey: true } }))
    unwrap(await storage.init({ type: 'local', root }))
    unwrap(await reach.init({
      providers: [{ name: 'local', type: 'console' }],
      templates: [{ name: 'hello', provider: 'local', body: 'Hello {name}' }],
    }))

    async function* bytes() {
      for (let index = 0; index < 32; index++)
        yield new Uint8Array(64 * 1024).fill(index)
    }
    const checksum = unwrap(await storage.checksum.generate(bytes(), { algorithm: 'sha256' }))
    unwrap(await storage.file.put('example.bin', bytes(), { ifNoneMatch: '*' }))
    const read = unwrap(await storage.file.getStream('example.bin'))
    expect(unwrap(await storage.checksum.verify(read, checksum))).toBe(true)
    expect((await storage.file.put('example.bin', 'replacement', { ifNoneMatch: '*' })).success).toBe(false)

    const user = unwrap(await iam.user.createUser({ username: 'public-capabilities', password: 'Test123456!' })).user
    const readPermission = unwrap(await iam.authz.createPermission({ code: 'example:read', name: 'Read', type: 'api' }))
    const writePermission = unwrap(await iam.authz.createPermission({ code: 'example:write', name: 'Write', type: 'api' }))
    const role = unwrap(await iam.authz.createRole({ code: 'example-reader', name: 'Reader', permissionIds: [readPermission.id, writePermission.id] }))
    unwrap(await iam.authz.assignRole(user.id, role.id))
    const key = unwrap(await iam.apiKey.createApiKey(user.id, { name: 'read-only', scopes: ['example:read'] }))
    const login = unwrap(await iam.auth.loginWithApiKey({ key: key.rawKey }))
    expect(login.permissions).toEqual(['example:read'])
    expect(login.roles).toEqual([])
    const filtered = unwrap(await iam.user.listUsers({ roleCode: role.code, pageSize: 1 }))
    expect(filtered.total).toBe(1)
    expect(unwrap(await iam.user.getUsers([user.id, user.id]))).toHaveLength(1)
    unwrap(await iam.authz.removeRole(user.id, role.id))
    expect(unwrap(await iam.auth.verifyToken(login.tokens.accessToken)).permissions).toEqual([])
    unwrap(await iam.apiKey.revokeApiKey(key.apiKey.id))
    expect((await iam.auth.verifyToken(login.tokens.accessToken)).success).toBe(false)

    expect(unwrap(await reach.send({ to: 'test@example.invalid', template: 'hello', vars: { name: 'Tester' } })).success).toBe(true)
    expect((await reach.send({ to: 'test@example.invalid', body: 'hello' })).success).toBe(false)
    unwrap(await audit.log({ action: 'read', resource: 'example' }))
    unwrap(await audit.log({ action: 'read', resource: 'example' }))
    const page = unwrap(await audit.list({ resource: 'example', page: 2, pageSize: 1 }))
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 1 })
    expect(page.items).toHaveLength(1)
  }
  finally {
    await reach.close()
    await storage.close()
    await iam.close()
    await audit.close()
    await cache.close()
    await reldb.close()
    await crypto.close()
    await rm(root, { recursive: true, force: true })
  }
})
