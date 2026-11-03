/** 原生产物收集与批次发布；底层工具继续管理自己的构建目录。 */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { closeSync, cpSync, createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { cliM } from '../cli-i18n.js'

export interface NativeArtifact {
  source: string
  file: string
}

/** 将 build.app/build.desktop 的相对目录解析到当前工程边界内。 */
export function nativeProjectDirectory(root: string, item: string): string {
  const directory = resolve(root, item)
  const inside = (parent: string, path: string): boolean => {
    const rel = relative(parent, path)
    return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
  }
  if (isAbsolute(item) || !inside(root, directory) || !existsSync(directory) || !inside(realpathSync(root), realpathSync(directory)) || !lstatSync(realpathSync(directory)).isDirectory())
    throw new Error(cliM('cli_build_native_directory'))
  return directory
}

/** 记录候选制品及目录包的状态，以区分本次产物与旧文件。 */
export function nativeFiles(root: string, accepts: (path: string, isDirectory: boolean) => boolean): Map<string, string> {
  const files = new Map<string, string>()
  function stamp(path: string): string {
    const info = lstatSync(path, { bigint: true })
    const own = `${info.mtimeNs}:${info.ctimeNs}:${info.size}`
    return info.isDirectory() ? `${own}:${readdirSync(path).map(name => stamp(join(path, name))).join(',')}` : own
  }
  function visit(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isSymbolicLink())
        continue
      if (accepts(file, entry.isDirectory()))
        files.set(file, stamp(file))
      else if (entry.isDirectory())
        visit(file)
    }
  }
  if (existsSync(root) && lstatSync(root).isDirectory())
    visit(root)
  return files
}

/** 仅接受本次写入的 ZIP 格式安装包。 */
export function isNativeZip(path: string): boolean {
  const fd = openSync(path, 'r')
  try {
    const header = Buffer.alloc(4)
    return readSync(fd, header) === header.length && header[0] === 0x50 && header[1] === 0x4B
  }
  finally {
    closeSync(fd)
  }
}

/** 写入完整批次后再更新当前平台与构建类型的 latest。 */
export async function publishNativeArtifacts(root: string, kind: 'app' | 'desktop', platform: string, debug: boolean, identity: { buildId: string, commit: string, appVersion: string }, artifacts: readonly NativeArtifact[]): Promise<string[]> {
  const variant = debug ? 'debug' : 'release'
  const parent = join(root, '.hai', 'build', kind, platform, variant)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(join(parent, '.building-'))
  const latest = join(parent, `latest-${identity.buildId}`)
  const batch = join(parent, identity.buildId)
  try {
    const files = []
    for (const artifact of artifacts) {
      const output = join(staging, artifact.file)
      mkdirSync(dirname(output), { recursive: true })
      cpSync(artifact.source, output, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true })
      const file = artifact.file.split(sep).join('/')
      if (lstatSync(output).isDirectory()) {
        files.push({ file })
        continue
      }
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(output))
        hash.update(chunk)
      files.push({ file, sha256: hash.digest('hex') })
    }
    writeFileSync(join(staging, 'manifest.json'), `${JSON.stringify({ ...identity, kind, platform, variant, files }, null, 2)}\n`)
    renameSync(staging, batch)
    writeFileSync(latest, `${identity.buildId}\n`)
    renameSync(latest, join(parent, 'latest'))
    return files.map(({ file }) => join(batch, file))
  }
  finally {
    rmSync(staging, { recursive: true, force: true })
    rmSync(latest, { force: true })
  }
}
