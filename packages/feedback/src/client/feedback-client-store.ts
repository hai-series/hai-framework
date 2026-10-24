import type { FeedbackEvidenceInput } from '@h-ai/api-contract/feedback'
import type { FeedbackDraft } from './feedback-client-types.js'

const STORE = 'drafts'

/** 每个应用只保存一份有期限的脱敏现场，关闭窗口不自动丢弃待传材料。 */
async function withStore<T>(callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('hai-feedback-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      const request = callback(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }
  finally {
    database.close()
  }
}

/**
 * 保存已脱敏且有期限的待传现场。
 * @example 模块内部上下文
 * ```ts
 * async function persist(draft: FeedbackDraft) { await saveFeedbackDraft('orders:user-1', draft) }
 * ```
 */
export async function saveFeedbackDraft(appId: string, draft: FeedbackDraft): Promise<void> {
  await withStore(store => store.put(draft, appId))
}

/**
 * 读取同一身份范围的本机现场，过期数据立即清理。
 * @example 模块内部上下文
 * ```ts
 * const draft = await restoreFeedbackDraft('orders:user-1')
 * ```
 */
export async function restoreFeedbackDraft(appId: string): Promise<FeedbackDraft | undefined> {
  const value: unknown = await withStore(store => store.get(appId))
  if (!value || typeof value !== 'object' || !('expiresAt' in value) || typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now()) {
    await withStore(store => store.delete(appId))
    return undefined
  }
  // 本机存储仍视为不可信，完整 schema 由调用方恢复前再次验证。
  return value as FeedbackDraft
}

/**
 * 持久化确认成功后删除草稿及旧检查点。
 * @example 模块内部上下文
 * ```ts
 * await deleteFeedbackDraft('orders:user-1')
 * ```
 */
export async function deleteFeedbackDraft(appId: string): Promise<void> {
  await withStore((store) => {
    store.delete(`${appId}:checkpoint`)
    return store.delete(appId)
  })
}

/**
 * 授权持久化时保存崩溃前的脱敏记录。
 * @example 模块内部上下文
 * ```ts
 * await saveFeedbackCheckpoint('orders:user-1', [])
 * ```
 */
export async function saveFeedbackCheckpoint(key: string, evidence: readonly FeedbackEvidenceInput[]): Promise<void> {
  await withStore(store => store.put({ evidence, expiresAt: Date.now() + 300_000 }, `${key}:checkpoint`))
}

/**
 * 恢复检查点，调用方仍须验证结构和期限。
 * @example 模块内部上下文
 * ```ts
 * const checkpoint = await restoreFeedbackCheckpoint('orders:user-1')
 * ```
 */
export async function restoreFeedbackCheckpoint(key: string): Promise<unknown> {
  return withStore(store => store.get(`${key}:checkpoint`))
}
