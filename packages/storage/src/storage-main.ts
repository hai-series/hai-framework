/**
 * @h-ai/storage — 存储服务主入口
 *
 * 提供统一的 `storage` 对象，管理运行时状态与生命周期。
 * @module storage-main
 */

import type { HaiResult } from '@h-ai/core'
import type { StorageProvider } from './providers/storage-provider-types.js'
import type { StorageConfig, StorageConfigInput } from './storage-config.js'
import type { DirOperations, FileOperations, PresignOperations, StorageFunctions } from './storage-types.js'

import process from 'node:process'
import { core, err, ok } from '@h-ai/core'

import { createLocalProvider } from './providers/storage-provider-local.js'
import { createS3Provider } from './providers/storage-provider-s3.js'
import { checksum } from './storage-checksum.js'
import { StorageConfigSchema } from './storage-config.js'
import { storageM } from './storage-i18n.js'
import {

  HaiStorageError,

} from './storage-types.js'

const logger = core.logger.child({ module: 'storage', scope: 'main' })

// ─── 内部状态 ───

/** 当前使用的存储 Provider 实例（init 后非空，close 后置空） */
let currentProvider: StorageProvider | null = null

/** 当前解析后的存储配置（init 后非空，close 后置空） */
let currentConfig: StorageConfig | null = null

/** 并发初始化防护标志；防止多次 init() 同时执行导致资源泄漏 */
let initInProgress = false

/** 尚未释放的候选/旧 Provider；绝不用于业务操作，清理成功后才能替换。 */
let pendingProvider: StorageProvider | null = null
/** 初始化完成屏障，供 close 等待候选资源归属确定。 */
let initCompletion: Promise<void> | null = null
/** 合并并发关闭，避免同一连接重复释放。 */
let closingPromise: Promise<HaiResult<void>> | null = null

/** 停止发布资源并重试清理；失败时保留唯一所有权供下一次 close/init 重试。 */
async function closeOwnedProvider(): Promise<HaiResult<void>> {
  if (currentProvider) {
    pendingProvider = currentProvider
    currentProvider = null
  }
  currentConfig = null
  if (!pendingProvider)
    return ok(undefined)
  try {
    await pendingProvider.close()
    pendingProvider = null
    return ok(undefined)
  }
  catch (error) {
    logger.error('Provider cleanup failed; retaining resource for retry', { error })
    return err({ ...HaiStorageError.CONNECTION_FAILED, message: storageM('storage_operationFailed', {
      params: { error: error instanceof Error ? error.message : String(error) },
    }), cause: error, ext: { cleanupPending: true } })
  }
}

/** 初始化失败后释放候选；保留原始错误，并明确指出清理尚未完成。 */
async function failInitialization(result: HaiResult<void>): Promise<HaiResult<void>> {
  const cleanup = await closeOwnedProvider()
  if (result.success)
    return result
  if (cleanup.success) {
    const ext = { ...result.error.ext }
    delete ext.cleanupPending
    delete ext.cleanupError
    return err({ ...result.error, ext: Object.keys(ext).length > 0 ? ext : undefined })
  }
  return err({ ...result.error, ext: { ...result.error.ext, cleanupPending: true, cleanupError: cleanup.error } })
}

// ─── Provider 工厂 ───

/**
 * 根据配置类型创建对应的存储 Provider
 *
 * @param config - 经 Schema 校验后的存储配置
 * @returns 对应类型的 Provider 实例（尚未连接）
 * @throws 理论上仅在出现未覆盖分支时抛出异常（正常情况下由 Schema 保证不会发生）
 */
function createProvider(config: StorageConfig): StorageProvider {
  switch (config.type) {
    case 's3': return createS3Provider()
    case 'local': return createLocalProvider()
    default:
      throw new Error(storageM('storage_unsupportedType', { params: { type: (config as StorageConfig).type } }))
  }
}

// ─── 未初始化占位 ───

/**
 * 创建未初始化状态的错误工具包
 *
 * 当 storage 未调用 init() 就直接使用 file/dir/presign 操作时，
 * 所有方法调用都会返回 NOT_INITIALIZED 错误。
 */
const notInitialized = core.module.createNotInitializedKit(
  HaiStorageError.NOT_INITIALIZED,
  () => storageM('storage_notInitialized'),
)

/** 未初始化时的文件操作占位代理 */
const notInitializedFile = notInitialized.proxy<FileOperations>()

/** 未初始化时的目录操作占位代理 */
const notInitializedDir = notInitialized.proxy<DirOperations>()

/**
 * 未初始化时的签名 URL 操作占位代理
 *
 * publicUrl 始终返回 null；其余方法返回 NOT_INITIALIZED 错误。
 */
