import type { HaiResult } from '@h-ai/core'
import type { ToolServiceContext } from './tools-invocation-types.js'

/**
 * 宿主验证所有权之后返回的文件或产物。
 * @example
 * ```ts
 * import type { ToolArtifact } from '@h-ai/tools/server'
 * function size(file: ToolArtifact) { return file.data.byteLength }
 * ```
 */
export interface ToolArtifact {
  id: string
  name: string
  mediaType: string
  data: Uint8Array
  kind?: string
  version?: number
}

/**
 * 业务资源引用，大文件字节不进入任务结果。
 * @example
 * ```ts
 * import type { ToolArtifactReference } from '@h-ai/tools/server'
 * function id(reference: ToolArtifactReference) { return reference.id }
 * ```
 */
export interface ToolArtifactReference {
  id: string
  title: string
  kind: string
  version: number
  mediaType: string
}

/**
 * 授权文件读写由宿主复核主体、任务、版本和最终提交条件。
 * @example
 * ```ts
 * import type { ToolArtifactAccess } from '@h-ai/tools/server'
 * function reader(access: ToolArtifactAccess) { return access.read }
 * ```
 */
export interface ToolArtifactAccess {
  read: (context: ToolServiceContext, input: { id: string }) => Promise<HaiResult<ToolArtifact>>
  publish: (context: ToolServiceContext, input: { name: string, kind: string, mediaType: string, data: Uint8Array, id?: string }) => Promise<HaiResult<ToolArtifactReference>>
  save?: (context: ToolServiceContext, input: { id: string, baseVersion: number, content: string }) => Promise<HaiResult<ToolArtifactReference>>
}
