/** A2A 测试以真实 ProtoJSON 请求进入，并显式解码 SDK 的原生响应。 */
import { Message, Task } from '@a2a-js/sdk'

export interface WireSendMessageRequest {
  message: { messageId: string, role: string, parts: Record<string, unknown>[], taskId?: string, contextId?: string, referenceTaskIds?: string[] }
  configuration?: { returnImmediately?: boolean }
}

export function decodeA2AResult(value: unknown): Task | Message {
  if (!value || typeof value !== 'object')
    throw new Error('Missing A2A result')
  const record = value as Record<string, unknown>
  if (record.task)
    return Task.fromJSON(record.task)
  if (record.message)
    return Message.fromJSON(record.message)
  return 'messageId' in record
    ? Message.fromJSON(record)
    : Task.fromJSON(record)
}
