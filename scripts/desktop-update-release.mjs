/** 校验桌面构建批次，签名并生成可发布的 Tauri 更新文件。 */
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-z-][\da-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][\da-z-]*))*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i
const FORMATS = {
  linux: { extension: '.AppImage', installerSuffix: '.AppImage' },
  windows: { extension: '.exe', installerSuffix: '-setup.exe' },
}

function updateUrl(input) {
  const url = URL.parse(input)
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Use an HTTPS URL without credentials, a query, or a fragment.')
  return url
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function readPublicKey(value) {
  const publicKey = value?.trim() ?? ''
  const outer = Buffer.from(publicKey, 'base64')
  const [comment, key] = outer.toString('utf8').trimEnd().split(/\r?\n/)
  const bytes = Buffer.from(key ?? '', 'base64')
  if (outer.toString('base64') !== publicKey || !comment.startsWith('untrusted comment: ') || bytes.length !== 42 || bytes.toString('base64') !== key || bytes.subarray(0, 2).toString('ascii') !== 'Ed')
    throw new Error('The TAURI_UPDATE_PUBLIC_KEY variable must contain the generated Tauri .pub file text.')
  return {
    publicKey,
    keyId: bytes.subarray(2, 10),
  }
}

/** 仅在发布工作流的临时 checkout 中配置公开更新源，保留平台已有配置。 */
export async function configureDesktopUpdate(path, endpoint, publicKey) {
  const url = updateUrl(endpoint)
  if (!url.pathname.endsWith('/latest.json'))
    throw new Error('The update feed URL must end in /latest.json.')
  const { publicKey: pubkey } = readPublicKey(publicKey)

  const config = await readJson(path).catch((error) => {
    if (error.code === 'ENOENT')
      return {}
    throw error
  })
  config.plugins = {
    ...config.plugins,
    updater: {
      ...config.plugins?.updater,
      'endpoints': [url.href],
      pubkey,
      'requireSignedVersion': true,
      'allowDowngrades': false,
      'dangerousAcceptInvalidCerts': false,
      'dangerousAcceptInvalidHostnames': false,
      'dangerousInsecureTransportProtocol': false,
      // Tauri 按 JSON Merge Patch 合并平台配置，null 会移除基础配置里的同义键。
      'require-signed-version': null,
      'allow-downgrades': null,
      'dangerous-accept-invalid-certs': null,
      'dangerous-accept-invalid-hostnames': null,
      'dangerous-insecure-transport-protocol': null,
    },
  }
  // 打包进程只需要公钥。最终安装包由独立签名步骤处理。
  config.bundle = { ...config.bundle, createUpdaterArtifacts: false }
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`)
}

async function batchInstaller(projectDirectory, platform) {
  const { extension, installerSuffix } = FORMATS[platform]
  const parent = await realpath(join(projectDirectory, '.hai/build/desktop', platform, 'release'))
  const batchName = (await readFile(join(parent, 'latest'), 'utf8')).trim()
  if (!/^build-[\w.+-]+$/.test(batchName))
    throw new Error('Invalid desktop build pointer.')
  const batch = join(parent, batchName)
  if (!(await lstat(batch)).isDirectory())
    throw new Error('The desktop build pointer must reference a local batch directory.')
  const manifest = await readJson(join(batch, 'manifest.json'))
  const { appVersion: version, kind, arch, variant, files } = manifest
  if (kind !== 'desktop' || manifest.platform !== platform || arch !== 'x64' || variant !== 'release' || typeof version !== 'string' || !VERSION.test(version) || !Array.isArray(files))
    throw new Error(`Expected a ${platform} x64 release batch with an exact SemVer version.`)
  const project = await readJson(join(projectDirectory, 'package.json'))
  if (project.version !== version)
    throw new Error('The desktop build version does not match package.json. Build the current version before signing.')

  const installers = files.filter(entry => typeof entry?.file === 'string' && entry.file.endsWith(extension))
  if (installers.length !== 1)
    throw new Error(`A ${platform} x64 update must contain exactly one ${extension} installer.`)
  const [{ file, sha256 }] = installers
  const filename = basename(file)
  if (!/^[\w.+-]+$/.test(filename) || !filename.endsWith(`-${platform}-x64-release-${version}${installerSuffix}`) || !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error('The batch installer name or SHA-256 checksum is invalid.')

  const source = await realpath(resolve(batch, file))
  const fromBatch = relative(batch, source)
  if (isAbsolute(file) || isAbsolute(fromBatch) || fromBatch === '..' || fromBatch.startsWith(`..${sep}`) || !(await lstat(source)).isFile())
    throw new Error('The installer must be a file inside the desktop build batch.')
  return { filename, sha256, source, version }
}

/** 先验证归档内容再签名，所有文件准备完成后一次交付输出目录。 */
export async function packageDesktopUpdate({ platform, projectDirectory, assetBaseUrl, outputDirectory, notes = '' }) {
  if (!Object.hasOwn(FORMATS, platform))
    throw new Error('Desktop updates require a Linux x64 AppImage or Windows x64 NSIS installer.')
  const assets = updateUrl(assetBaseUrl)
  if (!assets.pathname.endsWith('/'))
    assets.pathname += '/'
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim())
    throw new Error('The TAURI_SIGNING_PRIVATE_KEY secret must be available to the signing step.')

  const { filename, sha256, source, version } = await batchInstaller(projectDirectory, platform)
  const output = resolve(outputDirectory)
  await mkdir(dirname(output), { recursive: true })
  const staging = await mkdtemp(join(dirname(output), '.desktop-update-'))
  try {
    const installer = join(staging, filename)
    await copyFile(source, installer)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(installer))
      hash.update(chunk)
    if (hash.digest('hex') !== sha256)
      throw new Error('The installer checksum does not match the build manifest.')

    const config = await readJson(join(projectDirectory, 'src-tauri', `tauri.${platform}.conf.json`))
    const { keyId } = readPublicKey(config.plugins?.updater?.pubkey)
    const require = createRequire(resolve(projectDirectory, 'package.json'))
    const tauri = require.resolve('@tauri-apps/cli/tauri.js')
    execFileSync(process.execPath, [
      tauri,
      'signer',
      'sign',
      '--app-version',
      version,
      installer,
    ], {
      cwd: projectDirectory,
      stdio: ['ignore', 'ignore', 'inherit'],
      windowsHide: true,
    })
    const signature = (await readFile(`${installer}.sig`, 'utf8')).trim()
    const [, minisign] = Buffer.from(signature, 'base64').toString('utf8').split(/\r?\n/)
    const signatureBytes = Buffer.from(minisign ?? '', 'base64')
    // Minisign 的两字节算法标识后紧跟八字节密钥标识，安装时仍由 Tauri 验证签名。
    if (signatureBytes.length !== 74 || !signatureBytes.subarray(2, 10).equals(keyId))
      throw new Error('The installer signature does not match the updater public key.')
    await writeFile(join(staging, 'latest.json'), `${JSON.stringify({
      version,
      ...(notes
        ? { notes }
        : {}),
      platforms: {
        [`${platform}-x86_64`]: {
          signature,
          url: new URL(encodeURIComponent(filename), assets).href,
        },
      },
    }, null, 2)}\n`)
    await rename(staging, output)
  }
  finally {
    await rm(staging, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'configure' && args.length === 2) {
    await configureDesktopUpdate(args[0], args[1], process.env.TAURI_UPDATE_PUBLIC_KEY)
  }
  else if (command === 'package' && args.length === 4) {
    await packageDesktopUpdate({
      platform: args[0],
      projectDirectory: args[1],
      assetBaseUrl: args[2],
      outputDirectory: args[3],
      notes: process.env.TAURI_UPDATE_NOTES,
    })
  }
  else {
    throw new Error('Usage: desktop-update-release.mjs configure <tauri-platform-config> <feed-url> | package <linux|windows> <project-directory> <asset-base-url> <output-directory>')
  }
}
