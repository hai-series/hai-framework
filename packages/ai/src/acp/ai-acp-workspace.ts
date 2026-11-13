import { Buffer } from 'node:buffer'
import { ACPFailure } from './ai-acp-errors.js'

/**
 * 验证工作区快照，只把可信应用返回的有界普通文件传给 Runner。
 * @example 模块内部上下文
 * ```ts
 * const inputs = encodeWorkspaceSnapshot({ 'notes.txt': Buffer.from('notes') }, 64)
 * ```
 */
export function encodeWorkspaceSnapshot(snapshot: Readonly<Record<string, Uint8Array>>, scratchMiB: number): Record<string, string> {
  const files = Object.entries(snapshot)
  const maxBytes = Math.min(16, scratchMiB) * 1024 * 1024
  if (files.length > 8 || files.some(([name, bytes]) => !/^[a-zA-Z0-9][\w.-]{0,127}$/u.test(name) || !(bytes instanceof Uint8Array))
    || files.reduce((total, [, bytes]) => total + bytes.byteLength, 0) > maxBytes) {
    throw new ACPFailure('invalid', { parameter: 'workspaceId' })
  }
  return Object.fromEntries(files.map(([name, bytes]) => [
    name,
    Buffer.from(bytes).toString('base64'),
  ]))
}
