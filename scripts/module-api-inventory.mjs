/**
 * 从真实 package.exports 和构建声明生成公开 API 清单；不执行包入口或加载服务。
 * @example `node scripts/module-api-inventory.mjs --check`
 */
import { randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
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
    : entry.isFile()
      ? [
          join(directory, entry.name),
        ]
      : [])
}

/** 收集 export 条件叶子；保留条件顺序，不能把 browser 与默认入口合并。 */
function leaves(target, conditions = []) {
  if (typeof target === 'string') {
    return [
      { target, conditions },
    ]
  }
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
        entries.push({
          subpath,
          ...leaf,
          file: resolve(directory, leaf.target),
        })
        continue
      }
      const [prefix, suffix] = leaf.target.split('*')
      const base = resolve(directory, dirname(prefix))
      if (!existsSync(base)) {
        entries.push({
          subpath,
          ...leaf,
          file: resolve(directory, leaf.target),
        })
        continue
      }
      let count = 0
      for (const file of files(base)) {
        const candidate = `./${slash(relative(directory, file))}`
        if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix))
          continue
        const captured = candidate.slice(prefix.length, candidate.length - suffix.length || undefined)
        count++
        entries.push({
          subpath: subpath.replaceAll('*', captured),
          target: candidate,
          conditions: leaf.conditions,
          file,
        })
      }
      if (count === 0) {
        entries.push({
          subpath,
          ...leaf,
          file: resolve(directory, leaf.target),
        })
      }
    }
  }
  return entries
}

/** 读取实际 JS 的导出绑定，区分 type-only 转发与运行时 API；不执行模块。 */
export function runtimeSymbols(file, cache = new Map(), sourceMode = false) {
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
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, sourceMode ? ts.ScriptKind.TS : ts.ScriptKind.JS)
  const star = new Map()
  const ambiguous = new Set()
  const origin = (specifier) => {
    if (!specifier.startsWith('.'))
      return undefined
    const target = resolve(dirname(file), specifier)
    return sourceMode && !existsSync(target) && existsSync(target.replace(/\.js$/, '.ts'))
      ? target.replace(/\.js$/, '.ts')
      : target
  }
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const child = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? origin(statement.moduleSpecifier.text)
        : undefined
      const exported = child
        ? runtimeSymbols(child, cache, sourceMode)
        : undefined
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
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword))
      continue
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
    const actual = symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
    const declaration = actual.declarations?.[0]
    const value = runtime.has(symbol.getName())
    const type = Boolean(actual.flags & ts.SymbolFlags.Type)
    return {
      name: symbol.getName(),
      kind: value
        ? type ? 'value+type' : 'value'
        : 'type',
      declaration: actual.getName(),
      declarationKind: declaration ? ts.SyntaxKind[declaration.kind] : 'Unresolved',
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

/** 核对真实公开值；普通工厂、纯函数和运行对象都必须从模块对象进入。 */
export function moduleNamespaceIssues(checker, source, runtime, packageName) {
  if (!packageName.startsWith('@h-ai/'))
    return []
  const module = checker.getSymbolAtLocation(source)
  if (!module)
    return []
  const namespace = packageName.slice('@h-ai/'.length).replace(/-([a-z])/g, (_match, character) => character.toUpperCase())
  const issues = []
  const isComponent = (symbol, seen = new Set()) => {
    if (seen.has(symbol))
      return false
    seen.add(symbol)
    for (const node of symbol.declarations ?? []) {
      if (/\.svelte(?:\.d\.ts)?$/.test(node.getSourceFile().fileName))
        return true
      if (!ts.isExportSpecifier(node))
        continue
      const specifier = node.parent.parent.moduleSpecifier
      if (!specifier || !ts.isStringLiteral(specifier))
        continue
      if (specifier.text.endsWith('.svelte') && existsSync(resolve(dirname(node.getSourceFile().fileName), specifier.text)))
        return true
      const target = checker.getSymbolAtLocation(specifier)
      const next = target && checker.getExportsOfModule(target).find(item => item.getName() === (node.propertyName ?? node.name).text)
      if (next && isComponent(next, seen))
        return true
    }
    return false
  }
  for (const symbol of checker.getExportsOfModule(module)) {
    const name = symbol.getName()
    if (!runtime.has(name) || name === namespace)
      continue
    const actual = symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
    const declaration = actual.valueDeclaration ?? actual.declarations?.[0]
    if (!declaration)
      continue
    const component = packageName === '@h-ai/ui' && (isComponent(symbol) || isComponent(actual))
    if (component)
      continue
    const extension = (packageName === '@h-ai/reldb' && name === 'BaseReldbCrudRepository')
      || (packageName === '@h-ai/crypto' && ['TransportBodyTooLargeError', 'TransportTimeError'].includes(name))
    if (extension)
      continue
    const type = checker.getTypeOfSymbolAtLocation(actual, declaration)
    const callable = checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0
      || checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0
    const staticDefinition = /Schema$|Contract$|^[A-Z][A-Z\d_]+$/.test(name) || checker.isArrayType(type)
    const operations = !staticDefinition && checker.getPropertiesOfType(type).some((property) => {
      const member = checker.getTypeOfSymbolAtLocation(property, declaration)
      return checker.getSignaturesOfType(member, ts.SignatureKind.Call).length > 0
    })
    if (callable || operations)
      issues.push(`${name}: runtime operations must belong to ${namespace}`)
  }
  return issues
}

/** 归一化构建声明路径；.svelte 文件有独立的 .svelte.d.ts 声明。 */
function declarationFile(entry) {
  if (entry.file.endsWith('.d.ts'))
    return entry.file
  const candidate = entry.file.endsWith('.js')
    ? `${entry.file.slice(0, -3)}.d.ts`
    : `${entry.file}.d.ts`
  return existsSync(candidate)
    ? candidate
    : undefined
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
      return {
        name: manifest.name,
        directory,
        entries: expandPackageExports(directory, manifest.exports ?? {}),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const declarations = [
    ...new Set(packages.flatMap(pkg => pkg.entries.map(declarationFile).filter(Boolean))),
  ]
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
  const namespaceCache = new Map()
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
          const runtime = existsSync(`${plain}.js`)
            ? `${plain}.js`
            : plain
          cache.set(declaration, source
            ? exportedSymbols(checker, source, runtimeSymbols(runtime, runtimeCache))
            : [])
        }
        symbols = cache.get(declaration)
        if (!namespaceCache.has(declaration)) {
          const source = program.getSourceFile(declaration)
          const plain = declaration.replace(/\.d\.ts$/, '')
          const runtime = existsSync(`${plain}.js`)
            ? `${plain}.js`
            : plain
          namespaceCache.set(declaration, source
            ? moduleNamespaceIssues(checker, source, runtimeSymbols(runtime, runtimeCache), pkg.name)
            : [])
        }
        for (const issue of namespaceCache.get(declaration))
          errors.push(`${pkg.name}${entry.subpath.slice(1)} [${entry.conditions.join(', ')}]: ${issue}`)
      }
      return {
        subpath: entry.subpath,
        conditions: entry.conditions,
        target: entry.target,
        exists,
        symbols,
      }
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
      if (expanded.length) {
        groups.set(`${prefix === './components/'
          ? './components/ 下的显式入口'
          : './styles/*'}（${new Set(expanded.map(entry => entry.subpath)).size} 个真实子路径，见 JSON）`, '逐项记录')
      }
    }
    for (const [entry, count] of groups)
      lines.push(`| ${pkg.package} | \`${entry}\` | ${count} |`)
  }
  lines.push('', 'CLI 根入口是命令启动入口，不提供命名库 API；运行冒烟使用隔离进程的 --help/--version。UI 的 .svelte 条件由 Svelte 构建器消费，不能用 Node 的原生模块加载器直接执行组件文件。其余服务端导入冒烟不调用 init，不连接外部服务。', '')
  return lines.join('\n')
}

