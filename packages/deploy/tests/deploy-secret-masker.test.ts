/** 跨字符/UTF-8数据块秘密、输出尾部与异常结果均经过同一保密边界。 */
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { maskSecrets, runCommand } from '../src/container/deploy-command.js'
import { createSecretMasker } from '../src/container/deploy-secret-masker.js'

const secret = '密钥🔑/private.+?token'

describe('stream secret masking', () => {
  it('在每个可能切分点分块，输出顺序完整且无秘密', () => {
    const text = `before:${secret}:middle:${secret}:after`
    for (let split = 0; split <= text.length; split++) {
      const stream = createSecretMasker([secret])
      const emitted = stream.write(text.slice(0, split)) + stream.write(text.slice(split)) + stream.end()
      expect(emitted).toBe('before:***:middle:***:after')
      expect(stream.end()).toBe('')
    }
  })

  it('逐字符、多重叠/前缀秘密、换行和正则元字符不发生尾部原文泄漏', () => {
    for (const secrets of [[secret, 'private'], ['ab', 'abcdef', 'bcd'], ['x\ny', '***private', '.+?']]) {
      const text = `${secrets.join('|')}:plain`
      const stream = createSecretMasker(secrets)
      const parts = [...text].map(character => stream.write(character))
      parts.push(stream.end())
      const masked = parts.join('')
      for (const item of secrets)
        expect(masked).not.toContain(item)
      expect(masked.endsWith(':plain')).toBe(true)
    }
    expect(maskSecrets('overlap=abcdef', ['ab', 'abcdef'])).toBe('overlap=***')
  })

  it('正常Unicode输出在每次回调独立UTF8编码后仍完整', () => {
    const stream = createSecretMasker(['unused-secret-long'])
    const text = '🔑🌏中文'.repeat(10)
    const pieces = [...text].map(character => stream.write(character))
    pieces.push(stream.end())
    expect(Buffer.concat(pieces.map(piece => Buffer.from(piece))).toString('utf8')).toBe(text)
  })

  it('超限配置失败关闭，不把正则错误中的秘密传给调用方', async () => {
    const tooLarge = 'private-token'.repeat(100000)
    const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("should-not-run")'], { secrets: [tooLarge] })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private-token')
  })

  it('真实子进程逐UTF8字节输出时，回调与成功结果完整脱敏', async () => {
    const output: string[] = []
    const code = `const value=Buffer.from(${JSON.stringify(`前:${secret}:后`)});let n=0;const t=setInterval(()=>{if(n===value.length){clearInterval(t);return}process.stdout.write(value.subarray(n,n+1));n++},3)`
    const result = await runCommand(process.execPath, ['-e', code], { secrets: [secret], onOutput: (part) => {
      output.push(part)
    } })
    expect(result.success).toBe(true)
    if (!result.success)
      throw new Error('Command failed')
    expect(output.join('')).toBe('前:***:后')
    expect(result.data.stdout).toBe('前:***:后')
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  // 三种独立失败分别保留默认时限，避免把 Windows Job 启动和退出核验成本累计到一个用例。
  it.each(['exit', 'spawn', 'output'] as const)('真实 %s 失败结果不带秘密原文或cause', async (kind) => {
    const command = kind === 'spawn' ? `hai-missing-${secret}` : process.execPath
    const args = kind === 'exit' ? ['-e', `process.stderr.write(${JSON.stringify(secret)});process.exit(4)`] : kind === 'output' ? ['-e', 'process.stdout.write("public")'] : []
    const result = await runCommand(command, args, { secrets: [secret], ...(kind === 'output'
      ? { onOutput: () => {
          throw new Error(secret)
        } }
      : {}) })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain(secret)
    if (!result.success)
      expect(result.error.cause).toBeUndefined()
  })

  it('异步回调在进程关闭后拒绝仍返回失败且不泄漏异常cause', async () => {
    const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("public")'], { secrets: [secret], onOutput: async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      throw new Error(secret)
    } })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('异步慢回调等待结束并按顺序交付，不提前报告成功', async () => {
    const pieces: string[] = []
    const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("abc".repeat(100000))'], { maxCaptureChars: 1024, onOutput: async (output) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      pieces.push(output)
    } })
    expect(result.success).toBe(true)
    expect(pieces.join('')).toBe('abc'.repeat(100000))
  })

  it('大输出捕获有界且明确截断，回调仍完整按序交付安全文本', async () => {
    let streamed = 0
    const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(200000));process.stderr.write("y".repeat(200000))'], { maxCaptureChars: 1024, onOutput: (output) => {
      streamed += output.length
    } })
    expect(result.success).toBe(true)
    if (!result.success)
      throw new Error('Command failed')
    expect(streamed).toBe(200000)
    expect(result.data).toMatchObject({ stdout: 'x'.repeat(1024), stderr: 'y'.repeat(1024), stdoutTruncated: true, stderrTruncated: true })
  })
})
