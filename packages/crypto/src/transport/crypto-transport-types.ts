/**
 * @h-ai/crypto — 传输加密类型与协议常量
 *
 * 提供 SM2 + SM4（或等效非对称 + 对称）混合传输加密所需的接口与协议常量，
 * 由 kit / serv / api-client 共享，确保两端协议完全一致。
 *
 * @module crypto-transport-types
 */

import type { HaiResult } from '@h-ai/core'

// ─── 协议常量（kit / serv / api-client 必须严格一致） ───

/**
 * 传输加密协议常量。
 *
 * 所有使用端必须复用这组常量，避免「header 名拼写漂移导致两端协议错配」。
 */
export const TRANSPORT_PROTOCOL = {
  /** 客户端 ID 请求头名。 */
  CLIENT_ID_HEADER: 'X-Client-Id',
  /** 标识响应体已加密的响应头名。 */
  ENCRYPTED_HEADER: 'X-Encrypted',
  /** `X-Encrypted` 响应头的开启值。 */
  ENCRYPTED_HEADER_VALUE: 'true',
  /** 密钥协商端点的默认子路径（相对于挂载前缀）。 */
  DEFAULT_KEY_EXCHANGE_PATH: '/_hai/key-exchange',
} as const

/**
 * 密钥协商请求体（客户端 → 服务端）。
 */
export interface KeyExchangeRequest {
  readonly clientPublicKey: string
}

/**
 * 密钥协商响应体（服务端 → 客户端）。
 */
export interface KeyExchangeResponse {
  /** 服务端当前加密密钥版本；业务请求必须带回该值。 */
  readonly serverKeyId: string
  readonly serverPublicKey: string
  readonly clientId: string
}

// ─── 加解密载荷 ───

/** 非对称密钥对。 */
export interface TransportKeyPair {
  readonly publicKey: string
  readonly privateKey: string
}

/**
 * 端到端传输的加密载荷格式。
 *
 * `encryptedKey` 用对端非对称公钥加密的对称会话密钥；`ciphertext` + `iv`
 * 为该会话密钥加密的明文。两端必须使用同一份字段命名。
 */
export interface EncryptedPayload {
  readonly encryptedKey: string
  readonly ciphertext: string
  readonly iv: string
}

/**
 * 发往服务端的密文，显式指定协商时取得的服务端密钥版本。
 * @example
 * ```ts
 * const payload: EncryptedRequestPayload = { serverKeyId: '2026-10', encryptedKey, ciphertext, iv }
 * ```
 */
export interface EncryptedRequestPayload extends EncryptedPayload {
  /** 协商返回的服务端密钥 ID；未知或已撤销 ID 必须拒绝。 */
  readonly serverKeyId: string
}

/**
 * 由 Secret Manager 或服务端私有环境注入的版本化密钥环。
 *
 * 各节点使用同一组 keys；activeKeyId 只控制新协商，保留的旧版本仍可解密。
 * 轮换先向所有节点分发新旧版本，再切换 activeKeyId；删除旧版本即撤销。
 * 禁止放入公开 YAML、PUBLIC_/VITE_ 环境变量或日志。
 * @example
 * ```ts
 * const ring: TransportServerKeyRing = {
 *   activeKeyId: '2026-10',
 *   keys: { '2026-10': managedKeyPair, '2026-09': previousManagedKeyPair },
 * }
 * ```
 */
export interface TransportServerKeyRing {
  /** 新协商使用的版本；1–64 个字母、数字、下划线或连字符。 */
  readonly activeKeyId: string
  /** ID 与密钥对；仅供服务端保管，所有节点必须分发相同版本的相同密钥。 */
  readonly keys: Readonly<Record<string, TransportKeyPair>>
}

// ─── 注入式服务接口 ───

/**
 * 传输加密所需的非对称 + 对称能力子集。
 *
 * 不直接依赖 `@h-ai/crypto` 的具体实现，便于测试时注入 mock；
 * 实际使用时 `crypto` 模块的实例本身即可结构兼容。
 */
export interface TransportCryptoServiceLike {
  asymmetric: {
    generateKeyPair: () => HaiResult<TransportKeyPair>
    encrypt: (data: string, publicKey: string) => HaiResult<string>
    decrypt: (ciphertext: string, privateKey: string) => HaiResult<string>
  }
  symmetric: {
    generateKey: () => string
    encryptWithIV: (data: string, key: string) => HaiResult<{ ciphertext: string, iv: string }>
    decryptWithIV: (ciphertext: string, key: string, iv: string) => HaiResult<string>
  }
}

// ─── 客户端密钥存储（可插拔，支持分布式） ───

