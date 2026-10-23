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
 * 认证传输v2的头名、窗口与默认协商子路径；各HTTP适配器共用，不手写漂移常量。
 *
 * @example
 * ```ts
 * import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'
 * const headers = new Headers()
 * headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
 * const keyExchangePath = TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH
 * ```
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
 * 密钥协商请求；只发送客户端公钥，私钥始终留在客户端，注册仍验证曲线点。
 *
 * @example
 * ```ts
 * import { crypto, type KeyExchangeRequest } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const body: KeyExchangeRequest = { clientPublicKey: pair.publicKey }
 *   const serialized = JSON.stringify(body)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface KeyExchangeRequest {
  readonly clientPublicKey: string
}

/**
 * TLS协商响应，公开服务端版本、公钥和registry生成的clientId；不含服务端私钥。
 *
 * @example
 * ```ts
 * import type { KeyExchangeRequest, KeyExchangeResponse, TransportEncryptionManager } from '@h-ai/crypto'
 * async function exchange(manager: TransportEncryptionManager, body: KeyExchangeRequest): Promise<KeyExchangeResponse> {
 *   const clientId = await manager.registerClientKey(body.clientPublicKey)
 *   return { clientId, serverKeyId: manager.getServerKeyId(), serverPublicKey: manager.getServerPublicKey() }
 * }
 * ```
 */
export interface KeyExchangeResponse {
  /** 服务端当前加密密钥版本；业务请求必须带回该值。 */
  readonly serverKeyId: string
  readonly serverPublicKey: string
  readonly clientId: string
}

// ─── 加解密载荷 ───

/**
 * 传输使用的SM2公私钥对；服务端版本从私有Secret注入，客户端可本地生成独立会话密钥。
 *
 * @example
 * ```ts
 * import { crypto, type TransportKeyPair } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const clientPair: TransportKeyPair = pair
 *   const publicKey = clientPair.publicKey
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface TransportKeyPair {
  readonly publicKey: string
  readonly privateKey: string
}

