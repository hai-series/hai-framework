/** Windows 构建日志使用 CRLF，避免 Linux 工具的 LF 在终端中产生阶梯式缩进。 */
import type { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'

/**
 * 规范构建输出，保留 UTF-8、已有 CRLF、警告与颜色序列。
 * @returns 支持背压的换行转换流；跨数据块的 CRLF 不重复添加 CR。
 * @example 模块内部上下文
 * ```ts
 * const output = createWindowsBuildOutput()
 * output.end('Progress: resolved 1\n')
 * ```
 */
function createWindowsBuildOutput(): Transform {
  const decoder = new StringDecoder('utf8')
  let previousCarriageReturn = false
  const normalize = (value: string): string => {
    const result = value.replace(/\n/g, (newline, offset: number) => (offset === 0 ? previousCarriageReturn : value[offset - 1] === '\r') ? newline : '\r\n')
    if (value.length)
      previousCarriageReturn = value.endsWith('\r')
    return result
  }
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      callback(null, normalize(decoder.write(chunk)))
    },
    flush(callback) {
      callback(null, normalize(decoder.end()))
    },
  })
}

/**
 * 转发 Windows 构建日志，等待输出写完，不关闭宿主终端流。
 * @param source - 当前子进程的标准输出或错误流。
 * @param destination - 宿主进程的对应输出流。
 * @returns 所有 UTF-8 文本与换行转发完成。
 * @example 模块内部上下文
 * ```ts
 * const input = createWindowsBuildOutput()
 * input.end('Progress: resolved 1\n')
 * await forwardWindowsBuildOutput(input, new Writable({ write(_chunk, _encoding, done) { done() } }))
 * ```
 */
export async function forwardWindowsBuildOutput(source: Readable, destination: Writable): Promise<void> {
  // 包装写入端，避免 pipeline 关闭终端或在多次构建后留下终端事件监听器。
  const forwarding = new Writable({
    write(chunk: Buffer, encoding, callback) {
      destination.write(chunk, encoding, callback)
    },
  })
  await pipeline(source, createWindowsBuildOutput(), forwarding)
}
