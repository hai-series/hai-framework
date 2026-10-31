import { Buffer } from 'node:buffer'
import { Readable, Writable } from 'node:stream'
import { expect, it } from 'vitest'
import { forwardWindowsBuildOutput } from '../src/commands/cli-build-output.js'

async function output(chunks: Buffer[]): Promise<{ text: string, ended: boolean }> {
  const collected: Buffer[] = []
  const destination = new Writable({ write(chunk: Buffer, _encoding, callback) {
    collected.push(chunk)
    callback()
  } })
  await forwardWindowsBuildOutput(Readable.from(chunks), destination)
  const result = { text: Buffer.concat(collected).toString('utf8'), ended: destination.writableEnded }
  destination.end()
  return result
}

it('linux LF 与已有 Windows CRLF 都保持从首列开始，父输出流保持打开', async () => {
  const result = await output([Buffer.from('Progress: resolved 1286\n[WARN] Request took 10136ms\r\nerror: failed\n')])
  expect(result.text).toBe('Progress: resolved 1286\r\n[WARN] Request took 10136ms\r\nerror: failed\r\n')
  expect(result.ended).toBe(false)
})

it('连续转发多次不会增加宿主输出流的事件监听器', async () => {
  const destination = new Writable({
    write(_chunk, _encoding, callback) { callback() },
  })
  const before = destination.eventNames().map(name => [name, destination.listenerCount(name)])
  try {
    for (let index = 0; index < 20; index++)
      await forwardWindowsBuildOutput(Readable.from([Buffer.from('[WARN] download slow\n')]), destination)
    expect(destination.eventNames().map(name => [name, destination.listenerCount(name)])).toEqual(before)
    expect(destination.writableEnded).toBe(false)
  }
  finally {
    destination.end()
  }
})

it('跨数据块的 CRLF、UTF-8 和 ANSI 颜色不损坏', async () => {
  const utf8 = Buffer.from('警告')
  const result = await output([Buffer.from('first\r'), utf8.subarray(0, 0), Buffer.from('\n\u001B[33m'), utf8.subarray(0, 2), utf8.subarray(2), Buffer.from('\u001B[0m\nlast')])
  expect(result.text).toBe('first\r\n\u001B[33m警告\u001B[0m\r\nlast')
})

it('子进程输出失败会报告错误，宿主输出流仍可继续使用', async () => {
  const destination = new Writable({
    write(_chunk, _encoding, callback) { callback() },
  })
  const source = new Readable({
    read() { this.destroy(new Error('output failed')) },
  })
  try {
    await expect(forwardWindowsBuildOutput(source, destination)).rejects.toThrow('output failed')
    expect(destination.destroyed).toBe(false)
    await forwardWindowsBuildOutput(Readable.from([Buffer.from('next build\n')]), destination)
  }
  finally {
    destination.end()
  }
})
