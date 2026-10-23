/**
 * 从真实 package.exports 和构建声明生成公开 API 清单；不执行包入口或加载服务。
 * @example `node scripts/module-api-inventory.mjs --check`
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const slash = value => value.replaceAll('\\', '/')

/** 展开目录内真实文件，不跟随符号链接；用于 exports 通配模式。 */
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(directory, entry.name))
    : entry.isFile() ? [join(directory, entry.name)] : [])
}

/** 收集 export 条件叶子；保留条件顺序，不能把 browser 与默认入口合并。 */
function leaves(target, conditions = []) {
  if (typeof target === 'string')
    return [{ target, conditions }]
  if (target === null)
    return []
  if (Array.isArray(target))
    return target.flatMap((value, index) => leaves(value, [...conditions, `fallback[${index}]`]))
  return Object.entries(target).flatMap(([condition, value]) => leaves(value, [...conditions, condition]))
}

/**
 * 展开 package.exports 实际可达的文件；仅把声明的通配模式与真实产物交集算作入口。
 * @example `expandPackageExports('/repo/packages/core', manifest.exports)`
 */
export function expandPackageExports(directory, exports) {
  const entries = []
  const paths = typeof exports === 'object' && exports !== null && !Array.isArray(exports)
    && Object.keys(exports).some(key => key.startsWith('.'))
    ? exports
    : { '.': exports }
  for (const [subpath, conditions] of Object.entries(paths)) {
    for (const leaf of leaves(conditions)) {
      if (!leaf.target.startsWith('./') || leaf.target.split('/').includes('..'))
        throw new Error(`Invalid export target: ${subpath}`)
      if (!leaf.target.includes('*')) {
        entries.push({ subpath, ...leaf, file: resolve(directory, leaf.target) })
        continue
      }
      const [prefix, suffix] = leaf.target.split('*')
      const base = resolve(directory, dirname(prefix))
      if (!existsSync(base)) {
        entries.push({ subpath, ...leaf, file: resolve(directory, leaf.target) })
        continue
      }
      let count = 0
      for (const file of files(base)) {
        const candidate = `./${slash(relative(directory, file))}`
        if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix))
          continue
        const captured = candidate.slice(prefix.length, candidate.length - suffix.length || undefined)
        count++
        entries.push({ subpath: subpath.replaceAll('*', captured), target: candidate, conditions: leaf.conditions, file })
      }
      if (count === 0)
        entries.push({ subpath, ...leaf, file: resolve(directory, leaf.target) })
    }
  }
  return entries
}

/** 读取实际 JS 的导出绑定，区分 type-only 转发与运行时 API；不执行模块。 */
function runtimeSymbols(file, cache = new Map()) {
  if (cache.has(file))
    return cache.get(file)
  const explicit = new Map()
  cache.set(file, explicit)
  if (!existsSync(file))
    return explicit
  if (file.endsWith('.svelte')) {
    explicit.set('default', `${file}:default`)
    return explicit
  }
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const star = new Map()
  const ambiguous = new Set()
  const origin = (specifier) => {
    if (!specifier.startsWith('.'))
      return undefined
    return resolve(dirname(file), specifier)
  }
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const child = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? origin(statement.moduleSpecifier.text) : undefined
      const exported = child ? runtimeSymbols(child, cache) : undefined
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const item of statement.exportClause.elements) {
          if (!item.isTypeOnly)
            explicit.set(item.name.text, exported?.get(item.propertyName?.text ?? item.name.text) ?? `${file}:${item.name.text}`)
        }
      }
      else if (statement.exportClause && ts.isNamespaceExport(statement.exportClause)) {
        explicit.set(statement.exportClause.name.text, child ?? file)
      }
      else if (exported) {
        for (const [name, binding] of exported) {
          if (name === 'default')
            continue
          if (star.has(name) && star.get(name) !== binding)
            ambiguous.add(name)
          star.set(name, binding)
        }
      }
    }
    const modifiers = statement.modifiers ?? []
    if (modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        explicit.set('default', `${file}:default`)
      }
      else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name))
            explicit.set(declaration.name.text, `${file}:${declaration.name.text}`)
        }
      }
      else if (statement.name && ts.isIdentifier(statement.name)) {
        explicit.set(statement.name.text, `${file}:${statement.name.text}`)
      }
    }
    if (ts.isExportAssignment(statement))
      explicit.set('default', `${file}:default`)
  }
  for (const [name, binding] of star) {
    if (!explicit.has(name) && !ambiguous.has(name))
      explicit.set(name, binding)
  }
  return explicit
}