/**
 * 客户端公钥存储抽象。
 *
 * 生产显式接入共享 Redis / 数据库；开发和测试可显式创建 createInMemoryKeyStore。
 *
 * 设计原则：方法均为异步签名，避免后续替换为分布式实现时大改接口；
 * 内存实现以 `Promise.resolve` 包裹即可。
 */
export interface TransportKeyStore {
  /** 注册新客户端，返回服务端生成的 `clientId`。 */
  register: (publicKey: string) => Promise<string>
  /** 查询已注册客户端公钥。 */
  get: (clientId: string) => Promise<string | undefined>
  /** 主动删除（可选，便于客户端登出时清理）。 */
  delete?: (clientId: string) => Promise<void>
  /** 释放底层资源（关闭连接、清理定时器等）。 */
  close?: () => Promise<void>
}

/**
 * 创建服务端传输加密管理器的配置。
 *
 * 必须同时显式提供服务端密钥环和客户端 registry；生产使用共享 Redis/数据库。
 * 开发/测试可显式传入 createInMemoryKeyStore(capacity)。
 */
export interface TransportCreateServerOptions {
  /** 必填受管服务端密钥环；没有隐式随机生成或进程密钥回退。 */
  readonly serverKeyRing: TransportServerKeyRing
  /** 客户端公钥存储；生产必须注入跨节点共享实现。 */
  readonly keyStore: TransportKeyStore
}

// ─── 管理器与客户端公开接口 ───

/**
 * 服务端传输加密管理器。
 *
 * 由 {@link createTransportEncryption} 创建；负责服务端密钥对持有、客户端密钥
 * 注册与请求/响应的加解密。
 *
 * @remarks
 * 典型调用顺序：
 *
 * 1. `registerClientKey(clientPublicKey)`：在密钥协商端点中保存客户端公钥，并生成 `clientId`。
 * 2. `getServerPublicKey()`：把服务端公钥返回给客户端，供后续请求加密会话密钥。
 * 3. `decryptRequest(payload)`：普通业务请求进入业务逻辑前，先把密文请求体解成明文。
 * 4. `encryptResponse(clientId, data)`：业务处理完成后，按当前客户端公钥重新加密响应体。
 * 5. `close()`：服务关闭时释放底层 keyStore 资源。
 */
export interface TransportEncryptionManager {
  /** 当前新协商使用的服务端密钥 ID。 */
  getServerKeyId: () => string
  getServerPublicKey: () => string
  /**
   * 向显式 registry 注册公钥。
   * @throws registry 写入失败；HTTP 协商适配器负责转换成失败响应。
   */
  registerClientKey: (clientPublicKey: string) => Promise<string>
  /** 查询客户端公钥；registry 读取故障会 reject，不作为未注册处理。 */
  getClientPublicKey: (clientId: string) => Promise<string | undefined>
  /** 加密响应；registry 读取及加密故障均返回失败 HaiResult，不抛业务异常。 */
  encryptResponse: (clientId: string, data: string) => Promise<HaiResult<EncryptedPayload>>
  decryptRequest: (payload: EncryptedRequestPayload) => HaiResult<string>
  /** 关闭：释放 keyStore 资源。 */
  close: () => Promise<void>
}

/**
 * 客户端传输加密会话。
 *
 * 由 {@link createTransportClient} 创建；包装宿主 `fetch`，
 * 自动完成首次密钥协商并对后续请求自动加解密。
 *
 * @remarks
 * 典型调用顺序：
 *
 * 1. `init()`（可选）：预先完成一次密钥协商。
 * 2. `encryptedFetch()`：业务请求统一走这里；若当前会话尚未 ready，会先自动执行 `init()`。
 * 3. `ready()`：查看当前会话是否已经拿到 `clientId` 与服务端公钥。
 * 4. `destroy()`：登出、切租户或切环境时清空会话；下一次请求会重新协商。
 */
export interface TransportClient {
  /**
   * 完成密钥协商；多次调用幂等（同一会话只协商一次）。
   *
   * 通常无需手动调用：`encryptedFetch` 在首次请求前会自动 `init()`。
   * 协商在 30 秒内完成，握手 JSON 与单个公钥分别受 TRANSPORT_BODY_LIMITS 限制。
   */
  init: () => Promise<HaiResult<void>>
  /**
   * 包装后的 fetch；签名与全局 `fetch` 一致，请求/响应自动加解密。
   * 明文/密文按 TRANSPORT_BODY_LIMITS 有界读取原流；超限或取消释放 reader，保留调用方 signal。
   * 带加密标记的无效响应拒绝返回，不回退为原始密文。
   *
   * @throws 与原生 fetch 一样，网络错误、密钥协商失败、加密失败或解密失败会 reject。
   */
  encryptedFetch: typeof fetch
  /** 是否已完成密钥协商。 */
  ready: () => boolean
  /** 销毁会话（清空客户端密钥）。 */
  destroy: () => void
}
