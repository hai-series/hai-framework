import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureDesktopUpdate, packageDesktopUpdate } from '../desktop-update-release.mjs'

const projectManifest = new URL('../../apps/desktop-app/package.json', import.meta.url)
const require = createRequire(projectManifest)
const tauri = require.resolve('@tauri-apps/cli/tauri.js')
const appVersion = '1.2.3-beta.4'
const assetBase = 'https://updates.example.test/releases/1.2.3-beta.4'
const publicKey = Buffer.from('untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3').toString('base64')
let directory
let output

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-desktop-update-release-'))
  output = join(directory, 'output')
  const cli = join(directory, 'node_modules/@tauri-apps/cli')
  await mkdir(cli, { recursive: true })
  await writeFile(join(cli, 'tauri.js'), `require(${JSON.stringify(tauri)})`)
  await writeFile(join(directory, 'package.json'), JSON.stringify({ version: appVersion }))
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(directory, { force: true, recursive: true })
})

describe('桌面更新发布', () => {
  it('限制为 HTTPS 源并覆盖旧的不安全更新设置', async () => {
    const path = join(directory, 'tauri.windows.conf.json')
    await writeFile(path, JSON.stringify({
      app: { withGlobalTauri: false },
      bundle: {
        targets: ['nsis'],
      },
      plugins: {
        updater: {
          'allowDowngrades': true,
          'dangerousAcceptInvalidCerts': true,
          'dangerousAcceptInvalidHostnames': true,
          'dangerousInsecureTransportProtocol': true,
          'require-signed-version': false,
          'allow-downgrades': true,
          'dangerous-accept-invalid-certs': true,
          'dangerous-accept-invalid-hostnames': true,
          'dangerous-insecure-transport-protocol': true,
          'windows': { installMode: 'passive' },
        },
      },
    }))
    await expect(configureDesktopUpdate(path, 'http://updates.example.test/latest.json', publicKey)).rejects.toThrow(/HTTPS/)
    await expect(configureDesktopUpdate(path, 'https://updates.example.test/latest.json', 'invalid')).rejects.toThrow(/\.pub/)
    await configureDesktopUpdate(path, 'https://updates.example.test/latest.json', ` ${publicKey}\n`)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      app: { withGlobalTauri: false },
      bundle: {
        targets: ['nsis'],
        createUpdaterArtifacts: false,
      },
      plugins: {
        updater: {
          'endpoints': ['https://updates.example.test/latest.json'],
          'pubkey': publicKey,
          'requireSignedVersion': true,
          'allowDowngrades': false,
          'dangerousAcceptInvalidCerts': false,
          'dangerousAcceptInvalidHostnames': false,
          'dangerousInsecureTransportProtocol': false,
          'require-signed-version': null,
          'allow-downgrades': null,
          'dangerous-accept-invalid-certs': null,
          'dangerous-accept-invalid-hostnames': null,
          'dangerous-insecure-transport-protocol': null,
          'windows': { installMode: 'passive' },
        },
      },
    })
  })

  it.each([
    ['linux', '.AppImage'],
    ['windows', '-setup.exe'],
  ])('使用 Tauri CLI 签署 %s 安装包并把签名正文写入更新清单', async (platform, extension) => {
    const { filename } = await createBatch(platform, extension)
    const fixturePublicKey = await useSigningFixture()
    await configurePlatform(platform, fixturePublicKey)
    await packageDesktopUpdate({
      platform,
      projectDirectory: directory,
      assetBaseUrl: assetBase,
      outputDirectory: output,
      notes: 'Improve startup reliability.',
    })

    const files = (await readdir(output)).sort()
    expect(files).toEqual([filename, `${filename}.sig`, 'latest.json'].sort())
    const signature = (await readFile(join(output, `${filename}.sig`), 'utf8')).trim()
    expect(JSON.parse(await readFile(join(output, 'latest.json'), 'utf8'))).toEqual({
      version: appVersion,
      notes: 'Improve startup reliability.',
      platforms: {
        [`${platform}-x86_64`]: { signature, url: `${assetBase}/${filename}` },
      },
    })
    expect(Buffer.from(signature, 'base64').toString('utf8')).toMatch(new RegExp(`trusted comment: .*${appVersion.replaceAll('.', '\\.')}($|[\\t\\r\\n])`, 'm'))
    expect(await readFile(join(output, filename), 'utf8')).toBe('Desktop installer fixture')
  })

  it('拒绝被改动的安装包并清理尚未发布的文件', async () => {
    const { batch, filename } = await createBatch('linux', '.AppImage')
    vi.stubEnv('TAURI_SIGNING_PRIVATE_KEY', 'fixture')
    await writeFile(join(batch, filename), 'modified installer')
    await expect(packageDesktopUpdate({
      platform: 'linux',
      projectDirectory: directory,
      assetBaseUrl: assetBase,
      outputDirectory: output,
    })).rejects.toThrow(/checksum/)
    expect((await readdir(directory)).sort()).toEqual(['.hai', 'node_modules', 'package.json'])
  })

  it('项目版本变化后不会把上一次构建签成新发布', async () => {
    await createBatch('windows', '-setup.exe')
    const fixturePublicKey = await useSigningFixture()
    await configurePlatform('windows', fixturePublicKey)
    await writeFile(join(directory, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    await expect(packageDesktopUpdate({
      platform: 'windows',
      projectDirectory: directory,
      assetBaseUrl: assetBase,
      outputDirectory: output,
    })).rejects.toThrow(/build version does not match/)
    expect(await readdir(directory)).not.toContain('output')
  })

  it('拒绝与应用内公钥不匹配的签名密钥', async () => {
    await createBatch('linux', '.AppImage')
    await useSigningFixture()
    await configurePlatform('linux', publicKey)
    await expect(packageDesktopUpdate({
      platform: 'linux',
      projectDirectory: directory,
      assetBaseUrl: assetBase,
      outputDirectory: output,
    })).rejects.toThrow(/does not match the updater public key/)
    expect((await readdir(directory)).some(file => file === 'output' || file.startsWith('.desktop-update-'))).toBe(false)
  })
})

