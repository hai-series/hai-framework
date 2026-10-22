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
 * @example `headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)`
 */
export const TRANSPORT_PROTOCOL = {
  /** 客户端 ID 请求头名。 */
  CLIENT_ID_HEADER: 'X-Client-Id',
  /** GET/HEAD 等无正文请求的认证封装；禁止与正文封装同时出现。 */
  ENVELOPE_HEADER: 'X-Hai-Transport',
  /** 唯一支持的认证协议版本；旧未认证格式拒绝。 */
  VERSION: 2,
  /** 请求允许的过去时间窗口（毫秒）。 */
  REQUEST_WINDOW_MS: 300_000,
  /** 节点时钟允许的最大未来偏差（毫秒）。 */
  CLOCK_SKEW_MS: 30_000,
  /** 标识响应体已加密的响应头名。 */
  ENCRYPTED_HEADER: 'X-Encrypted',
  /** `X-Encrypted` 响应头的开启值。 */
  ENCRYPTED_HEADER_VALUE: 'true',
  /** 密钥协商端点的默认子路径（相对于挂载前缀）。 */
  DEFAULT_KEY_EXCHANGE_PATH: '/_hai/key-exchange',
} as const

/**
 * 密钥协商请求体（客户端 → 服务端）。
 * @example `const body: KeyExchangeRequest = { clientPublicKey: keyPair.publicKey }`
 */
export interface KeyExchangeRequest {
  readonly clientPublicKey: string
}

/**
 * 密钥协商响应体（服务端 → 客户端）。
 * @example `const body: KeyExchangeResponse = { clientId, serverKeyId: manager.getServerKeyId(), serverPublicKey: manager.getServerPublicKey() }`
 */
export interface KeyExchangeResponse {
  /** 服务端当前加密密钥版本；业务请求必须带回该值。 */
  readonly serverKeyId: string
  readonly serverPublicKey: string
  readonly clientId: string
}

// ─── 加解密载荷 ───

/**
 * 非对称密钥对；私钥不得写入公开配置、日志或响应。
 * @example `const pair: TransportKeyPair = managedServerKeyPair`
 */
export interface TransportKeyPair {
  readonly publicKey: string
  readonly privateKey: string
}

/**
 * 端到端传输的加密载荷格式。
 *
 * encryptedKey 封装独立的 SM4/HMAC 密钥；签名覆盖全部认证字段和 MAC。
 * 接收方必须先验证发送方及 MAC，再解密，不能仅凭 X-Encrypted 布尔标记信任正文。
 * @example
 * ```ts
 * const result = await manager.encryptResponse(verifiedContext, JSON.stringify(data), 200)
 * if (result.success) return Response.json(result.data)
 * ```
 */
export interface EncryptedPayload {
  /** 认证的请求上下文；响应必须原样关联同一个请求。 */
  readonly context: TransportMessageContext
  /** 认证方向，防止把合法响应反射到请求入口。 */
  readonly direction: 'request' | 'response'
  /** 请求固定为 0；响应认证实际 HTTP 状态码。 */
  readonly status: number
  /** SM2 封装的 JSON [SM4 密钥 hex, 独立 HMAC 密钥 hex]。 */
  readonly encryptedKey: string
  /** SM4-CBC 密文 hex；认证输入包含原始编码值。 */
  readonly ciphertext: string
  /** 随机 16 字节 CBC IV 的 hex 编码。 */
  readonly iv: string
  /** 独立随机密钥计算的 HMAC-SM3；先验证后解密 CBC。 */
  readonly tag: string
  /** 对完整封装和 tag 的发送方 SM2 签名，防止公钥持有者伪造发送方。 */
  readonly signature: string
}

/**
 * 与一次 HTTP 请求绑定的认证上下文。
 * requestId 是 128 位随机 nonce；共享 registry 在有效窗口内只允许消费一次。
 * pathHash 为实际 URL 的 pathname + search 的 SM3 摘要，不解码或重排查询参数。
 * @example
 * ```ts
 * const context: TransportMessageContext = {
 *   version: 2, serverKeyId: '2026-10', clientId, requestId,
 *   issuedAt: Date.now(), method: 'POST', pathHash: actualPathSm3,
 * }
 * ```
 */
export interface TransportMessageContext {
  /** 唯一受支持的协议版本。 */
  readonly version: 2
  /** 协商选择的受管服务端密钥版本。 */
  readonly serverKeyId: string
  /** registry 注册的客户端 ID；发送方必须证明持有对应私钥。 */
  readonly clientId: string
  /** 128 位随机十六进制 nonce，同时用于响应关联。 */
  readonly requestId: string
  /** 请求创建时间，Unix 毫秒；允许过去 5 分钟、未来 30 秒。 */
  readonly issuedAt: number
  /** 大写 HTTP 方法，必须与实际 Request 完全一致。 */
  readonly method: string
  /** 实际 pathname + 原始 search 的 SM3 摘要，64 位小写 hex，避免在认证头中重复长 URL。 */
  readonly pathHash: string
}

/**
 * HTTP 适配器从实际 Request 提取的可信上下文，禁止从密文封装直接复制。
 * @example
 * ```ts
 * const expected = { clientId, method: request.method, path: url.pathname + url.search }
 * const result = await manager.decryptRequest(payload, expected)
 * ```
 */
export interface TransportRequestContext {
  /** 实际 X-Client-Id 头，用于 registry 查询及发送方验签。 */
  readonly clientId: string
  /** 实际 Request.method。 */
  readonly method: string
  /** 实际 URL.pathname + URL.search，保留查询参数顺序及编码。 */
  readonly path: string
}

