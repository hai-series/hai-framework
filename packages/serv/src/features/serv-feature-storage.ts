/**
 * @h-ai/serv — Storage 默认 procedures
 *
 * 基于 `@h-ai/storage` 提供开箱即用的 Storage procedures 实现：预签名 URL、列表、元数据、删除。
 *
 * 所有操作先验证路径，再调用应用提供的资源授权策略；未提供策略时拒绝访问。
 * 策略必须从已认证 session 确定用户/租户范围，不能信任客户端提供的前缀。
 * @module features/serv-feature-storage
 */

import type { HaiResult } from '@h-ai/core'
import type { StorageFunctions } from '@h-ai/storage'
import type { ServContext } from '../serv-context.js'
import type { ServMessageKey } from '../serv-i18n.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { getStorageKeyIssue, STORAGE_KEY_MAX_BYTES, StorageDeleteKeysSchema } from '@h-ai/storage/schemas'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'
import { validateInputOrFail } from '../serv-validation.js'
import { mapHaiResult } from './serv-feature-helpers.js'

const storageContract = apiContract.storage

function buildStorageKeyValidationFailure(
  field: string,
  locale: string,
  messageKey: ServMessageKey,
  params?: Record<string, string | number>,
): HaiResult<never> {
  const message = servM(messageKey, { locale, params })
  return err(
    HaiCommonError.VALIDATION_ERROR,
    servM('serv_validationFailed', { locale }),
    [{ field, message }],
  )
}

/**
 * 对业务层再次校验存储 key 是否安全。
 *
 * 与公开 Schema 共用规则，保留业务入口防线；后续仍必须执行授权和 Provider 防逃逸。
 */
function validateStorageKeyOrFail(key: string, locale: string, field: string = 'key'): HaiResult<string> {
  const issue = getStorageKeyIssue(key)
  if (issue === 'empty')
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyRequired')
  if (issue === 'tooLong') {
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyTooLong', {
      max: STORAGE_KEY_MAX_BYTES,
    })
  }
  if (issue === 'characters')
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyIllegalChars')
  if (issue === 'segments')
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyDotSegments')
  return ok(key)
}

function validateStorageKeysOrFail(keys: string[], locale: string): HaiResult<string[]> {
  const parsed = validateInputOrFail(StorageDeleteKeysSchema, keys, locale)
  if (!parsed.success)
    return parsed
  for (const [index, key] of keys.entries()) {
    const keyResult = validateStorageKeyOrFail(key, locale, `keys.${index}`)
    if (!keyResult.success)
      return keyResult
  }
  return ok(keys)
}

/**
 * 存储资源授权请求；批量操作只有全部资源获准后才会调用存储。
 *
 * @example
 * ```ts
 * const authorize = ({ context, keys }: StorageAccessRequest) => {
 *   const root = `users/${encodeURIComponent(context.session.userId)}/`
 *   return keys.every(key => key.startsWith(root))
 * }
 * ```
 */
export interface StorageAccessRequest {
  /** 操作类别；策略可分别授予读取、写入或删除权限。 */
  readonly operation: 'download' | 'upload' | 'list' | 'metadata' | 'delete' | 'deleteMany'
  /** 已通过认证的可信请求上下文。 */
  readonly context: AuthenticatedServContext
  /** 单项/批量 key；list 操作仅包含请求的 prefix，未提供 prefix 时为空字符串。 */
  readonly keys: readonly string[]
}

/**
 * Storage 默认 procedures 依赖。
 *
 * @example
 * ```ts
 * createStorageProcedures({
 *   storage,
 *   authorize: ({ context, keys }) => keys.every(key =>
 *     key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
 * })
 * ```
 */
export interface StorageProcedureDeps {
  readonly storage: StorageFunctions
  /** 必需的资源授权策略；返回 true 才允许执行，缺失策略时默认拒绝。 */
  readonly authorize: (request: StorageAccessRequest) => boolean | Promise<boolean>
}