async function configurePlatform(platform, fixturePublicKey) {
  const native = join(directory, 'src-tauri')
  await mkdir(native, { recursive: true })
  await configureDesktopUpdate(join(native, `tauri.${platform}.conf.json`), 'https://updates.example.test/latest.json', fixturePublicKey)
}

async function useSigningFixture() {
  const privateKey = join(directory, 'fixture.key')
  execFileSync(process.execPath, [
    tauri,
    'signer',
    'generate',
    '--ci',
    '--write-keys',
    privateKey,
  ], { stdio: 'pipe', windowsHide: true })
  vi.stubEnv('TAURI_SIGNING_PRIVATE_KEY', (await readFile(privateKey, 'utf8')).trim())
  vi.stubEnv('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', '')
  return readFile(`${privateKey}.pub`, 'utf8')
}

async function createBatch(platform, extension) {
  const batchName = `build-shop-${platform}-x64-release`
  const parent = join(directory, '.hai/build/desktop', platform, 'release')
  const batch = join(parent, batchName)
  const filename = `shop-${platform}-x64-release-${appVersion}${extension}`
  const installer = 'Desktop installer fixture'
  await mkdir(batch, { recursive: true })
  await writeFile(join(parent, 'latest'), `${batchName}\n`)
  await writeFile(join(batch, filename), installer)
  await writeFile(join(batch, 'manifest.json'), JSON.stringify({
    appVersion,
    kind: 'desktop',
    platform,
    arch: 'x64',
    variant: 'release',
    files: [
      {
        file: filename,
        sha256: createHash('sha256').update(installer).digest('hex'),
      },
    ],
  }))
  return { batch, filename }
}
