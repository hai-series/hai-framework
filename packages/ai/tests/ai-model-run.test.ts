/** 本机运行的引擎与健康请求均使用本轮确定性夹具，不启动实际推理容器。 */
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { cmdRun } from '../models/build.mjs'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it.each(['docker', 'podman'])('本机模型%s只绑定loopback，认证仅以变量名传入且代理配置保留', async (engine) => {
  const key = 'synthetic-test-only-model-auth'
  vi.stubEnv('HAI_MODEL_API_KEY', key)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
  const command = vi.mocked(spawnSync).mockReturnValue({
    pid: 1,
    output: [null, '', ''],
    stdout: 'owned-model-container',
    stderr: '',
    status: 0,
    signal: null,
  })
  await cmdRun('faster-whisper-large-v3', [
    '--device',
    'cpu',
    '--engine',
    engine,
    '--port',
    '18101',
    '--container-proxy',
    'http://model-proxy.example.invalid:10808',
  ])
  const run = command.mock.calls.find(([, args]) => args?.[0] === 'run')
  expect(run?.[1]).toEqual(expect.arrayContaining([
    '-p',
    '127.0.0.1:18101:8000',
    '--env',
    'HAI_MODEL_API_KEY',
  ]))
  expect(run?.[1]?.some(argument => argument.includes(key))).toBe(false)
  expect(run?.[2]?.env?.HAI_MODEL_API_KEY).toBe(key)
  expect(run?.[1]).toContain('HTTP_PROXY=http://model-proxy.example.invalid:10808')
  if (engine === 'podman')
    expect(run?.[1]).toContain('--http-proxy=false')
  command.mockClear()
})
