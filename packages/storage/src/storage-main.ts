/**
 * @h-ai/storage — 存储服务主入口
 *
 * 提供统一的 `storage` 对象，管理运行时状态与生命周期。
 * @module storage-main
 */

import type { HaiResult } from '@h-ai/core'
import type { StorageConfig, StorageConfigInput } from './storage-config.js'
import type { DirOperations, FileOperations, PresignOperations, StorageFunctions, StorageProvider } from './storage-types.js'

import { core, err, ok } from '@h-ai/core'

import { createLocalProvider } from './providers/storage-provider-local.js'
import { createS3Provider } from './providers/storage-provider-s3.js'
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
    if (initInProgress) {
      logger.warn('Storage init already in progress, skipping concurrent call')
      return err(
        HaiStorageError.OPERATION_FAILED,
        storageM('storage_operationFailed', { params: { error: 'Concurrent initialization detected' } }),
      )
    }
    initInProgress = true

    try {
      if (currentProvider) {
        logger.warn('Storage module is already initialized, reinitializing')
        await storage.close()
      }

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

      const provider = createProvider(parsed)
      const connectResult = await provider.connect(parsed)
      if (!connectResult.success) {
        logger.error('Storage module initialization failed', {
          code: connectResult.error.code,
          message: connectResult.error.message,
        })
        return connectResult
      }
      currentProvider = provider
      currentConfig = parsed
      logger.info('Storage module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('Storage module initialization failed', { error })
      return err(
        HaiStorageError.CONNECTION_FAILED,
        storageM('storage_operationFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        error,
      )
    }
    finally {
      initInProgress = false
    }
  },

  /** 文件操作接口。未初始化时所有方法返回 NOT_INITIALIZED 错误 */
  get file(): FileOperations { return currentProvider?.file ?? notInitializedFile },

  /** 目录操作接口。未初始化时所有方法返回 NOT_INITIALIZED 错误 */
  get dir(): DirOperations { return currentProvider?.dir ?? notInitializedDir },

  /** 签名 URL 操作接口。未初始化时 publicUrl 返回 null，其余返回错误 */
  get presign(): PresignOperations { return currentProvider?.presign ?? notInitializedPresign },

  /** 当前解析后的存储配置；未初始化或已关闭时为 null */
  get config() { return currentConfig },

  /** 是否已完成初始化 */
  get isInitialized() { return currentProvider !== null },

  /**
   * 关闭存储连接并释放资源
   *
   * 关闭后 file/dir/presign 操作将返回 NOT_INITIALIZED 错误。
   * 重复调用不会报错。
   */
  async close() {
    if (!currentProvider) {
      currentConfig = null
      logger.info('Storage module already closed, skipping')
      return
    }

    logger.info('Closing storage module')

    try {
      await currentProvider.close()
      logger.info('Storage module closed')
    }
    catch (error) {
      logger.error('Storage module close failed', { error })
    }
    finally {
      currentProvider = null
      currentConfig = null
    }
  },
}