/**
 * 完整v2认证封装；encryptedKey含独立SM4/HMAC密钥，signature覆盖认证字段和MAC。
 * HTTP适配器只用成功认证得到的上下文生成响应，不自行拼接示例密文。
 *
 * @example
 * ```ts
 * import { authenticateTransportRequest, type EncryptedPayload, type TransportEncryptionManager } from '@h-ai/crypto'
 * async function sealResponse(manager: TransportEncryptionManager, request: Request): Promise<EncryptedPayload> {
 *   const verified = await authenticateTransportRequest(manager, request)
 *   if (!verified.success) throw new Error(verified.error.message)
 *   const encrypted = await manager.encryptResponse(verified.data.context, JSON.stringify({ accepted: true }), 200)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   return encrypted.data
 * }
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
 * 认证的单次HTTP上下文；128位nonce、版本、客户端、时间、方法和实际路径SM3摘要共同绑定。
 * 服务端共享registry只允许消费一次nonce；响应必须关联成功认证后的同一上下文。
 *
 * @example
 * ```ts
 * import { authenticateTransportRequest, type TransportEncryptionManager, type TransportMessageContext } from '@h-ai/crypto'
 * async function contextOf(manager: TransportEncryptionManager, request: Request): Promise<TransportMessageContext> {
 *   const verified = await authenticateTransportRequest(manager, request)
 *   if (!verified.success) throw new Error(verified.error.message)
 *   return verified.data.context
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
 * 从实际HTTP Request提取的可信绑定输入；不能直接复制密文的自报方法、路径或客户端。
 *
 * @example
 * ```ts
 * import type { TransportRequestContext } from '@h-ai/crypto'
 * function expectedContext(request: Request): TransportRequestContext {
 *   const clientId = request.headers.get('X-Client-Id')
 *   if (!clientId) throw new Error('Missing client ID')
 *   const url = new URL(request.url)
 *   return { clientId, method: request.method, path: url.pathname + url.search }
 * }
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
 * 客户端发出的完整请求封装，direction=request且status=0；结构类型不构成认证证明。
 *
 * @example
 * ```ts
 * import type { EncryptedRequestPayload, TransportEncryptionManager } from '@h-ai/crypto'
 * async function decrypt(manager: TransportEncryptionManager, request: Request, payload: EncryptedRequestPayload): Promise<string> {
 *   const clientId = request.headers.get('X-Client-Id')
 *   if (!clientId) throw new Error('Missing client ID')
 *   const url = new URL(request.url)
 *   const result = await manager.decryptRequest(payload, { clientId, method: request.method, path: url.pathname + url.search })
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface EncryptedRequestPayload extends EncryptedPayload {
  readonly direction: 'request'
  readonly status: 0
}

/**
 * 服务端受管版本密钥环；所有节点同版本对应同密钥，新协商选activeKeyId，旧版本保留到撤销。
 * 先分发新旧版本再切活动ID；删除旧版本即撤销，私钥不进入PUBLIC_/VITE_/日志。
 *
 * @example
 * ```ts
 * import { parseTransportServerKeyRing, type TransportServerKeyRing } from '@h-ai/crypto'
 * const parsed = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
 * if (!parsed.success) throw new Error(parsed.error.message)
 * const ring: TransportServerKeyRing = parsed.data
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
 * 传输协议实际需要的SM2/SM3/HMAC/SM4能力；可结构化注入真实crypto，不仿造另一套算法。
 *
 * @example
 * ```ts
 * import { crypto, type TransportCryptoServiceLike } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const service: TransportCryptoServiceLike = crypto
 *   const digest = service.hash.hash('/api/v1/orders')
 *   if (!digest.success) throw new Error(digest.error.message)
 * }
 * finally { await crypto.close() }
 * ```
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
 * 客户端公钥与nonce存储契约；生产显式共享Redis/数据库，真实共享与原子性由提供者保证。
 * get的故障不能当未注册，claimRequest故障不能当成功；有效nonce不得在expiresAt前驱逐。
 *
 * @example
 * ```ts
 * import { crypto, createRedisTransportKeyStore, parseTransportServerKeyRing } from '@h-ai/crypto'
 * import { cache } from '@h-ai/cache'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const connected = await cache.init({ type: 'redis', host: 'cache', port: 6379, password: process.env.HAI_CACHE_PASSWORD })
 *   if (!connected.success) throw new Error(connected.error.message)
 *   try {
 *     const registry = createRedisTransportKeyStore({ cache, ttlSeconds: 3600 })
 *     const store: import('@h-ai/crypto').TransportKeyStore = registry
 *     const scope = store.stateScope
 *     // Redis部署须noeviction/可靠持久化，并同步各节点时钟。
 *   }
 *   finally { await cache.close() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface TransportKeyStore {
  /** 公钥与nonce状态的真实共享能力；生产只接受shared。 */
  readonly stateScope: 'local' | 'shared'
  /**
   * 注册有效 SM2 公钥，返回服务端生成的 clientId；格式/曲线点无效或存储故障必须 reject。
   * 容量策略见具体工厂契约：数据库满容量拒绝，开发/测试内存实现允许 FIFO 淘汰公钥。
   * @param publicKey - 实际调用输入，按该方法约束验证。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const { createInMemoryKeyStore } = await import('@h-ai/crypto')
   *   const registry = createInMemoryKeyStore(100)
   *   try { const clientId = await registry.register(pair.publicKey) }
   *   finally { await registry.close?.() }
   *   // 本例仅开发/测试；生产替换为共享Redis/数据库registry。
   * }
   * finally { await crypto.close() }
   * ```
   */
  register: (publicKey: string) => Promise<string>
  /**
   * 读取已注册有效公钥；缺失返回undefined，存储失败拒绝，不能伪装未注册。
   * @param clientId - registry生成的客户端标识。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const { createInMemoryKeyStore } = await import('@h-ai/crypto')
   *   const registry = createInMemoryKeyStore(100)
   *   try { const clientId = await registry.register(pair.publicKey); const publicKey = await registry.get(clientId) }
   *   finally { await registry.close?.() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  get: (clientId: string) => Promise<string | undefined>
  /**
   * 原子消费客户端 requestId nonce；成功返回 true，重放返回 false。
   * 必须跨节点共享且在 expiresAt（Unix 毫秒）前不驱逐；存储故障必须 reject，禁止当作成功。
   * @param clientId - registry生成的客户端标识。
   * @param requestId - 本次128位随机nonce。
   * @param expiresAt - nonce至少保留到的Unix毫秒期限。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const { createInMemoryKeyStore } = await import('@h-ai/crypto')
   *   const registry = createInMemoryKeyStore(100)
   *   try {
   *     const clientId = await registry.register(pair.publicKey)
   *     const requestId = globalThis.crypto.randomUUID().replaceAll('-', '')
   *     const expiresAt = Date.now() + 360000
   *     const first = await registry.claimRequest(clientId, requestId, expiresAt)
   *     const replay = await registry.claimRequest(clientId, requestId, expiresAt)
   *     // 单进程测试预期true/false；生产需要跨节点共享原子消费且有效期间不驱逐。
   *   }
   *   finally { await registry.close?.() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  claimRequest: (clientId: string, requestId: string, expiresAt: number) => Promise<boolean>
  /**
   * 主动删除（可选，便于客户端登出时清理）。
   * @param clientId - registry生成的客户端标识。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const { createInMemoryKeyStore } = await import('@h-ai/crypto')
   *   const registry = createInMemoryKeyStore(100)
   *   try { const clientId = await registry.register(pair.publicKey); await registry.delete?.(clientId) }
   *   finally { await registry.close?.() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  delete?: (clientId: string) => Promise<void>
  /**
   * 可选释放registry自有资源；借用的cache/reldb不由registry关闭。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import { createInMemoryKeyStore } from '@h-ai/crypto'
   * const registry = createInMemoryKeyStore(100)
   * await registry.close?.()
   * // 共享registry借用的cache/reldb仍由应用反序关闭。
   * ```
   */
  close?: () => Promise<void>
}

