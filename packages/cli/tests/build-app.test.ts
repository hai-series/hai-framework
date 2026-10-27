import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
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

it('独立手机工程允许 build.app 指向工程根，拒绝越过工程根的路径', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'hai-build-app-'))
  const root = join(fixture, 'mobile')
  if (dirname(resolve(fixture)) !== resolve(tmpdir()) || !basename(fixture).startsWith('hai-build-app-'))
    throw new Error('Unexpected native build fixture path')
  try {
    const assets = join(root, 'android/app/src/main/assets')
    mkdirSync(assets, { recursive: true })
    writeFileSync(join(root, 'capacitor.config.ts'), 'export default {}')
    writeFileSync(join(assets, 'capacitor.config.json'), '{}')
    const apk = join(root, 'android/app/build/outputs/apk/release/app.apk')
    const calls: Array<{ args: string[], directory: string }> = []
    const run = async (args: string[], directory: string) => {
      calls.push({ args, directory })
      if (args.includes('cap') && args.includes('build')) {
        mkdirSync(dirname(apk), { recursive: true })
        writeFileSync(apk, 'PK-unit-apk')
      }
    }
    expect(await buildMobileApp(root, ['.'], 'android', run)).toEqual([apk])
    expect(calls.map(call => call.directory)).toEqual([root, root, root])
    expect(calls.map(call => call.args)).toEqual([
      ['run', 'build'],
      ['exec', 'cap', 'sync', 'android'],
      ['exec', 'cap', 'build', 'android', '--androidreleasetype', 'APK'],
    ])
    calls.length = 0
    const outside = join(fixture, 'outside')
    const outsideAssets = join(outside, 'android/app/src/main/assets')
    mkdirSync(outsideAssets, { recursive: true })
    writeFileSync(join(outside, 'capacitor.config.ts'), 'export default {}')
    writeFileSync(join(outsideAssets, 'capacitor.config.json'), '{}')
    await expect(buildMobileApp(root, ['../outside'], 'android', run)).rejects.toThrow()
    expect(calls).toEqual([])
  }
  finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
