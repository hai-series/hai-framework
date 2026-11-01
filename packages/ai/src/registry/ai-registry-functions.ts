import type { z } from 'zod'
import type { AIRelStore } from '../store/ai-store-types.js'
import type {
  AIResourceEntry,
  AIResourceRegistry,
} from './ai-registry-types.js'
import { err, ok } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

/**
 * 内部资源记录；旧的普通记录仍可读取，删除后保留 CAS 版本。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const record: ResourceRecord<{ id: string }> = { id: 'gone', __deleted: true }
 * ```
 */
export type ResourceRecord<T> = T & { __deleted?: boolean }

/**
 * 合并配置和数据库资源；每次读取实时访问 Store，不用本机缓存模拟共享状态。
 * @param store - 在模块统一 initialize 前创建的资源表。
 * @param schema - 资源配置校验器。
 * @param configured - 初始化配置中的只读资源。
 * @param isOpen - 捕获模块关闭后拒绝旧句柄。
 * @returns 内部读取函数和返回 HaiResult 的公共清单。
 * @example
 * ```ts
 * // 模块内部上下文。
 * function catalog<T extends { id: string }>(store: AIRelStore<ResourceRecord<T>>, schema: z.ZodType<T>, configured: T[]) { return createResourceRegistry(store, schema, configured, () => true).operations }
 * ```
 */
export function createResourceRegistry<T extends { id: string }, Input = T>(
  store: AIRelStore<ResourceRecord<T>>,
  schema: z.ZodType<T, Input>,
  configured: T[],
  isOpen: () => boolean,
) {
  const config = new Map(
    configured.map(item => [item.id, structuredClone(item)]),
  )
  if (config.size !== configured.length)
    throw new Error('Duplicate configuration resource ID')
  const copy = (record: ResourceRecord<T>): T => {
    const { __deleted: _deleted, ...value } = record
    // 仅移除内部墓碑标记；其余字段仍是经 schema 校验的 T。
    return structuredClone(value) as T
  }
  function ensure() {
    if (!isOpen())
      throw new Error('Resource registry closed')
  }
  async function read(id: string): Promise<AIResourceEntry<T> | undefined> {
    ensure()
    const fixed = config.get(id)
    if (fixed)
      return { value: structuredClone(fixed), source: 'config' }
    const saved = await store.readVersioned(id)
    return saved && !saved.data.__deleted
      ? { value: copy(saved.data), source: 'database', version: saved.version }
      : undefined
  }
  async function entries(): Promise<AIResourceEntry<T>[]> {
    ensure()
    const saved = await store.query({})
    return [
      ...[...config.values()].map(value => ({
        value: structuredClone(value),
        source: 'config' as const,
      })),
      ...saved
        .filter(item => !item.__deleted && !config.has(item.id))
        .map(item => ({ value: copy(item), source: 'database' as const })),
    ]
  }
  async function protect<R>(operation: () => Promise<R>) {
    if (!isOpen())
      return err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
    try {
      return ok(await operation())
    }
    catch {
      return err(
        HaiAIError.RESOURCE_OPERATION_FAILED,
        aiM('ai_resourceOperationFailed'),
      )
    }
  }
  async function write(
    input: Input,
    update: boolean,
    expectedVersion?: string,
  ) {
    if (!isOpen())
      return err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
    const parsed = schema.safeParse(input)
    if (!parsed.success || !parsed.data.id)
      return err(HaiAIError.RESOURCE_INVALID, aiM('ai_resourceInvalid'))
    const value = parsed.data
    if (config.has(value.id))
      return err(HaiAIError.RESOURCE_READ_ONLY, aiM('ai_resourceReadOnly'))
    try {
      const previous = await store.readVersioned(value.id)
      const exists = previous && !previous.data.__deleted
      if (update && !exists)
        return err(HaiAIError.RESOURCE_NOT_FOUND, aiM('ai_resourceNotFound'))
      if (
        (!update && exists)
        || (expectedVersion !== undefined && expectedVersion !== previous?.version)
      ) {
        return err(HaiAIError.RESOURCE_CONFLICT, aiM('ai_resourceConflict'))
      }
      const version = await store.compareAndSwap(value.id, {
        expectedVersion: previous?.version,
        data: value,
      })
      if (!version)
        return err(HaiAIError.RESOURCE_CONFLICT, aiM('ai_resourceConflict'))
      return ok({
        value: structuredClone(value),
        source: 'database' as const,
        version,
      })
    }
    catch {
      return err(
        HaiAIError.RESOURCE_OPERATION_FAILED,
        aiM('ai_resourceOperationFailed'),
      )
    }
  }
  const operations: AIResourceRegistry<T, Input> = {
    list: () => protect(entries),
    get: async (id) => {
      const result = await protect(() => read(id))
      if (!result.success)
        return result
      return result.data
        ? ok(result.data)
        : err(HaiAIError.RESOURCE_NOT_FOUND, aiM('ai_resourceNotFound'))
    },
    register: input => write(input, false),
    update: (input, version) => write(input, true, version),
    remove: async (id, expectedVersion) => {
      if (!isOpen())
        return err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
      if (config.has(id))
        return err(HaiAIError.RESOURCE_READ_ONLY, aiM('ai_resourceReadOnly'))
      try {
        const previous = await store.readVersioned(id)
        if (!previous || previous.data.__deleted)
          return err(HaiAIError.RESOURCE_NOT_FOUND, aiM('ai_resourceNotFound'))
        if (
          expectedVersion !== undefined
          && expectedVersion !== previous.version
        ) {
          return err(HaiAIError.RESOURCE_CONFLICT, aiM('ai_resourceConflict'))
        }
        if (
          !(await store.compareAndSwap(id, {
            expectedVersion: previous.version,
            data: { ...previous.data, __deleted: true },
          }))
        ) {
          return err(HaiAIError.RESOURCE_CONFLICT, aiM('ai_resourceConflict'))
        }
        return ok(undefined)
      }
      catch {
        return err(
          HaiAIError.RESOURCE_OPERATION_FAILED,
          aiM('ai_resourceOperationFailed'),
        )
      }
    },
  }
  return {
    operations,
    read,
    entries,
    values: async () => (await entries()).map(entry => entry.value),
  }
}