const notInitializedPresignBase = notInitialized.proxy<PresignOperations>()
const notInitializedPresign = new Proxy(
  notInitializedPresignBase,
  {
    get: (target, prop, receiver) => prop === 'publicUrl' ? () => null : Reflect.get(target, prop, receiver),
  },
)

// ─── 存储服务对象 ───

/**
 * 存储服务单例
 *
 * 使用前必须先调用 `storage.init()` 初始化，传入 S3 或本地存储配置。
 * 初始化后通过 `storage.file`、`storage.dir`、`storage.presign` 访问各操作接口。
 *
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage'
 *
 * // 初始化
 * await storage.init({ type: 'local', root: '/data/uploads' })
 *
 * // 上传文件
 * await storage.file.put('hello.txt', 'Hello World')
 *
 * // 关闭连接
 * await storage.close()
 * ```
 */
export const storage: StorageFunctions = {
  checksum,
  /**
   * 初始化存储连接。
   *
   * 如果当前已有活跃连接，会先自动 close 再重新初始化。
   * 配置会通过 Zod Schema 校验；校验失败或连接异常会返回 `CONNECTION_FAILED`。
   *
   * @param config 存储配置（S3 或本地），支持省略带默认值的字段。
   * @returns 成功时返回 ok(undefined)；失败时返回包含错误码和消息的 err。
   */
  async init(config: StorageConfigInput): Promise<HaiResult<void>> {
    // 并发初始化防护：避免多次 init 同时执行导致 Provider 泄漏
    if (initInProgress || closingPromise) {
      logger.warn('Storage init already in progress, skipping concurrent call')
      return err(
        HaiStorageError.OPERATION_FAILED,
        storageM('storage_operationFailed', { params: { error: 'Concurrent initialization detected' } }),
      )
    }
    initInProgress = true
    let resolveInit!: () => void
    initCompletion = new Promise<void>((resolve) => {
      resolveInit = resolve
    })

    try {
      const cleanup = await closeOwnedProvider()
      if (!cleanup.success)
        return cleanup

      logger.info('Initializing storage module')

      const parseResult = StorageConfigSchema.safeParse(config)
      if (!parseResult.success) {
        logger.error('Storage config validation failed', { error: parseResult.error.message })
        return err(
          HaiStorageError.CONFIG_ERROR,
          storageM('storage_configError', { params: { error: parseResult.error.message } }),
          parseResult.error,
        )
      }
      const parsed = parseResult.data
      if (core.module.requiresSharedState(process.env) && (parsed.type === 'local'))
        return err(HaiStorageError.CONFIG_ERROR, storageM('storage_sharedBackendRequired'))

      const provider = createProvider(parsed)
      pendingProvider = provider
      const connectResult = await provider.connect(parsed)
      if (!connectResult.success) {
        logger.error('Storage module initialization failed', {
          code: connectResult.error.code,
          message: connectResult.error.message,
        })
        return await failInitialization(connectResult)
      }
      pendingProvider = null
      currentProvider = provider
      currentConfig = parsed
      logger.info('Storage module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('Storage module initialization failed', { error })
      return await failInitialization(err(
        HaiStorageError.CONNECTION_FAILED,
        storageM('storage_operationFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        error,
      ))
    }
    finally {
      initInProgress = false
      initCompletion = null
      resolveInit()
    }
  },

  /** 文件操作接口。未初始化时所有方法返回 NOT_INITIALIZED 错误 */
  get file(): FileOperations { return currentProvider?.file ?? notInitializedFile },

  /** 目录操作接口。未初始化时所有方法返回 NOT_INITIALIZED 错误 */
  get dir(): DirOperations { return currentProvider?.dir ?? notInitializedDir },

  /** 签名 URL 操作接口。未初始化时 publicUrl 返回 null，其余返回错误 */
  get presign(): PresignOperations { return currentProvider?.presign ?? notInitializedPresign },

  /** 当前脱敏后的存储配置快照；未初始化或已关闭时为 null */
  get config() {
    return currentConfig ? core.sanitize.sanitizeSensitiveFields(currentConfig) : null
  },

  /** 是否已完成初始化 */
  get isInitialized() { return currentProvider !== null && currentProvider.isConnected() },

  /**
   * 关闭存储连接并释放资源
   *
   * 关闭后 file/dir/presign 操作将返回 NOT_INITIALIZED 错误。
   * 等待初始化并合并并发关闭；失败时保留资源供 close/init 重试。
   * @returns 所有客户端释放成功才返回成功。
   * @example
   * const closed = await storage.close()
   * if (!closed.success) await storage.close()
   */
  async close(): Promise<HaiResult<void>> {
    if (!closingPromise) {
      closingPromise = (async () => {
        if (initCompletion)
          await initCompletion
        return await closeOwnedProvider()
      })().finally(() => { closingPromise = null })
    }
    return await closingPromise
  },
}
