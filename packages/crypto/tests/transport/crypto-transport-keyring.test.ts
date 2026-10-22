import type { EncryptedRequestPayload, TransportEncryptionManager, TransportServerKeyRing } from '../../src/index.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReldbTransportKeyStore, crypto, HaiCryptoError, parseTransportServerKeyRing } from '../../src/index.js'

function createKeyRing(): TransportServerKeyRing {
  const key = crypto.asymmetric.generateKeyPair()
  if (!key.success)
    throw new Error(key.error.message)
  return { activeKeyId: 'v1', keys: { v1: key.data } }
}

function createManager(serverKeyRing: TransportServerKeyRing): TransportEncryptionManager {
  const server = crypto.transport.createServer({ serverKeyRing, keyStore: createReldbTransportKeyStore({ reldb }) })
  if (!server.success)
    throw new Error(server.error.message)
  return server.data
}

function encryptRequest(manager: TransportEncryptionManager, text: string): EncryptedRequestPayload {
  const key = crypto.symmetric.generateKey()
  const encryptedKey = crypto.asymmetric.encrypt(key, manager.getServerPublicKey())
  const encrypted = crypto.symmetric.encryptWithIV(text, key)
  if (!encrypted.success || !encryptedKey.success)
    throw new Error('Failed to prepare request')
  return { serverKeyId: manager.getServerKeyId(), encryptedKey: encryptedKey.data, ciphertext: encrypted.data.ciphertext, iv: encrypted.data.iv }
}