/** 只读写受控生成目录中的普通单链接文件；不能改写外部共享 inode。 */
function updateSnapshot(file, content, checkOnly) {
  const parent = lstatSync(dirname(file))
  if (!parent.isDirectory() || parent.isSymbolicLink())
    throw new Error(`Unsafe API inventory directory: ${dirname(file)}`)
  const regular = (metadata) => {
    if (!metadata.isFile() || metadata.nlink !== 1)
      throw new Error(`Unsafe API inventory file: ${file}`)
  }
  const existing = () => {
    try {
      const metadata = lstatSync(file)
      regular(metadata)
      return metadata
    }
    catch (error) {
      if (error?.code === 'ENOENT')
        return undefined
      throw error
    }
  }
  const before = existing()
  if (before) {
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    try {
      const opened = fstatSync(fd)
      regular(opened)
      if (before.dev !== opened.dev || before.ino !== opened.ino)
        throw new Error(`API inventory changed while opening: ${file}`)
      if (readFileSync(fd, 'utf8').replaceAll('\r\n', '\n') === content)
        return false
    }
    finally {
      closeSync(fd)
    }
  }
  if (checkOnly)
    return true
  const temporary = join(dirname(file), `.hai-api-${randomUUID()}.tmp`)
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644)
  const owned = fstatSync(fd)
  try {
    try {
      writeFileSync(fd, content, 'utf8')
      fsyncSync(fd)
    }
    finally {
      closeSync(fd)
    }
    existing()
    const candidate = lstatSync(temporary)
    if (!candidate.isFile() || candidate.nlink !== 1 || owned.dev !== candidate.dev || owned.ino !== candidate.ino)
      throw new Error(`API inventory temporary file changed: ${file}`)
    renameSync(temporary, file)
  }
  finally {
    try {
      const candidate = lstatSync(temporary)
      if (candidate.isFile() && owned.dev === candidate.dev && owned.ino === candidate.ino)
        unlinkSync(temporary)
    }
    catch { /* 发布成功或失败均只清理本次仍拥有的临时文件。 */ }
  }
  return true
}

