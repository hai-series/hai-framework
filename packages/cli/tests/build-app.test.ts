import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { buildMobileApp } from '../src/commands/cli-build-app.js'

let root: string | undefined
afterEach(async () => {
  if (root)
    await rm(root, { recursive: true, force: true })
  root = undefined
})
async function project() {
  root = await mkdtemp(join(tmpdir(), 'hai-native-app-'))
  const directory = join(root, 'apps/app')
  await mkdir(join(directory, 'android/app/src/main/assets'), { recursive: true })
  await writeFile(join(directory, 'capacitor.config.ts'), 'export default {}')
  await writeFile(join(directory, 'android/app/src/main/assets/capacitor.config.json'), '{}')
  return directory
}
it('缺平台工程时不执行同步；成功同步也不能当作 APK 打包成功', async () => {
  const directory = await project()
  const run = vi.fn(async (_args: string[], _cwd: string) => {})
  await expect(buildMobileApp(root!, ['apps/missing'], 'android', run)).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
  await expect(buildMobileApp(root!, ['apps/app'], 'android', run)).rejects.toThrow()
  expect(run).toHaveBeenCalledWith(['exec', 'cap', 'build', 'android', '--androidreleasetype', 'APK'], directory)
})
it('发布工程含热更新 URL 时拒绝原生打包；有效新 APK 返回实际文件', async () => {
  const directory = await project()
  const config = join(directory, 'android/app/src/main/assets/capacitor.config.json')
  await writeFile(config, JSON.stringify({ server: { url: 'http://dev.example.test' } }))
  const run = vi.fn(async (_args: string[], _cwd: string) => {})
  await expect(buildMobileApp(root!, ['apps/app'], 'android', run)).rejects.toThrow()
  expect(run).toHaveBeenCalledTimes(2)
  await writeFile(config, '{}')
  const output = join(directory, 'android/app/build/outputs/apk/release/app-release.apk')
  run.mockImplementation(async (args) => {
    if (args.includes('build') && args.includes('cap')) {
      await mkdir(join(output, '..'), { recursive: true })
      await writeFile(output, 'PK-test-artifact')
    }
  })
  expect(await buildMobileApp(root!, ['apps/app'], 'android', run)).toEqual([output])
})