/** 获取声明文件的真实导出符号，跟随 export-star 和别名；运行时种类以 JS 为准。 */
function exportedSymbols(checker, source, runtime) {
  const module = checker.getSymbolAtLocation(source)
  if (!module)
    return []
  return checker.getExportsOfModule(module).map((symbol) => {
    const actual = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    const declaration = actual.declarations?.[0]
    const value = runtime.has(symbol.getName())
    const type = Boolean(actual.flags & ts.SymbolFlags.Type)
    return {
      name: symbol.getName(),
      kind: value ? type ? 'value+type' : 'value' : 'type',
      declaration: actual.getName(),
      declarationKind: declaration ? ts.SyntaxKind[declaration.kind] : 'Unresolved',
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

/** 归一化构建声明路径；.svelte 文件有独立的 .svelte.d.ts 声明。 */
function declarationFile(entry) {
  if (entry.file.endsWith('.d.ts'))
    return entry.file
  const candidate = entry.file.endsWith('.js') ? `${entry.file.slice(0, -3)}.d.ts` : `${entry.file}.d.ts`
  return existsSync(candidate) ? candidate : undefined
}

/**
 * 生成全部包的构建 API 投影；缺少产物单独报错，不使用 source 伪装已经发布。
 * @example `const inventory = inspectModuleApi('/repo')`
 */
export function inspectModuleApi(repository) {
  const packages = readdirSync(join(repository, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(repository, 'packages', entry.name, 'package.json')))
    .map((entry) => {
      const directory = join(repository, 'packages', entry.name)
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      return { name: manifest.name, directory, entries: expandPackageExports(directory, manifest.exports ?? {}) }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const declarations = [...new Set(packages.flatMap(pkg => pkg.entries.map(declarationFile).filter(Boolean)))]
  const program = ts.createProgram(declarations, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
    allowJs: true,
    checkJs: false,
  })
  const checker = program.getTypeChecker()
  const cache = new Map()
  const runtimeCache = new Map()
  const errors = []
  const result = packages.map(pkg => ({
    package: pkg.name,
    entries: pkg.entries.map((entry) => {
      const exists = existsSync(entry.file)
      if (!exists)
        errors.push(`${pkg.name}${entry.subpath.slice(1)} [${entry.conditions.join(', ')}]: missing ${entry.target}`)
      const declaration = declarationFile(entry)
      let symbols = []
      if (declaration) {
        if (!cache.has(declaration)) {
          const source = program.getSourceFile(declaration)
          const plain = declaration.replace(/\.d\.ts$/, '')
          const runtime = existsSync(`${plain}.js`) ? `${plain}.js` : plain
          cache.set(declaration, source ? exportedSymbols(checker, source, runtimeSymbols(runtime, runtimeCache)) : [])
        }
        symbols = cache.get(declaration)
      }
      return { subpath: entry.subpath, conditions: entry.conditions, target: entry.target, exists, symbols }
    }).sort((a, b) => a.subpath.localeCompare(b.subpath, 'en') || a.conditions.join('/').localeCompare(b.conditions.join('/'), 'en')),
  }))
  return { packages: result, errors }
}

/** 紧凑摘要指向完整 JSON；命名 API 以声明符号为准，资产入口没有命名导出。 */
function markdown(inventory) {
  const lines = [
    '# 模块公开 API 清单',
    '',
    '由 `node scripts/module-api-inventory.mjs` 根据真实 `package.json.exports` 和构建声明生成。先构建受影响包，再用 `--check` 核对。完整条件入口、通配展开、导出名称/种类/原始符号名见 [module-api-inventory.json](module-api-inventory.json)。此表不执行生命周期初始化，不把缺失产物当成功。',
    '',
    '| 包 | 公开子路径/条件 | 命名 API 数 |',
    '| --- | --- | --- |',
  ]
  for (const pkg of inventory.packages) {
    const groups = new Map()
    for (const entry of pkg.entries) {
      const key = `${entry.subpath} (${entry.conditions.join('/') || 'default'})`
      if (entry.subpath.startsWith('./components/') || entry.subpath.startsWith('./styles/'))
        continue
      groups.set(key, `${entry.symbols.length}${entry.exists ? '' : '（产物缺失）'}`)
    }
    for (const prefix of ['./components/', './styles/']) {
      const expanded = pkg.entries.filter(entry => entry.subpath.startsWith(prefix))
      if (expanded.length)
        groups.set(`${prefix === './components/' ? './components/ 下的显式入口' : './styles/*'}（${new Set(expanded.map(entry => entry.subpath)).size} 个真实子路径，见 JSON）`, '逐项记录')
    }
    for (const [entry, count] of groups)
      lines.push(`| ${pkg.package} | \`${entry}\` | ${count} |`)
  }
  lines.push('', 'CLI 根入口是命令启动入口，不提供命名库 API；运行冒烟使用隔离进程的 --help/--version。UI 的 .svelte 条件由 Svelte 构建器消费，不能用 Node 的原生模块加载器直接执行组件文件。其余服务端导入冒烟不调用 init，不连接外部服务。', '')
  return lines.join('\n')
}

/** 写入或校验稳定快照；符号变化必须经审查后重新生成。 */
function main() {
  const inventory = inspectModuleApi(root)
  const outputs = [
    ['scripts/generated/module-api-inventory.json', `${JSON.stringify(inventory, null, 2)}\n`],
    ['scripts/generated/module-api-inventory.md', markdown(inventory)],
  ]
  const errors = [...inventory.errors]
  for (const [path, content] of outputs) {
    const file = join(root, path)
    if (process.argv.includes('--check')) {
      if (!existsSync(file) || readFileSync(file, 'utf8').replaceAll('\r\n', '\n') !== content)
        errors.push(`API inventory is stale: ${path}`)
    }
    else {
      writeFileSync(file, content, 'utf8')
    }
  }
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`)
    process.exitCode = 1
  }
  else {
    process.stdout.write(`Module API inventory OK (${inventory.packages.length} packages)\n`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main()
