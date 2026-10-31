/** 用真实 Shell/awk 验证容器解析器生成，不依赖宿主 Docker 或固定网络地址。 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { createProxyStartupScript } from '../src/container/deploy-proxy-start.js'

const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh'

describe.skipIf(!existsSync(shell))('proxy startup resolver preparation', () => {
  it.each([
    ['nameserver 10.89.0.1\n', 'resolver 10.89.0.1 valid=5s;\nresolver_timeout 5s;\n'],
    ['# engine DNS\nnameserver 127.0.0.11\nnameserver fd00::53\n', 'resolver 127.0.0.11 [fd00::53] valid=5s;\nresolver_timeout 5s;\n'],
    ['# no resolver\n', undefined],
    ['nameserver dns.example.test\n', undefined],
    ['nameserver 10.89.0.1;invalid\n', undefined],
  ] as const)('实际解析 %s', (source, expected) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'hai-proxy-dns-'))
    if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('hai-proxy-dns-'))
      throw new Error('Unexpected DNS fixture cleanup path')
    try {
      const input = path.join(directory, 'resolv.conf')
      const output = path.join(directory, 'nginx.conf')
      writeFileSync(input, source)
      const preparation = createProxyStartupScript(false)
        .replace('/etc/resolv.conf', '"$1"')
        .replace('/tmp/hai-dns.conf', '"$2"')
      const result = spawnSync(shell, ['-c', preparation, 'hai-proxy-dns', input.replaceAll('\\', '/'), output.replaceAll('\\', '/')], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
      expect(result.error).toBeUndefined()
      if (expected === undefined) {
        expect(result.status).not.toBe(0)
      }
      else {
        expect(result.status, result.stderr).toBe(0)
        expect(readFileSync(output, 'utf8')).toBe(expected)
      }
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
