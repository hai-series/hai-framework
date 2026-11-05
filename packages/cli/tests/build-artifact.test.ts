import { afterEach, expect, it, vi } from 'vitest'
import { buildBatchName, createBuildId, nativePackageFile } from '../src/commands/cli-build-artifact.js'

afterEach(() => vi.useRealTimers())

it('uses local calendar time and a collision-resistant suffix before the version', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 5, 17, 19, 24))
  const id = createBuildId('1.2.3-beta.1+build.2')
  expect(id).toMatch(/^20261105-171924-[a-f0-9]{6}-1\.2\.3-beta\.1\+build\.2$/)
  expect(buildBatchName('todo', 'app-android-debug', id)).toBe(`build-todo-app-android-debug-${id}`)
  expect(createBuildId(`1.2.3-${'a'.repeat(74)}`).length).toBeLessThanOrEqual(128)
})

it.each([
  ['android', true, 'debug/app-debug.apk', undefined, 'todo-android-debug-0.1.0.apk'],
  ['android', false, 'release/app-release.apk', undefined, 'todo-android-release-0.1.0.apk'],
  ['android', true, 'debug/app-arm64-v8a-debug.apk', undefined, 'todo-android-arm64-v8a-debug-0.1.0.apk'],
  ['android', true, 'debug/app-x86_64-debug.apk', undefined, 'todo-android-x86_64-debug-0.1.0.apk'],
  ['windows', false, 'nsis/Old Name_0.1.0_x64-setup.exe', 'x64', 'todo-windows-x64-release-0.1.0-setup.exe'],
  ['linux', false, 'deb/old.deb', 'arm64', 'todo-linux-arm64-release-0.1.0.deb'],
  ['linux', false, 'appimage/old.AppImage', 'x64', 'todo-linux-x64-release-0.1.0.AppImage'],
  ['macos', false, 'macos/old.app', 'arm64', 'todo-macos-arm64-release-0.1.0.app'],
  ['ios', false, 'old.ipa', undefined, 'todo-ios-release-0.1.0.ipa'],
] as const)('names %s packages and preserves their format (%s, %s)', (platform, debug, file, arch, expected) => {
  expect(nativePackageFile('todo', platform, debug, '0.1.0', file, arch)).toBe(expected)
})
