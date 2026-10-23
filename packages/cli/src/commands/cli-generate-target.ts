import type { GenerateOptions } from '../cli-types.js'
import { glob } from 'node:fs/promises'
import path from 'node:path'
import fse from 'fs-extra'
import { parse } from 'yaml'
import { cliM } from '../cli-i18n.js'

/**
 * 生成目标与实际 workspace 清单；根目录同时作为跨包输出的安全边界。
 * @example 模块内部上下文
 * ```ts
 * const pkg: GeneratePackage = { directory: path.resolve('apps/shop'), name: 'shop', dependencies: { '@sveltejs/kit': '^2' } }
 * const target: GenerateTarget = { root: path.resolve('.'), target: pkg, packages: [pkg] }
 * ```
 */
export interface GenerateTarget {
  /** 真实工作区根路径。 */
  root: string
  /** 当前命令选中的应用包。 */
  target: GeneratePackage
  /** 工作区中可消费的包；仅包含根目录内的真实路径。 */
  packages: GeneratePackage[]
}

/**
 * 生成器实际使用的 package.json 字段。
 * @example 模块内部上下文
 * ```ts
 * const pkg: GeneratePackage = { directory: path.resolve('packages/shop-serv'), name: 'shop-serv', dependencies: { '@h-ai/serv': '*' } }
 * const architecture = generateArchitecture(pkg) // serv
 * ```
 */
export interface GeneratePackage {
  /** 包的绝对真实目录。 */
  directory: string
  /** package.json.name，缺省使用目录名。 */
  name: string
  /** 运行依赖和开发依赖的合并视图。 */
  dependencies: Record<string, string>
}

/**
 * 以 path.relative 检查真实路径包含关系，拒绝同名前缀的兄弟目录；调用方先解析符号链接。
 * @param root - 允许输出的真实根目录。
 * @param file - 已解析的绝对目标或现存祖先目录。
 * @returns 目标等于根目录或位于根目录内时为 true。
 * @example 模块内部上下文
 * ```ts
 * const root = path.resolve('shop')
 * const valid = isInside(root, path.join(root, 'src/orders.ts')) // true
 * const sibling = isInside(root, `${root}-other/orders.ts`) // false
 * ```
 */
function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** 只读取生成器需要的已校验包字段，不执行应用配置。 */
async function readPackage(directory: string): Promise<GeneratePackage | undefined> {
  if (!await fse.pathExists(path.join(directory, 'package.json')))
    return undefined
  const value: unknown = await fse.readJson(path.join(directory, 'package.json'))
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(cliM('cli_generateUnsupportedProject'))
  const dependencies: Record<string, string> = {}
  for (const key of ['dependencies', 'devDependencies']) {
    const entries = key in value ? Reflect.get(value, key) : undefined
    if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
      for (const [name, version] of Object.entries(entries)) {
        if (typeof version === 'string')
          dependencies[name] = version
      }
    }
  }
  const name = 'name' in value && typeof value.name === 'string' ? value.name : path.basename(directory)
  if (!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name))
    throw new Error(cliM('cli_generateUnsupportedProject'))
  return { directory, name, dependencies }
}

/**
 * 按实际依赖辨认路由能力；纯 Vite 不具备 SvelteKit 的文件路由。
 * @param pkg - 已校验的包清单。
 * @returns 应用实际安装的框架类型。
 * @example 模块内部上下文
 * ```ts
 * const architecture = generateArchitecture({ directory: path.resolve('.'), name: 'shop-serv', dependencies: { '@h-ai/serv': '*' } }) // serv
 * ```
 */
export function generateArchitecture(pkg: GeneratePackage): 'sveltekit' | 'serv' | 'svelte' | 'other' {
  if (pkg.dependencies['@sveltejs/kit'])
    return 'sveltekit'
  if (pkg.dependencies['@h-ai/serv'])
    return 'serv'
  return pkg.dependencies.svelte ? 'svelte' : 'other'
}