/**
 * 服务端创建配置；受管密钥环和共享registry均必填，没有进程随机密钥回退。
 *
 * @example
 * ```ts
 * import { crypto, createRedisTransportKeyStore, parseTransportServerKeyRing } from '@h-ai/crypto'
 * import { cache } from '@h-ai/cache'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const connected = await cache.init({ type: 'redis', host: 'cache', port: 6379, password: process.env.HAI_CACHE_PASSWORD })
 *   if (!connected.success) throw new Error(connected.error.message)
 *   try {
 *     const registry = createRedisTransportKeyStore({ cache, ttlSeconds: 3600 })
 *     const parsed = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
 *     if (!parsed.success) throw new Error(parsed.error.message)
 *     const options: import('@h-ai/crypto').TransportCreateServerOptions = { serverKeyRing: parsed.data, keyStore: registry }
 *     const created = crypto.transport.createServer(options)
 *     if (!created.success) throw new Error(created.error.message)
 *     await created.data.close()
 *   }
 *   finally { await cache.close() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface TransportCreateServerOptions {
  /** 必填受管服务端密钥环；没有隐式随机生成或进程密钥回退。 */
  readonly serverKeyRing: TransportServerKeyRing
  /** 客户端公钥存储；生产必须注入跨节点共享实现。 */
  readonly keyStore: TransportKeyStore
}

// ─── 管理器与客户端公开接口 ───

