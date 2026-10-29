import { afterEach, describe, expect, it, vi } from 'vitest'

const originalArgv = process.argv
afterEach(() => {
  process.argv = originalArgv
  vi.doUnmock('node:fs/promises')
  vi.resetModules()
})

describe('应用环境说明跨文件系统一致性', () => {
  it.each(['forward', 'reverse'])('目录枚举为%s时公开示例仍与仓库一致，检查不写文件', async (order) => {
    vi.resetModules()
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        readdir: async (...args) => {
          const entries = await actual.readdir(...args)
          return order === 'reverse' ? entries.reverse() : entries
        },
        readFile: async (file, ...args) => {
          if (String(file).endsWith('.env.local'))
            throw new Error('Environment documentation must not read private dotenv files')
          return actual.readFile(file, ...args)
        },
        writeFile: () => {
          throw new Error('Environment check must not write files')
        },
      }
    })
    process.argv = [...originalArgv, '--check']
    await expect(import('../generate-app-env.mjs')).resolves.toBeDefined()
  })
})
