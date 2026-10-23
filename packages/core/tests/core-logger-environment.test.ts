/** Windows TTY 初始化只能处理终端编码，不能覆盖调用方的语言/子进程协议。 */
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (original) => {
  const module = await original<typeof import('node:child_process')>()
  return { ...module, execSync: vi.fn() }
})

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  if (platformDescriptor)
    Object.defineProperty(process, 'platform', platformDescriptor)
  if (ttyDescriptor)
    Object.defineProperty(process.stdout, 'isTTY', ttyDescriptor)
  else
    Reflect.deleteProperty(process.stdout, 'isTTY')
})

it('模拟 Windows TTY 导入后保留显式语言和非 UTF-8 子进程协议', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
  vi.stubEnv('LANG', 'en_GB.UTF-8')
  vi.stubEnv('LC_ALL', 'en_US.UTF-8')
  vi.stubEnv('PYTHONIOENCODING', 'utf-16')
  await import('../src/functions/core-function-logger.node.js')
  expect(process.env.LANG).toBe('en_GB.UTF-8')
  expect(process.env.LC_ALL).toBe('en_US.UTF-8')
  expect(process.env.PYTHONIOENCODING).toBe('utf-16')
})

it('没有显式配置时不向子进程注入语言或编码变量', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
  vi.stubEnv('LANG', undefined)
  vi.stubEnv('LC_ALL', undefined)
  vi.stubEnv('PYTHONIOENCODING', undefined)
  await import('../src/functions/core-function-logger.node.js')
  expect(process.env.LANG).toBeUndefined()
  expect(process.env.LC_ALL).toBeUndefined()
  expect(process.env.PYTHONIOENCODING).toBeUndefined()
})