/**
 * 从当前包或 pnpm 工作区解析唯一可消费的目标；歧义要求显式 --workspace。
 * @param options - 命令选项；workspace 可为包名或根目录内相对路径。
 * @returns 目标包及受信路径边界。
 * @throws Error - 项目类型未知、包不存在、路径越界或存在多个适用包。
 * @example 模块内部上下文
 * ```ts
 * // 前提：当前 fullstack 工程中存在 shop-serv 后端包。
 * const target = await resolveGenerateTarget({ cwd: process.cwd(), type: 'api', name: 'orders', workspace: 'shop-serv' })
 * const serviceDirectory = target.target.directory
 * ```
 */
export async function resolveGenerateTarget(options: GenerateOptions): Promise<GenerateTarget> {
  const cwd = await fse.realpath(path.resolve(options.cwd ?? '.'))
  let root = cwd
  for (let current = cwd; ; current = path.dirname(current)) {
    if (await fse.pathExists(path.join(current, 'pnpm-workspace.yaml'))) {
      root = current
      break
    }
    if (path.dirname(current) === current)
      break
  }
  const packages: GeneratePackage[] = []
  const addPackage = async (directory: string) => {
    if (!isInside(root, directory))
      throw new Error(cliM('cli_generateOutsideWorkspace'))
    const real = await fse.realpath(directory)
    if (!isInside(root, real))
      throw new Error(cliM('cli_generateOutsideWorkspace'))
    const pkg = await readPackage(real)
    if (pkg && !packages.some(value => value.directory === real))
      packages.push(pkg)
  }
  await addPackage(root)
  if (await fse.pathExists(path.join(root, 'pnpm-workspace.yaml'))) {
    const workspace: unknown = parse(await fse.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'))
    const patterns = workspace && typeof workspace === 'object' && 'packages' in workspace && Array.isArray(workspace.packages) ? workspace.packages : []
    for (const pattern of patterns) {
      if (typeof pattern !== 'string' || pattern.startsWith('!') || pattern.split(/[\\/]/).includes('..') || path.isAbsolute(pattern))
        throw new Error(cliM('cli_generateUnsupportedProject'))
      for await (const manifest of glob(`${pattern}/package.json`, { cwd: root, exclude: ['**/node_modules/**'] }))
        await addPackage(path.dirname(path.resolve(root, manifest)))
    }
  }
  if (cwd !== root)
    await addPackage(cwd)
  const selected = options.workspace
    ? packages.filter(pkg => pkg.name === options.workspace || pkg.directory === path.resolve(root, options.workspace!))
    : packages.filter(pkg => pkg.directory === cwd)
  const applicable = (pkg: GeneratePackage) => {
    const architecture = generateArchitecture(pkg)
    return options.type === 'api'
      ? architecture === 'serv' || (architecture === 'sveltekit' && Boolean(pkg.dependencies['@h-ai/kit']) && Boolean(pkg.dependencies.zod))
      : options.type === 'page'
        ? architecture === 'sveltekit'
        : options.type === 'component'
          ? ['sveltekit', 'svelte'].includes(architecture)
          : Object.keys(pkg.dependencies).some(name => name.startsWith('@h-ai/'))
  }
  const candidates = options.workspace || (selected.length === 1 && (cwd !== root || applicable(selected[0]!))) ? selected.filter(applicable) : packages.filter(applicable)
  if (candidates.length !== 1)
    throw new Error(cliM(candidates.length > 1 ? 'cli_generateAmbiguousWorkspace' : 'cli_generateUnsupportedProject'))
  const target = candidates[0]!
  if (generateArchitecture(target) === 'sveltekit' && (options.type === 'page' || options.type === 'api')) {
    // 不执行应用 JS 配置；明确使用 kit.files 定制布局时拒绝猜测默认路由目录。
    for (const name of ['svelte.config.js', 'svelte.config.mjs', 'svelte.config.cjs', 'svelte.config.ts']) {
      const configFile = path.join(target.directory, name)
      if (await fse.pathExists(configFile) && /\bfiles\s*[:.[(]/.test(await fse.readFile(configFile, 'utf8')))
        throw new Error(cliM('cli_generateCustomRoutes'))
    }
  }
  return { root, target, packages }
}