/** 从 tsup 的真实 entry 声明读取别名；不执行构建配置或初始化包。 */
function buildEntries(file) {
  const entries = new Map()
  if (!existsSync(file))
    return entries
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source).replaceAll(/['"]/g, '') === 'entry') {
      if (ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) {
          if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer))
            entries.set(`${property.name.getText(source).replaceAll(/['"]/g, '')}.js`, property.initializer.text)
        }
      }
      if (ts.isArrayLiteralExpression(node.initializer)) {
        for (const element of node.initializer.elements) {
          if (ts.isStringLiteral(element))
            entries.set(element.text.replace(/^src\//, '').replace(/\.ts$/, '.js'), element.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return entries
}

/** 覆盖全部 exports 条件和真实子路径；无法映射时失败，避免缩小检查范围。 */
export function inspectSourceModuleApi(repository) {
  const entries = []
  const errors = []
  for (const directory of readdirSync(join(repository, 'packages'))) {
    const base = join(repository, 'packages', directory)
    const file = join(base, 'package.json')
    if (!existsSync(file))
      continue
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    const build = buildEntries(join(base, 'tsup.config.ts'))
    const seen = new Set()
    for (const entry of expandPackageExports(base, manifest.exports ?? {})) {
      if (!/\.(?:js|svelte)$/.test(entry.target))
        continue
      const target = entry.target.replace(/^\.\/dist\//, '')
      let source = build.has(target)
        ? join(base, build.get(target))
        : undefined
      if (directory === 'ui') {
        source = !entry.target.startsWith('./dist/')
          ? resolve(base, entry.target)
          : [
              join(base, 'src/lib', target.replace(/\.js$/, '.ts')),
              join(base, 'src/lib', target.replace(/\.js$/, '.svelte.ts')),
              join(base, 'src/lib', target),
            ].find(existsSync)
      }
      if (!source || !existsSync(source)) {
        errors.push(`${manifest.name}${entry.subpath.slice(1)}: cannot map source for ${entry.target}`)
        continue
      }
      const key = `${entry.subpath}|${source}`
      if (seen.has(key))
        continue
      seen.add(key)
      entries.push({ package: manifest.name, subpath: entry.subpath, source })
    }
  }
  const program = ts.createProgram([
    ...new Set(entries.map(entry => entry.source)),
  ], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    skipLibCheck: true,
    noEmit: true,
  })
  const configFile = join(repository, 'tsconfig.json')
  if (existsSync(configFile)) {
    const config = ts.readConfigFile(configFile, ts.sys.readFile)
    if (config.error)
      errors.push(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
    const aliases = config.config?.compilerOptions?.paths ?? {}
    for (const [specifier, targets] of Object.entries(aliases)) {
      const expected = entries.filter(entry => `${entry.package}${entry.subpath.slice(1)}` === specifier)
      if (!expected.length)
        continue
      for (const target of targets) {
        if (!expected.some(entry => resolve(entry.source) === resolve(repository, target)))
          errors.push(`${specifier}: TypeScript alias must point to a public source entry: ${target}`)
      }
    }
  }
  const checker = program.getTypeChecker()
  const runtimeCache = new Map()
  for (const entry of entries) {
    const source = program.getSourceFile(entry.source)
    const module = source && checker.getSymbolAtLocation(source)
    if (!module) {
      errors.push(`${entry.package}${entry.subpath.slice(1)}: source module is unavailable`)
      continue
    }
    const runtime = runtimeSymbols(entry.source, runtimeCache, true)
    for (const issue of moduleNamespaceIssues(checker, source, runtime, entry.package))
      errors.push(`${entry.package}${entry.subpath.slice(1)}: ${issue}`)
  }
  return { packages: new Set(entries.map(entry => entry.package)).size, entries: entries.length, errors }
}

/** 写入或校验稳定快照；符号变化必须经审查后重新生成。 */
function main() {
  const inventory = inspectModuleApi(root)
  const outputs = [
    ['scripts/generated/module-api-inventory.json', `${JSON.stringify(inventory, null, 2)}\n`],
    [
      'scripts/generated/module-api-inventory.md',
      markdown(inventory),
    ],
  ]
  const errors = [
    ...inspectSourceModuleApi(root).errors,
    ...inventory.errors,
  ]
  for (const [path, content] of outputs) {
    const file = join(root, path)
    const checkOnly = process.argv.includes('--check')
    const changed = updateSnapshot(file, content, checkOnly)
    if (process.argv.includes('--check')) {
      if (changed)
        errors.push(`API inventory is stale: ${path}`)
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
