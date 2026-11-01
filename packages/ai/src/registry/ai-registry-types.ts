import type { HaiResult } from '@h-ai/core'
import type { z } from 'zod'
import type {
  AudioModelEntrySchema,
  ImageModelEntrySchema,
  MCPExternalServerSchema,
  ModelEntrySchema,
  RetrievalSourceSchema,
} from '../ai-config.js'
import type { AudioOperations } from '../audio/ai-audio-types.js'
import type { ImageOperations } from '../image/ai-image-types.js'
import type { LLMOperations } from '../llm/ai-llm-types.js'
import type { MCPOperations } from '../mcp/ai-mcp-types.js'
import type { RetrievalOperations } from '../retrieval/ai-retrieval-types.js'

/**
 * 清单项与来源；配置来源不可修改，version 仅用于数据库乐观并发更新。
 * @example
 * ```ts
 * import type { AIResourceEntry, ModelEntry } from '@h-ai/ai'
 * function editable(entry: AIResourceEntry<ModelEntry>) { return entry.source === 'database' }
 * ```
 */
export interface AIResourceEntry<T> {
  /** 原始配置；返回独立副本，修改副本不会修改清单。 */
  value: T
  /** config 来自初始化配置，database 来自 AIStoreProvider。 */
  source: 'config' | 'database'
  /** get 返回的数据库版本；更新/删除时可传回以拒绝过期写入。 */
  version?: string
}

/**
 * 配置与数据库合并的资源清单。相同 ID 配置优先，配置记录永不写回数据库。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * async function listModels() { const result = await ai.llm.models.list(); if (!result.success) return result; return result.data.map(item => ({ id: item.value.id, source: item.source })) }
 * ```
 */
export interface AIResourceRegistry<T, Input = T> {
  /**
   * 读取合并清单；保留配置顺序，追加未被遮蔽的数据库项。
   * @returns 包含 value/source 的去重列表；列表项无数据库版本。
   * @example
   * ```ts
   * import { ai } from '@h-ai/ai'
   * const result = await ai.llm.models.list()
   * if (result.success) { const entries = result.data }
   * ```
   */
  list: () => Promise<HaiResult<AIResourceEntry<T>[]>>
  /**
   * 按 ID 读取来源、配置和数据库版本。
   * @param id - 资源 ID。
   * @returns 包含 value/source/version 的资源条目，未找到时返回失败。
   * @example
   * ```ts
   * import { ai } from '@h-ai/ai'
   * const result = await ai.llm.models.get('coding')
   * if (result.success) { const source = result.data.source }
   * ```
   */
  get: (id: string) => Promise<HaiResult<AIResourceEntry<T>>>
  /**
   * 新建数据库记录；ID 已存在或属于配置时拒绝。
   * @param input - 完整资源配置。
   * @returns 新建条目及版本的 HaiResult，配置同 ID 返回只读错误。
   * @example
   * ```ts
   * import { ai } from '@h-ai/ai'
   * const result = await ai.llm.models.register({ id: 'coding', model: 'example-model', protocol: 'responses' })
   * if (!result.success) { const code = result.error.code }
   * ```
   */
  register: (input: Input) => Promise<HaiResult<AIResourceEntry<T>>>
  /**
   * 完整替换数据库记录；配置来源只读。版本不匹配时不写入。
   * @param input - 同 ID 的完整新配置。
   * @param expectedVersion - 可选的 get 版本。
   * @returns 替换后的条目及版本；过期版本返回资源冲突。
   * @example
   * ```ts
   * import { ai } from '@h-ai/ai'
   * const current = await ai.llm.models.get('coding')
   * if (current.success && current.data.source === 'database') {
   *   const result = await ai.llm.models.update({ ...current.data.value, temperature: 0.2 }, current.data.version)
   *   if (!result.success) { const code = result.error.code }
   * }
   * ```
   */
  update: (
    input: Input,
    expectedVersion?: string,
  ) => Promise<HaiResult<AIResourceEntry<T>>>
  /**
   * 删除数据库记录，采用 CAS 墓碑避免与并发更新相互覆盖；不删除外部文件。
   * @param id - 资源 ID。
   * @param expectedVersion - 可选的 get 版本。
   * @returns 删除完成的 HaiResult；配置只读、版本冲突或记录不存在时失败。
   * @example
   * ```ts
   * import { ai } from '@h-ai/ai'
   * const result = await ai.llm.models.remove('temporary')
   * if (!result.success) { const code = result.error.code }
   * ```
   */
  remove: (id: string, expectedVersion?: string) => Promise<HaiResult<void>>
}

/**
 * 包含配置/数据库资源维护的 llm 操作接口。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * const result = await ai.llm.models.list()
 * if (result.success) { const resources = result.data }
 * ```
 */
export interface ManagedLLMOperations extends LLMOperations {
  /** 配置只读、数据库可维护的合并清单。 */
  models: AIResourceRegistry<
    z.output<typeof ModelEntrySchema>,
    z.input<typeof ModelEntrySchema>
  >
}

/**
 * 包含配置/数据库资源维护的 audio 操作接口。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * const result = await ai.audio.models.list()
 * if (result.success) { const resources = result.data }
 * ```
 */
export interface ManagedAudioOperations extends AudioOperations {
  /** 配置只读、数据库可维护的合并清单。 */
  models: AIResourceRegistry<
    z.output<typeof AudioModelEntrySchema>,
    z.input<typeof AudioModelEntrySchema>
  >
}

/**
 * 包含配置/数据库资源维护的 image 操作接口。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * const result = await ai.image.models.list()
 * if (result.success) { const resources = result.data }
 * ```
 */
export interface ManagedImageOperations extends ImageOperations {
  /** 配置只读、数据库可维护的合并清单。 */
  models: AIResourceRegistry<
    z.output<typeof ImageModelEntrySchema>,
    z.input<typeof ImageModelEntrySchema>
  >
}

/**
 * 包含配置/数据库资源维护的 mcp 操作接口。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * const result = await ai.mcp.servers.list()
 * if (result.success) { const resources = result.data }
 * ```
 */
export interface ManagedMCPOperations extends MCPOperations {
  /** 配置只读、数据库可维护的合并清单。 */
  servers: AIResourceRegistry<
    z.output<typeof MCPExternalServerSchema>,
    z.input<typeof MCPExternalServerSchema>
  >
}

/**
 * 包含配置/数据库资源维护的 retrieval 操作接口。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * const result = await ai.retrieval.sources.list()
 * if (result.success) { const resources = result.data }
 * ```
 */
export interface ManagedRetrievalOperations extends RetrievalOperations {
  /** 配置只读、数据库可维护的合并清单。 */
  sources: AIResourceRegistry<
    z.output<typeof RetrievalSourceSchema>,
    z.input<typeof RetrievalSourceSchema>
  >
}
