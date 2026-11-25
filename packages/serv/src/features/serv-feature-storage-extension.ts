import type { HaiResult } from '@h-ai/core'
import type { StorageFunctions } from '@h-ai/storage'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract, STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'

/**
 * 文件中转的资源授权请求。上传策略也可检查文件的 MIME、扩展名或实际内容。
 * @example
 * ```ts
 * import type { StorageExtensionAccessRequest } from '@h-ai/serv'
 * function canAccess(request: StorageExtensionAccessRequest) {
 *   return request.keys[0].startsWith(`users/${request.context.session.userId}/`)
 * }
 * ```
 */
export type StorageExtensionAccessRequest = {
  readonly context: AuthenticatedServContext
  readonly keys: readonly [string]
} & ({ readonly operation: 'upload', readonly file: File } | { readonly operation: 'download' })

/**
 * 构造 Storage 中转 procedures 所需的存储操作与资源授权策略。
 * @example
 * ```ts
 * import type { StorageExtensionProcedureDeps } from '@h-ai/serv'
 * import { storage } from '@h-ai/storage'
 * const deps: StorageExtensionProcedureDeps = { storage, authorize: ({ context, keys }) => keys[0].startsWith(`users/${context.session.userId}/`) }
 * void deps
 * ```
 */
export interface StorageExtensionProcedureDeps {
  readonly storage: { readonly file: Pick<StorageFunctions['file'], 'put' | 'getStreamWithMetadata'> }
  /** 宿主应按可信用户或租户校验完整 key，仅返回 true 时允许访问。 */
  readonly authorize: (request: StorageExtensionAccessRequest) => boolean | Promise<boolean>
}

function fileTooLarge({ locale }: ServContext): HaiResult<never> {
  return core.err(
    { ...HaiCommonError.VALIDATION_ERROR, httpStatus: 413 },
    servM('serv_validationTooBig', {
      locale,
      params: { max: STORAGE_PROXY_MAX_FILE_BYTES },
    }),
  )
}

/**
 * 创建使用 multipart 上传和附件下载的小文件中转 procedures。
 * @param deps - 已初始化的 Storage 和来自宿主的资源授权策略。
 * @param deps.storage - 提供上传和有元数据读取能力的 Storage。
 * @param deps.authorize - 当前会话对完整对象 key 的资源授权策略。
 * @returns 与 `apiContract.extensions.storage` 对应的 router。宿主须通过 `transportRoutes` 配置二进制端点。
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage'
 * import { serv } from '@h-ai/serv'
 * const procedures = serv.createStorageExtensionProcedures({ storage, authorize: ({ context, keys }) => keys[0].startsWith(`users/${context.session.userId}/`) })
 * void procedures
 * ```
 */
export function createStorageExtensionProcedures({ storage, authorize }: StorageExtensionProcedureDeps) {
  async function checkAccess(request: StorageExtensionAccessRequest): Promise<HaiResult<void>> {
    if (typeof authorize !== 'function' || await authorize(request) !== true)
      return core.err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: request.context.locale }))
    return core.ok(undefined)
  }

  return implement(apiContract.extensions.storage)
    .context<ServContext>()
    .route('files.upload')
    .auth()
    .handleTransport(async ({ input: { key, file }, context }) => {
      const access = await checkAccess({
        context,
        operation: 'upload',
        keys: [key],
        file,
      })
      if (!access.success)
        return access
      return storage.file.put(key, new Uint8Array(await file.arrayBuffer()), {
        ifNoneMatch: '*',
        contentType: file.type || 'application/octet-stream',
        signal: context.request.signal,
      })
    })
    .route('files.download')
    .auth()
    .handleTransport(async ({ input: { key }, context }) => {
      const access = await checkAccess({
        context,
        operation: 'download',
        keys: [key],
      })
      if (!access.success)
        return access
      const opened = await storage.file.getStreamWithMetadata(key, { signal: context.request.signal })
      if (!opened.success)
        return opened
      const { metadata, stream, close } = opened.data
      try {
        if (metadata.size > STORAGE_PROXY_MAX_FILE_BYTES)
          return fileTooLarge(context)
        if (!Number.isSafeInteger(metadata.size) || metadata.size < 0)
          return core.err(HaiCommonError.INTERNAL_ERROR, servM('serv_errorInternal', { locale: context.locale }))
        const bytes = new Uint8Array(metadata.size)
        let read = 0
        for await (const chunk of stream) {
          if (read + chunk.byteLength > STORAGE_PROXY_MAX_FILE_BYTES)
            return fileTooLarge(context)
          if (read + chunk.byteLength > bytes.byteLength)
            return core.err(HaiCommonError.INTERNAL_ERROR, servM('serv_errorInternal', { locale: context.locale }))
          bytes.set(chunk, read)
          read += chunk.byteLength
        }
        if (read !== bytes.byteLength)
          return core.err(HaiCommonError.INTERNAL_ERROR, servM('serv_errorInternal', { locale: context.locale }))

        const name = key.split('/').at(-1) || 'download'
        return new File([bytes], name, { type: metadata.contentType || 'application/octet-stream' })
      }
      finally {
        await close()
      }
    })
    .build()
}