interface PresignedResponse {
  readonly url: string
  readonly key: string
  readonly expiresAt?: Date
}

/**
 * 创建具有认证、路径校验和资源授权的 Storage procedures。
 *
 * @param deps - 存储服务及必需的资源授权策略。
 * @returns 可挂载至 serv.createApp 的存储 router；拒绝访问返回 FORBIDDEN。
 * @example
 * ```ts
 * const procedures = createStorageProcedures({ storage, authorize: ({ context, keys }) =>
 *   keys.every(key => key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)) })
 * ```
 */
export function createStorageProcedures(deps: StorageProcedureDeps) {
  const { storage } = deps

  async function authorize(request: StorageAccessRequest): Promise<HaiResult<void>> {
    if (typeof deps.authorize !== 'function' || await deps.authorize(request) !== true)
      return err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: request.context.locale }))
    return ok(undefined)
  }

  return implement(storageContract)
    .context<ServContext>()

    .route('presignedUrls.createDownload')
    .auth()
    .handle(async ({ input, context }) => {
      const keyResult = validateStorageKeyOrFail(input.key, context.locale)
      if (!keyResult.success)
        return keyResult
      const access = await authorize({ context, operation: 'download', keys: [keyResult.data] })
      if (!access.success)
        return access
      const expiresIn = input.expiresIn ?? 900
      return toPresignedResult(
        keyResult.data,
        expiresIn,
        await storage.presign.getUrl(keyResult.data, { expiresIn }),
      )
    })

    .route('presignedUrls.createUpload')
    .auth()
    .handle(async ({ input, context }) => {
      const keyResult = validateStorageKeyOrFail(input.key, context.locale)
      if (!keyResult.success)
        return keyResult
      const access = await authorize({ context, operation: 'upload', keys: [keyResult.data] })
      if (!access.success)
        return access
      const expiresIn = input.expiresIn ?? 900
      const contentType = input.contentType ?? 'application/octet-stream'
      const { key: _, ...options } = input
      return toPresignedResult(
        keyResult.data,
        expiresIn,
        await storage.presign.putUrl(keyResult.data, { ...options, expiresIn, contentType }),
      )
    })

    .route('files.list')
    .auth()
    .handle(async ({ input, context }) => {
      const prefix = input.prefix ?? ''
      if (prefix) {
        const prefixResult = validateStorageKeyOrFail(prefix, context.locale, 'prefix')
        if (!prefixResult.success)
          return prefixResult
      }
      const access = await authorize({ context, operation: 'list', keys: [prefix] })
      if (!access.success)
        return access
      return storage.dir.list(input)
    })

    .route('files.getMetadata')
    .auth()
    .handle(async ({ input, context }) => {
      const keyResult = validateStorageKeyOrFail(input.key, context.locale)
      if (!keyResult.success)
        return keyResult
      const access = await authorize({ context, operation: 'metadata', keys: [keyResult.data] })
      if (!access.success)
        return access
      return storage.file.head(keyResult.data)
    })

    .route('files.delete')
    .auth()
    .handle(async ({ input, context }) => {
      const keyResult = validateStorageKeyOrFail(input.key, context.locale)
      if (!keyResult.success)
        return keyResult
      const access = await authorize({ context, operation: 'delete', keys: [keyResult.data] })
      if (!access.success)
        return access
      return storage.file.delete(keyResult.data)
    })

    .route('files.deleteMany')
    .auth()
    .handle(async ({ input, context }) => {
      const keysResult = validateStorageKeysOrFail(input.keys, context.locale)
      if (!keysResult.success)
        return keysResult
      const access = await authorize({ context, operation: 'deleteMany', keys: keysResult.data })
      if (!access.success)
        return access
      return storage.file.deleteMany(keysResult.data)
    })

    .build()
}

function toPresignedResult(
  key: string,
  expiresIn: number | undefined,
  result: HaiResult<string>,
): HaiResult<PresignedResponse> {
  return mapHaiResult(result, url => ({
    url,
    key,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
  }))
}