/**
 * 发往服务端的密文，显式指定协商时取得的服务端密钥版本。
 * @example
 * ```ts
 * // authenticated 为客户端生成的完整认证封装，不手写密钥或标记来模拟认证。
 * const payload: EncryptedRequestPayload = { ...authenticated, direction: 'request', status: 0 }
 * ```
 */
export interface EncryptedRequestPayload extends EncryptedPayload {
  readonly direction: 'request'
  readonly status: 0
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
 * @example `const service: TransportCryptoServiceLike = crypto`
 */
export interface TransportCryptoServiceLike {
  asymmetric: {
    generateKeyPair: () => HaiResult<TransportKeyPair>
    encrypt: (data: string, publicKey: string) => HaiResult<string>
    decrypt: (ciphertext: string, privateKey: string) => HaiResult<string>
    sign: (data: string, privateKey: string) => HaiResult<string>
    verify: (data: string, signature: string, publicKey: string) => HaiResult<boolean>
  }
  hash: {
    /** SM3 摘要，用于实际请求路径绑定，不使用其它摘要算法替换。 */
    hash: (data: string) => HaiResult<string>
    hmac: (data: string, key: string) => HaiResult<string>
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
 * @example `const registry: TransportKeyStore = createRedisTransportKeyStore({ cache })`
 */
export interface TransportKeyStore {
  /** 公钥与nonce状态的真实共享能力；生产只接受shared。 */
  readonly stateScope: 'local' | 'shared'
  /**
   * 注册有效 SM2 公钥，返回服务端生成的 clientId；格式/曲线点无效或存储故障必须 reject。
   * 容量策略见具体工厂契约：数据库满容量拒绝，开发/测试内存实现允许 FIFO 淘汰公钥。
   * @example `const clientId = await registry.register(clientPublicKey)`
   */
  register: (publicKey: string) => Promise<string>
  /** 查询已注册客户端公钥。 */
  get: (clientId: string) => Promise<string | undefined>
  /**
   * 原子消费客户端 requestId nonce；成功返回 true，重放返回 false。
   * 必须跨节点共享且在 expiresAt（Unix 毫秒）前不驱逐；存储故障必须 reject，禁止当作成功。
   * @example `const accepted = await store.claimRequest(clientId, requestId, issuedAt + 360_000)`
   */
  claimRequest: (clientId: string, requestId: string, expiresAt: number) => Promise<boolean>
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
 * @example `const options: TransportCreateServerOptions = { serverKeyRing: managedRing, keyStore: sharedRegistry }`
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
 * @example `const result = await manager.decryptRequest(payload, actualHttpContext)`
 *
 * @remarks
 * 典型调用顺序：
 *
 * 1. `registerClientKey(clientPublicKey)`：在密钥协商端点中保存客户端公钥，并生成 `clientId`。
 * 2. `getServerPublicKey()`：把服务端公钥返回给客户端，供后续请求加密会话密钥。
 * 3. `await decryptRequest(payload, actualHttpContext)`：认证、验证时效并原子消费 nonce 后返回明文。
 * 4. `await encryptResponse(payload.context, data, status)`：业务完成后绑定原请求和 HTTP 状态加密响应。
 * 5. `close()`：服务关闭时释放底层 keyStore 资源。
 */
export interface TransportEncryptionManager {
  /** 当前新协商使用的服务端密钥 ID。 */
  getServerKeyId: () => string
  getServerPublicKey: () => string
  /**
   * 验证 SM2 公钥编码和曲线点后向显式 registry 注册。
   * @throws 公钥无效或 registry 写入失败；HTTP 协商适配器负责转换成失败响应。
   * @example `const clientId = await manager.registerClientKey(clientPublicKey)`
   */
  registerClientKey: (clientPublicKey: string) => Promise<string>
  /** 查询客户端公钥；registry 读取故障会 reject，不作为未注册处理。 */
  getClientPublicKey: (clientId: string) => Promise<string | undefined>
  /**
   * 按已认证请求上下文加密、MAC 并签名响应，绑定实际 HTTP 状态。
   * registry 及加密故障均返回失败 HaiResult；上下文只能来自成功的请求认证。
   * @example `await manager.encryptResponse(verified.data.context, json, 200)`
   */
  encryptResponse: (request: TransportMessageContext, data: string, status: number) => Promise<HaiResult<EncryptedPayload>>
  /**
   * 验证发送方、MAC、HTTP 绑定和时效，原子消费 nonce 后才返回明文；错误不含密文或 Secret。
   * expected 须从实际 Request 提取，不从 payload 复制。HTTP 优先用 authenticateTransportRequest。
   * @example `await manager.decryptRequest(payload, { clientId, method: request.method, path: url.pathname + url.search })`
   */
  decryptRequest: (payload: EncryptedRequestPayload, expected: TransportRequestContext) => Promise<HaiResult<string>>
  /** 关闭：释放 keyStore 资源。 */
  close: () => Promise<void>
}

/**
 * 客户端传输加密会话。
 *
 * 由 {@link createTransportClient} 创建；包装宿主 `fetch`，
 * 自动完成首次密钥协商并对后续请求自动加解密。
 * @example `const response = await client.encryptedFetch('/api/orders', { method: 'POST', body: '{}' })`
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
   * 仅接受关联同一请求上下文与 HTTP status 的认证响应；缺标记也拒绝，不回退明文或密文。
   *
   * @throws 与原生 fetch 一样，网络错误、密钥协商失败、加密失败或解密失败会 reject。
   */
  encryptedFetch: typeof fetch
  /** 是否已完成密钥协商。 */
  ready: () => boolean
  /** 销毁会话（清空客户端密钥）。 */
  destroy: () => void
}