/**
 * 服务端认证传输管理器；注册公钥，按真实HTTP上下文验签/MAC/时效并消费nonce，随后才返回明文。
 * 优先使用authenticateTransportRequest；响应只用已认证上下文。close释放registry自有资源，不关闭借用的cache/reldb。
 *
 * @example
 * ```ts
 * import { crypto, createRedisTransportKeyStore, parseTransportServerKeyRing } from '@h-ai/crypto'
 * import { cache } from '@h-ai/cache'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const connected = await cache.init({ type: 'redis', host: 'cache', port: 6379, password: process.env.HAI_CACHE_PASSWORD })
 *   if (!connected.success) throw new Error(connected.error.message)
 *   try {
 *     const registry = createRedisTransportKeyStore({ cache, ttlSeconds: 3600 })
 *     const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
 *     if (!ring.success) throw new Error(ring.error.message)
 *     const created = crypto.transport.createServer({ serverKeyRing: ring.data, keyStore: registry })
 *     if (!created.success) throw new Error(created.error.message)
 *     const manager = created.data
 *     try {
 *       const currentVersion = manager.getServerKeyId()
 *       const publicKey = manager.getServerPublicKey()
 *     }
 *     finally { await manager.close() }
 *   }
 *   finally { await cache.close() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface TransportEncryptionManager {
  /**
   * 当前新协商使用的服务端密钥 ID。
   * @returns 直接返回值，使用前先初始化模块。
   *
   * @example
   * ```ts
   * import type { TransportEncryptionManager } from '@h-ai/crypto'
   * function activeVersion(manager: TransportEncryptionManager): string { return manager.getServerKeyId() }
   * ```
   */
  getServerKeyId: () => string
  /**
   * 返回当前活动版本的公开公钥，只用于可信TLS协商，不含私钥。
   * @returns 直接返回值，使用前先初始化模块。
   *
   * @example
   * ```ts
   * import type { TransportEncryptionManager } from '@h-ai/crypto'
   * function activePublicKey(manager: TransportEncryptionManager): string { return manager.getServerPublicKey() }
   * ```
   */
  getServerPublicKey: () => string
  /**
   * 验证 SM2 公钥编码和曲线点后向显式 registry 注册。
   * @throws 公钥无效或 registry 写入失败；HTTP 协商适配器负责转换成失败响应。
   * @param clientPublicKey - 实际调用输入，按该方法约束验证。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import type { TransportEncryptionManager } from '@h-ai/crypto'
   * async function register(manager: TransportEncryptionManager, clientPublicKey: string): Promise<string> {
   *   // 方法校验编码/曲线点后写入共享registry；异常由HTTP协商适配器转成失败响应。
   *   return manager.registerClientKey(clientPublicKey)
   * }
   * ```
   */
  registerClientKey: (clientPublicKey: string) => Promise<string>
  /**
   * 查询客户端公钥；registry 读取故障会 reject，不作为未注册处理。
   * @param clientId - registry生成的客户端标识。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import type { TransportEncryptionManager } from '@h-ai/crypto'
   * async function lookup(manager: TransportEncryptionManager, clientId: string): Promise<string | undefined> {
   *   return manager.getClientPublicKey(clientId)
   * }
   * ```
   */
  getClientPublicKey: (clientId: string) => Promise<string | undefined>
  /**
   * 按已认证请求上下文加密、MAC 并签名响应，绑定实际 HTTP 状态。
   * registry 及加密故障均返回失败 HaiResult；上下文只能来自成功的请求认证。
   * @param request - 实际调用输入，按该方法约束验证。
   * @param data - 实际调用输入，按该方法约束验证。
   * @param status - 实际调用输入，按该方法约束验证。
   * @returns HaiResult，先检查success再读取data。
   *
   * @example
   * ```ts
   * import { authenticateTransportRequest, type EncryptedPayload, type TransportEncryptionManager } from '@h-ai/crypto'
   * async function sealResponse(manager: TransportEncryptionManager, request: Request): Promise<EncryptedPayload> {
   *   const verified = await authenticateTransportRequest(manager, request)
   *   if (!verified.success) throw new Error(verified.error.message)
   *   const encrypted = await manager.encryptResponse(verified.data.context, JSON.stringify({ accepted: true }), 200)
   *   if (!encrypted.success) throw new Error(encrypted.error.message)
   *   return encrypted.data
   * }
   * ```
   */
  encryptResponse: (request: TransportMessageContext, data: string, status: number) => Promise<HaiResult<EncryptedPayload>>
  /**
   * 验证发送方、MAC、HTTP 绑定和时效，原子消费 nonce 后才返回明文；错误不含密文或 Secret。
   * expected 须从实际 Request 提取，不从 payload 复制。HTTP 优先用 authenticateTransportRequest。
   * @param payload - 实际调用输入，按该方法约束验证。
   * @param expected - 实际调用输入，按该方法约束验证。
   * @returns HaiResult，先检查success再读取data。
   *
   * @example
   * ```ts
   * import type { EncryptedRequestPayload, TransportEncryptionManager } from '@h-ai/crypto'
   * async function decrypt(manager: TransportEncryptionManager, request: Request, payload: EncryptedRequestPayload): Promise<string> {
   *   const clientId = request.headers.get('X-Client-Id')
   *   if (!clientId) throw new Error('Missing client ID')
   *   const url = new URL(request.url)
   *   const result = await manager.decryptRequest(payload, { clientId, method: request.method, path: url.pathname + url.search })
   *   if (!result.success) throw new Error(result.error.message)
   *   return result.data
   * }
   * ```
   */
  decryptRequest: (payload: EncryptedRequestPayload, expected: TransportRequestContext) => Promise<HaiResult<string>>
  /**
   * 释放registry自有资源；应用仍负责借用cache/reldb的关闭。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import { crypto, createRedisTransportKeyStore, parseTransportServerKeyRing } from '@h-ai/crypto'
   * import { cache } from '@h-ai/cache'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const connected = await cache.init({ type: 'redis', host: 'cache', port: 6379, password: process.env.HAI_CACHE_PASSWORD })
   *   if (!connected.success) throw new Error(connected.error.message)
   *   try {
   *     const registry = createRedisTransportKeyStore({ cache, ttlSeconds: 3600 })
   *     const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
   *     if (!ring.success) throw new Error(ring.error.message)
   *     const created = crypto.transport.createServer({ serverKeyRing: ring.data, keyStore: registry })
   *     if (!created.success) throw new Error(created.error.message)
   *     const manager = created.data
   *     try {
   *       const currentVersion = manager.getServerKeyId()
   *       const publicKey = manager.getServerPublicKey()
   *     }
   *     finally { await manager.close() }
   *   }
   *   finally { await cache.close() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  close: () => Promise<void>
}

/**
 * 客户端单会话；首次调用自动协商，后续请求生成随机nonce并认证响应关联/签名/MAC。
 * init返回HaiResult；encryptedFetch按fetch契约reject；destroy清本地会话，不代表撤销服务端registry。
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
 *   try {
 *     const ready = await client.init()
 *     if (!ready.success) throw new Error(ready.error.message)
 *     const response = await client.encryptedFetch('https://api.example.com/api/v1/orders')
 *     if (!response.ok) throw new Error('HTTP request failed')
 *   }
 *   finally { client.destroy() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface TransportClient {
  /**
   * 完成密钥协商；多次调用幂等（同一会话只协商一次）。
   *
   * 通常无需手动调用：`encryptedFetch` 在首次请求前会自动 `init()`。
   * 协商在 30 秒内完成，握手 JSON 与单个公钥分别受 TRANSPORT_BODY_LIMITS 限制。
   * @returns HaiResult，先检查success再读取data。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
   *   try {
   *     const ready = await client.init()
   *     if (!ready.success) throw new Error(ready.error.message)
   *     const response = await client.encryptedFetch('https://api.example.com/api/v1/orders')
   *     if (!response.ok) throw new Error('HTTP request failed')
   *   }
   *   finally { client.destroy() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  init: () => Promise<HaiResult<void>>
  /**
   * 包装后的 fetch；签名与全局 `fetch` 一致，请求/响应自动加解密。
   * 明文/密文按 TRANSPORT_BODY_LIMITS 有界读取原流；超限或取消释放 reader，保留调用方 signal。
   * 仅接受关联同一请求上下文与 HTTP status 的认证响应；缺标记也拒绝，不回退明文或密文。
   *
   * @throws 与原生 fetch 一样，网络错误、密钥协商失败、加密失败或解密失败会 reject。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
   *   try {
   *     const ready = await client.init()
   *     if (!ready.success) throw new Error(ready.error.message)
   *     const response = await client.encryptedFetch('https://api.example.com/api/v1/orders')
   *     if (!response.ok) throw new Error('HTTP request failed')
   *   }
   *   finally { client.destroy() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  encryptedFetch: typeof fetch
  /**
   * 是否已完成密钥协商。
   * @returns 直接boolean，false表示不匹配/未就绪。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
   *   try { const ready = client.ready() }
   *   finally { client.destroy() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  ready: () => boolean
  /**
   * 清空本地客户端密钥与协商状态；下次请求重新协商，不撤销服务端身份或业务效果。
   * @returns 直接返回值，使用前先初始化模块。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
   *   client.destroy()
   *   // 只清本地会话；不撤销服务端registry或业务会话。
   * }
   * finally { await crypto.close() }
   * ```
   */
  destroy: () => void
}