describe('managed transport server key ring', () => {
  let directory: string | undefined
  let database: string

  beforeEach(async () => {
    expect((await crypto.init()).success).toBe(true)
    directory = await mkdtemp(join(tmpdir(), 'hai-crypto-keyring-'))
    database = join(directory, 'registry.db')
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
  })

  afterEach(async () => {
    await reldb.close()
    await crypto.close()
    if (directory) {
      const target = resolve(directory)
      if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hai-crypto-keyring-'))
        throw new Error('Unexpected transport key ring test cleanup directory')
      await rm(target, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('a 协商、B 解密，共享持久 registry 在管理器和数据库重启后继续工作', async () => {
    const ring = createKeyRing()
    const nodeA = createManager(ring)
    const nodeB = createManager(ring)
    const client = crypto.asymmetric.generateKeyPair()
    if (!client.success)
      throw new Error(client.error.message)
    const clientId = await nodeA.registerClientKey(client.data.publicKey)
    const request = encryptRequest(nodeA, '{"message":"跨节点"}')
    expect(await nodeB.getClientPublicKey(clientId)).toBe(client.data.publicKey)
    expect(nodeB.decryptRequest(request)).toMatchObject({ success: true, data: '{"message":"跨节点"}' })
    await nodeA.close()
    await nodeB.close()
    await reldb.close()
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    const restarted = createManager(ring)
    expect(await restarted.getClientPublicKey(clientId)).toBe(client.data.publicKey)
    expect(restarted.decryptRequest(request)).toMatchObject({ success: true, data: '{"message":"跨节点"}' })
    const response = await restarted.encryptResponse(clientId, 'response')
    expect(response.success).toBe(true)
    if (!response.success)
      return
    const responseKey = crypto.asymmetric.decrypt(response.data.encryptedKey, client.data.privateKey)
    if (!responseKey.success)
      throw new Error(responseKey.error.message)
    expect(crypto.symmetric.decryptWithIV(response.data.ciphertext, responseKey.data, response.data.iv)).toMatchObject({ success: true, data: 'response' })
  })

  it('分阶段轮换允许新旧协商跨节点解密，删除旧 ID 后立即拒绝旧请求', () => {
    const old = createKeyRing()
    const next = createKeyRing()
    const keys = { v1: old.keys.v1!, v2: next.keys.v1! }
    const original = createManager(old)
    const staged = createManager({ activeKeyId: 'v1', keys })
    const rotated = createManager({ activeKeyId: 'v2', keys })
    const oldRequest = encryptRequest(original, 'old-client')
    const newRequest = encryptRequest(rotated, 'new-client')
    expect(staged.getServerKeyId()).toBe('v1')
    expect(rotated.getServerKeyId()).toBe('v2')
    expect(staged.decryptRequest(newRequest)).toMatchObject({ success: true, data: 'new-client' })
    expect(rotated.decryptRequest(oldRequest)).toMatchObject({ success: true, data: 'old-client' })
    const revoked = createManager({ activeKeyId: 'v2', keys: { v2: keys.v2 } })
    expect(revoked.decryptRequest(oldRequest)).toMatchObject({ success: false, error: { code: HaiCryptoError.INVALID_KEY.code } })
    expect(revoked.decryptRequest(newRequest)).toMatchObject({ success: true, data: 'new-client' })
    expect(rotated.decryptRequest({ ...newRequest, serverKeyId: 'unknown' }).success).toBe(false)
    expect(rotated.decryptRequest({ ...newRequest, serverKeyId: 'v1' }).success).toBe(false)
  })

  it('版本化客户端协商字段会绑定每次请求，无需节点亲和', async () => {
    const ring = createKeyRing()
    const handshakeNode = createManager(ring)
    const businessNode = createManager(ring)
    const client = crypto.transport.createClient({
      keyExchangeUrl: 'https://example.test/exchange',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        if (request.url.endsWith('/exchange')) {
          const body = await request.json() as { clientPublicKey: string }
          return Response.json({ serverKeyId: handshakeNode.getServerKeyId(), serverPublicKey: handshakeNode.getServerPublicKey(), clientId: await handshakeNode.registerClientKey(body.clientPublicKey) })
        }
        const payload = await request.json() as EncryptedRequestPayload
        expect(payload.serverKeyId).toBe('v1')
        const plaintext = businessNode.decryptRequest(payload)
        if (!plaintext.success)
          throw new Error(plaintext.error.message)
        const encrypted = await businessNode.encryptResponse(request.headers.get('X-Client-Id')!, plaintext.data)
        if (!encrypted.success)
          throw new Error(encrypted.error.message)
        return Response.json(encrypted.data, { headers: { 'X-Encrypted': 'true' } })
      },
    })
    expect(await (await client.encryptedFetch('https://example.test/business', { method: 'POST', body: '"value"' })).json()).toBe('value')
  })

  it('拒绝缺失、错配与无有效 active 版本的 ring，不隐式生成服务端密钥或泄漏 Secret', () => {
    const first = createKeyRing()
    const second = createKeyRing()
    const generate = vi.spyOn(crypto.asymmetric, 'generateKeyPair')
    // @ts-expect-error 验证非 TypeScript 调用方遗漏必填 registry 时不会隐式创建内存存储。
    expect(crypto.transport.createServer({ serverKeyRing: first }).success).toBe(false)
    // @ts-expect-error 验证非 TypeScript 调用方遗漏必填 ring 时不会隐式生成密钥。
    expect(crypto.transport.createServer({ keyStore: createReldbTransportKeyStore({ reldb }) }).success).toBe(false)
    expect(parseTransportServerKeyRing(undefined).success).toBe(false)
    expect(parseTransportServerKeyRing({ activeKeyId: 'missing', keys: first.keys }).success).toBe(false)
    const malformed = parseTransportServerKeyRing(`{"privateKey":"${first.keys.v1!.privateKey}"`)
    expect(malformed.success).toBe(false)
    expect(JSON.stringify(malformed)).not.toContain(first.keys.v1!.privateKey)
    const mismatched = crypto.transport.createServer({ keyStore: createReldbTransportKeyStore({ reldb }), serverKeyRing: { activeKeyId: 'v1', keys: { v1: { publicKey: first.keys.v1!.publicKey, privateKey: second.keys.v1!.privateKey } } } })
    expect(mismatched.success).toBe(false)
    expect(JSON.stringify(mismatched)).not.toContain(second.keys.v1!.privateKey)
    expect(generate).not.toHaveBeenCalled()
    generate.mockRestore()
  })

  it('管理器捕获密钥环快照，调用方修改原始对象不能隐式轮换', () => {
    const original = createKeyRing()
    const mutable = { activeKeyId: 'v1', keys: { v1: { ...original.keys.v1! } } }
    const manager = createManager(mutable)
    const request = encryptRequest(manager, 'kept')
    mutable.activeKeyId = 'changed'
    mutable.keys.v1.privateKey = 'invalid'
    expect(manager.getServerKeyId()).toBe('v1')
    expect(manager.decryptRequest(request)).toMatchObject({ success: true, data: 'kept' })
    expect(parseTransportServerKeyRing(JSON.stringify(original))).toMatchObject({ success: true, data: original })
  })

  it('真实共享 registry 故障时 encryptResponse 返回 HaiResult，注册按显式契约 reject', async () => {
    const ring = createKeyRing()
    const manager = createManager(ring)
    await reldb.close()
    const encrypted = await manager.encryptResponse('client-id', 'private business plaintext')
    expect(encrypted.success).toBe(false)
    expect(JSON.stringify(encrypted)).not.toContain('private business plaintext')
    expect(JSON.stringify(encrypted)).not.toContain(ring.keys.v1!.privateKey)
    await expect(manager.registerClientKey(ring.keys.v1!.publicKey)).rejects.toThrow()
    await expect(manager.getClientPublicKey('client-id')).rejects.toThrow()
  })
})
