/** 镜像依赖缓存的内部文件边界；不接受生成路径中的链接，不跟随既有 inode 写入。 */
import type { BigIntStats } from 'node:fs'
import { Buffer, constants as bufferConstants } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { cliM } from '../cli-i18n.js'

/**
 * 为显式可信、构建期间不会被其他主体替换的 context 更新依赖输入。
 * 只管理普通缓存文件；不提供不可信目录沙箱或跨文件事务。
 * @param cwd - 已由调用者信任的镜像构建上下文目录。
 * @throws Error - 缓存目录/文件为链接、特殊文件、读取时发生变化或发布失败。
 * @example 模块内部上下文
 * ```ts
 * prepareDependencyInputs('/workspace/shop')
 * ```
 */
export function prepareDependencyInputs(cwd: string): void {
  const context = realpathSync.native(cwd)
  const anchor = lstatSync(context, { bigint: true })
  const destination = join(context, 'images', 'dependencies')
  const tracking = join(destination, '.managed.json')
  const trackingMaxBytes = 16 * 1024 * 1024
  const same = (left: BigIntStats, right: BigIntStats): boolean => left.dev === right.dev && left.ino === right.ino
  const reasons = {
    invalid: 'cli_build_dependency_reason_invalid',
    changed: 'cli_build_dependency_reason_changed',
    read: 'cli_build_dependency_reason_read',
    write: 'cli_build_dependency_reason_write',
    tracking: 'cli_build_dependency_reason_tracking',
  } as const
  const diagnosed = new WeakSet<Error>()
  const unsafe = (file: string, reason: keyof typeof reasons, cause?: unknown): Error => {
    if (cause instanceof Error && diagnosed.has(cause))
      return cause
    const code = cause && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : undefined
    const diagnostic = typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code)
      ? code
      : `CACHE_${reason.toUpperCase()}`
    const error = new Error(cliM('cli_build_dependency_context_unsafe', {
      params: {
        path: relative(context, file).split(sep).join('/') || '.',
        reason: cliM(reasons[reason]),
        diagnostic,
      },
    }), { cause })
    diagnosed.add(error)
    return error
  }

  // 逐层检查，不允许 recursive mkdir、复制或删除越过已有 junction/symlink。
  const checked = (target: string, directory = false, create = false): BigIntStats | undefined => {
    const currentAnchor = lstatSync(context, { bigint: true })
    if (!currentAnchor.isDirectory() || currentAnchor.isSymbolicLink() || !same(anchor, currentAnchor))
      throw unsafe(context, 'changed')
    const offset = relative(context, target)
    if (isAbsolute(offset) || offset === '..' || offset.startsWith(`..${sep}`) || (!offset && !directory))
      throw unsafe(target, 'invalid')
    let current = context
    let metadata = currentAnchor
    const parts = offset
      ? offset.split(sep)
      : []
    for (const [index, part] of parts.entries()) {
      current = join(current, part)
      const expectDirectory = directory || index < parts.length - 1
      try {
        metadata = lstatSync(current, { bigint: true })
      }
      catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
          throw unsafe(current, 'read', error)
        if (!create || !expectDirectory)
          return undefined
        try {
          mkdirSync(current)
        }
        catch (mkdirError) {
          if (!mkdirError || typeof mkdirError !== 'object' || !('code' in mkdirError) || mkdirError.code !== 'EEXIST')
            throw unsafe(current, 'write', mkdirError)
        }
        metadata = lstatSync(current, { bigint: true })
      }
      if (metadata.isSymbolicLink() || (expectDirectory
        ? !metadata.isDirectory()
        : !metadata.isFile() || metadata.nlink !== 1n)) {
        throw unsafe(current, 'invalid')
      }
    }
    return metadata
  }

  // 清单解析读取同一个已检查 FD；检查后替换与文件增长不能绕过16MiB上限。
  const read = (file: string, limit: number): Buffer | undefined => {
    const before = checked(file)
    if (!before)
      return undefined
    let fd: number | undefined
    try {
      fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
      const opened = fstatSync(fd, { bigint: true })
      if (!opened.isFile() || opened.nlink !== 1n || !same(before, opened) || opened.size < 0n) {
        throw unsafe(file, !same(before, opened)
          ? 'changed'
          : 'invalid')
      }
      if (opened.size > BigInt(limit) || opened.size >= BigInt(bufferConstants.MAX_LENGTH))
        throw unsafe(file, 'invalid')
      const bytes = Buffer.alloc(Number(opened.size) + 1)
      let length = 0
      while (length < bytes.length) {
        const count = readSync(fd, bytes, length, bytes.length - length, null)
        if (!count)
          break
        length += count
      }
      const after = fstatSync(fd, { bigint: true })
      const current = checked(file)
      if (!current || !same(opened, current) || !same(opened, after) || after.nlink !== 1n
        || length !== Number(opened.size) || after.size !== opened.size
        || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs) {
        throw unsafe(file, 'changed')
      }
      return bytes.subarray(0, length)
    }
    catch (error) {
      throw unsafe(file, 'read', error)
    }
    finally {
      if (fd !== undefined)
        closeSync(fd)
    }
  }

  /**
   * 清单已受上限约束；归档源保持打开的FD，以固定块读取而非整份Buffer。
   * @example 模块内部上下文
   * ```ts
   * const input: Input = Buffer.from('[]\n')
   * ```
   */
  type Input = Buffer | { fd: number, metadata: BigIntStats, file: string }
  const length = (input: Input): number => Buffer.isBuffer(input)
    ? input.length
    : Number(input.metadata.size)
  const unchanged = (before: BigIntStats, after: BigIntStats): boolean => same(before, after)
    && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs
  const inputStable = (input: Input): void => {
    if (!Buffer.isBuffer(input) && !unchanged(input.metadata, fstatSync(input.fd, { bigint: true })))
      throw unsafe(input.file, 'changed')
  }
  const block = (input: Input, offset: number, bytes: Buffer): void => {
    if (Buffer.isBuffer(input)) {
      input.copy(bytes, 0, offset, offset + bytes.length)
      return
    }
    try {
      let count = 0
      while (count < bytes.length) {
        const read = readSync(input.fd, bytes, count, bytes.length - count, offset + count)
        if (!read)
          throw unsafe(input.file, 'changed')
        count += read
      }
    }
    catch (error) {
      throw unsafe(input.file, 'read', error)
    }
  }
  const matches = (file: string, input: Input): boolean => {
    const before = checked(file)
    if (!before)
      return false
    let fd: number | undefined
    try {
      fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
      const opened = fstatSync(fd, { bigint: true })
      if (!opened.isFile() || opened.nlink !== 1n || !same(before, opened)) {
        throw unsafe(file, !same(before, opened)
          ? 'changed'
          : 'invalid')
      }
      // 尺寸不同直接替换；即使预置巨型缓存，也不按旧文件长度分配内存。
      if (opened.size !== BigInt(length(input)))
        return false
      const currentBytes = Buffer.alloc(Math.min(64 * 1024, length(input)))
      const sourceBytes = Buffer.alloc(currentBytes.length)
      let equal = true
      for (let offset = 0; offset < length(input); offset += currentBytes.length) {
        const size = Math.min(currentBytes.length, length(input) - offset)
        let count = 0
        while (count < size) {
          const read = readSync(fd, currentBytes, count, size - count, offset + count)
          if (!read)
            throw unsafe(file, 'changed')
          count += read
        }
        block(input, offset, sourceBytes.subarray(0, size))
        if (!currentBytes.subarray(0, size).equals(sourceBytes.subarray(0, size))) {
          equal = false
          break
        }
      }
      const after = fstatSync(fd, { bigint: true })
      const current = checked(file)
      if (!current || !same(opened, current) || after.nlink !== 1n || !unchanged(opened, after))
        throw unsafe(file, 'changed')
      return equal
    }
    catch (error) {
      throw unsafe(file, 'read', error)
    }
    finally {
      if (fd !== undefined)
        closeSync(fd)
    }
  }
  const publish = (file: string, input: Input, mode: number): void => {
    checked(dirname(file), true, true)
    const equal = matches(file, input)
    inputStable(input)
    if (equal)
      return
    const temporary = join(dirname(file), `.hai-dependency-${randomUUID()}.tmp`)
    let fd: number | undefined
    let owned: BigIntStats | undefined
    try {
      fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode)
      owned = fstatSync(fd, { bigint: true })
      fchmodSync(fd, mode)
      const bytes = Buffer.alloc(Math.min(64 * 1024, length(input)))
      for (let offset = 0; offset < length(input); offset += bytes.length) {
        const next = bytes.subarray(0, Math.min(bytes.length, length(input) - offset))
        block(input, offset, next)
        writeFileSync(fd, next)
      }
      inputStable(input)
      fsyncSync(fd)
      closeSync(fd)
      fd = undefined
      checked(file)
      const candidate = checked(temporary)
      if (!candidate || !same(owned, candidate))
        throw unsafe(temporary, 'changed')
      renameSync(temporary, file)
    }
    catch (error) {
      throw unsafe(file, 'write', error)
    }
    finally {
      if (fd !== undefined)
        closeSync(fd)
      if (owned) {
        try {
          const candidate = checked(temporary)
          if (candidate && same(owned, candidate))
            unlinkSync(temporary)
        }
        catch { /* 只清理身份仍属于本次写入的临时文件，不覆盖原失败。 */ }
      }
    }
  }

  checked(destination, true, true)
  const realDestination = realpathSync.native(destination)
  // 跟踪清单最多16MiB；该内部限制不接受项目配置覆盖。
  const bytes = read(tracking, trackingMaxBytes)
  let recorded: unknown
  try {
    recorded = bytes
      ? JSON.parse(bytes.toString('utf8'))
      : []
  }
  catch (error) {
    throw unsafe(tracking, 'tracking', error)
  }
  const previous = Array.isArray(recorded)
    ? recorded.filter((file): file is string => typeof file === 'string')
    : []
  const files: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const source = join(directory, entry.name)
      if (source === destination || (entry.isDirectory() && realpathSync.native(source) === realDestination)
        || [
          'node_modules',
          '.git',
          '.hai',
          '.turbo',
          '.svelte-kit',
          '.pnpm-store',
          '.cache',
          'dist',
          'build',
          'data',
          'tmp',
          'test-results',
          'playwright-report',
        ].includes(entry.name)) {
        continue
      }
      if (entry.isDirectory()) {
        walk(source)
        continue
      }
      if (!entry.isFile() || !(entry.name === 'package.json' || entry.name === '.pnpmfile.cjs' || /\.(?:tgz|patch)$/.test(entry.name)))
        continue
      const file = relative(context, source)
      const before = lstatSync(source, { bigint: true })
      let fd: number | undefined
      try {
        fd = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
        const metadata = fstatSync(fd, { bigint: true })
        if (!metadata.isFile() || metadata.nlink !== 1n || !same(before, metadata) || metadata.size < 0n || metadata.size > BigInt(Number.MAX_SAFE_INTEGER))
          throw unsafe(source, 'changed')
        publish(join(destination, file), { fd, metadata, file: source }, Number(metadata.mode & 0o777n))
      }
      catch (error) {
        throw unsafe(source, 'read', error)
      }
      finally {
        if (fd !== undefined)
          closeSync(fd)
      }
      files.push(file)
    }
  }
  walk(context)
  const currentFiles = new Set(files.map(file => realpathSync.native(join(destination, file))))
  for (const file of previous) {
    const target = resolve(destination, file)
    const offset = relative(destination, target)
    if (!offset || isAbsolute(offset) || offset === '..' || offset.startsWith(`..${sep}`) || !checked(target))
      continue
    const actual = realpathSync.native(target)
    const actualOffset = relative(realDestination, actual)
    if (!actualOffset || isAbsolute(actualOffset) || actualOffset === '..' || actualOffset.startsWith(`..${sep}`))
      throw unsafe(target, 'changed')
    if (!currentFiles.has(actual)) {
      try {
        unlinkSync(target)
      }
      catch (error) {
        throw unsafe(target, 'write', error)
      }
    }
  }
  const content = `${JSON.stringify(files)}\n`
  if (Buffer.byteLength(content, 'utf8') > trackingMaxBytes)
    throw unsafe(tracking, 'invalid')
  publish(tracking, Buffer.from(content), Number((checked(tracking)?.mode ?? 0o644n) & 0o777n))
}
