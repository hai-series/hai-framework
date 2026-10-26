/**
 * 检查模块声明的 JSDoc，并在内存中类型检查示例；不会执行示例或向源码目录写文件。
 * @example `node scripts/check-module-jsdoc.mjs --package core`
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const slash = value => value.replaceAll('\\', '/')

/** 只扫描自有运行时代码；生成翻译、声明产物与测试不属于手写 JSDoc。 */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    if (entry.isDirectory())
      return entry.name === 'paraglide' ? [] : sourceFiles(file)
    return /\.(?:[cm]?[jt]s|svelte)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [file] : []
  })
}

/** 模块注释不能冒充紧邻声明的 JSDoc。 */
function declarationDoc(node, source) {
  const doc = (node.jsDoc ?? []).filter(item => !(item.tags ?? []).some(tag => tag.tagName.text === 'module')).at(-1)
  return doc ? source.slice(doc.pos, doc.end).replaceAll('\r\n', '\n').replace(/^[\t ]*\* ?/gm, '') : ''
}

/** 收集公开声明、全部 type/interface；Svelte 的脚本按真实偏移保留来源位置。 */
export function collectDeclarations(file, source) {
  const scripts = file.endsWith('.svelte')
    ? [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => ({ source: match[1], offset: match.index + match[0].indexOf('>') + 1 }))
    : [{ source, offset: 0 }]
  const records = []
  for (const script of scripts) {
    const parsed = ts.createSourceFile(file, script.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    function visit(node) {
      const exported = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      const structure = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)
      if (structure || (exported && (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)))) {
        const names = ts.isVariableStatement(node) ? node.declarationList.declarations.map(item => item.name.getText(parsed)) : [node.name?.getText(parsed) ?? 'default']
        const position = script.offset + node.getStart(parsed)
        records.push({
          file,
          names,
          kind: ts.SyntaxKind[node.kind],
          exported: Boolean(exported),
          line: source.slice(0, position).split('\n').length,
          end: script.offset + node.end,
          doc: declarationDoc(node, script.source),
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return records
}

/** 每个示例必须明确语言；内部示例以标记选择声明所在作用域，不能跳过类型检查。 */
export function extractExamples(doc) {
  return [...doc.matchAll(/^[\t ]*@example\b/gm)].map((match) => {
    const tail = doc.slice(match.index + match[0].length)
    const nextTag = /^[\t ]*@\w/m.exec(tail)?.index ?? tail.length
    const end = tail.indexOf('*/')
    const block = tail.slice(0, Math.min(nextTag, end < 0 ? tail.length : end))
    const fences = [...block.matchAll(/```(ts|typescript|svelte)[\t ]*\n([\s\S]*?)```/g)]
    return { internal: block.includes('模块内部上下文'), blocks: fences.map(fence => ({ language: fence[1], code: fence[2].trim() })) }
  })
}

/** 编译器仅覆盖虚拟文件；路径、条件导出和依赖声明仍走真实 TypeScript 解析。 */
export function typecheckVirtualFiles(virtualFiles, options = {}) {
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    types: ['node'],
    ...options,
  }
  const files = new Map([...virtualFiles].map(([file, source]) => [slash(resolve(file)), source]))
  const host = ts.createCompilerHost(compilerOptions)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  host.readFile = file => files.get(slash(resolve(file))) ?? readFile(file)
  host.fileExists = file => files.has(slash(resolve(file))) || fileExists(file)
  host.getSourceFile = (file, languageVersion) => {
    const source = host.readFile(file)
    return source === undefined ? undefined : ts.createSourceFile(file, source, languageVersion, true)
  }
  host.resolveModuleNames = (names, containingFile) => names.map((name) => {
    if (name.startsWith('.') && name.endsWith('.svelte')) {
      // svelte2tsx 的普通 tsc 消费不会解析组件源文件；使用真实构建的组件声明保留 Props/Snippet 类型。
      const source = slash(resolve(dirname(containingFile), name))
      const sourceRoot = slash(join(root, 'packages/ui/src/lib/'))
      if (source.startsWith(sourceRoot)) {
        const declaration = `${join(root, 'packages/ui/dist', source.slice(sourceRoot.length))}.d.ts`
        if (existsSync(declaration))
          return { resolvedFileName: declaration, extension: ts.Extension.Dts }
      }
    }
    return ts.resolveModuleName(name, containingFile, compilerOptions, host).resolvedModule
  })
  const program = ts.createProgram([...files.keys()], compilerOptions, host)
  return ts.getPreEmitDiagnostics(program).filter(diagnostic => !diagnostic.file || files.has(slash(resolve(diagnostic.file.fileName))))
}

/** 从自有脚本提取错误来源；只打印诊断，不读取本地环境文件。 */
function diagnosticText(diagnostic) {
  const location = diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : undefined
  const prefix = diagnostic.file ? `${slash(relative(root, diagnostic.file.fileName))}${location ? `:${location.line + 1}:${location.character + 1}` : ''}: ` : ''
  return `${prefix}TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
}

/**
 * 校验指定模块；公开示例独立编译，内部示例注入原声明位置后编译，均不执行。
 * @example `await checkPackages(['core'], { examples: true })`
 */
export async function checkPackages(packages, { examples = true } = {}) {
  const failures = []
  const virtualPublic = new Map()
  const internalEdits = new Map()
  const stats = []
  let id = 0
  let svelte2tsx
  const svelteShims = []
  async function transformSvelte(file, source) {
    if (!svelte2tsx) {
      const imported = await import('svelte2tsx')
      svelte2tsx = imported.svelte2tsx
      for (const name of ['svelte-shims-v4.d.ts', 'svelte-jsx-v4.d.ts']) {
        const path = fileURLToPath(import.meta.resolve(`svelte2tsx/${name}`))
        svelteShims.push([path, readFileSync(path, 'utf8')])
      }
    }
    try {
      return svelte2tsx(source, { filename: file, isTsFile: true }).code
    }
    catch (error) {
      failures.push(`${slash(relative(root, file))}: Svelte 示例解析失败：${error instanceof Error ? error.message : String(error)}`)
      return 'export {}'
    }
  }
  for (const pkg of packages) {
    let declarations = 0
    let exampleCount = 0
    for (const file of sourceFiles(join(root, 'packages', pkg, 'src'))) {
      const source = readFileSync(file, 'utf8')
      const edits = []
      for (const record of collectDeclarations(file, source)) {
        declarations += record.names.length
        const label = `${slash(relative(root, file))}:${record.line} ${record.names.join(', ')}`
        if (!record.doc)
          failures.push(`${label}: 缺少声明 JSDoc`)
        const snippets = extractExamples(record.doc)
        if (!snippets.length)
          failures.push(`${label}: 缺少 @example`)
        for (const snippet of snippets) {
          if (!snippet.blocks.length)
            failures.push(`${label}: @example 必须包含 fenced ts/svelte 代码`)
          for (const block of snippet.blocks) {
            exampleCount++
            if (!block.code) {
              failures.push(`${label}: 示例不能为空`)
              continue
            }
            if (!examples)
              continue
            id++
            if (snippet.internal) {
              if (block.language === 'svelte' || /^(?:import|export)\s/m.test(block.code)) {
                failures.push(`${label}: 内部示例不能嵌套 import/export 或 Svelte 标记`)
                continue
              }
              edits.push({ offset: record.end, code: `\nasync function __haiDocExample${id}() {\n${block.code}\n}\n` })
            }
            else {
              const name = `${basename(file).replace(/\W/g, '_')}_${record.names[0].replace(/\W/g, '_')}_${id}`
              const exampleFile = join(dirname(file), `__hai_doc_${name}.${block.language === 'svelte' ? 'tsx' : 'ts'}`)
              const exampleSource = block.language === 'svelte' ? await transformSvelte(exampleFile.replace(/\.tsx$/, '.svelte'), block.code) : `${block.code}\nexport {}\n`
              virtualPublic.set(exampleFile, exampleSource)
            }
          }
        }
      }
      if (edits.length) {
        const modified = edits.sort((a, b) => b.offset - a.offset).reduce((text, edit) => text.slice(0, edit.offset) + edit.code + text.slice(edit.offset), source)
        internalEdits.set(file.endsWith('.svelte') ? `${file}.tsx` : file, file.endsWith('.svelte') ? await transformSvelte(file, modified) : modified)
      }
    }
    stats.push({ package: pkg, declarations, examples: exampleCount })
  }
  if (examples) {
    for (const [file, source] of svelteShims)
      virtualPublic.set(file, source)
    failures.push(...typecheckVirtualFiles(virtualPublic, { jsx: ts.JsxEmit.Preserve }).map(diagnosticText))
    if (internalEdits.size) {
      // 内部示例保留项目别名；它们的目的为解释实现，不冒充公开入口的可消费性证明。
      const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile)
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
      // 内部源码沿用所属包的环境声明；定向检查 UI 时也应识别其 CSS 模块导入。
      for (const pkg of packages) {
        const ambient = join(root, 'packages', pkg, 'ambient.d.ts')
        if (existsSync(ambient))
          internalEdits.set(ambient, readFileSync(ambient, 'utf8'))
      }
      for (const [file, source] of svelteShims)
        internalEdits.set(file, source)
      failures.push(...typecheckVirtualFiles(internalEdits, { ...parsed.options, noEmit: true, noUnusedLocals: false, noUnusedParameters: false, jsx: ts.JsxEmit.Preserve }).map(diagnosticText))
    }
  }
  return { stats, failures }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (let index = 2; index < process.argv.length; index++) {
    if (process.argv[index] === '--package')
      index++
    else if (process.argv[index] !== '--coverage-only')
      throw new Error(`Unknown option: ${process.argv[index]}`)
  }
  const selection = process.argv.indexOf('--package')
  const packages = selection >= 0 ? process.argv[selection + 1]?.split(',') : readdirSync(join(root, 'packages')).filter(name => existsSync(join(root, 'packages', name, 'src')))
  if (!packages?.length || packages.some(name => !/^[a-z][a-z0-9-]*$/.test(name) || !existsSync(join(root, 'packages', name, 'src'))))
    throw new Error('Unknown package selection')
  const result = await checkPackages(packages, { examples: !process.argv.includes('--coverage-only') })
  for (const stat of result.stats)
    process.stdout.write(`${stat.package}: ${stat.declarations} declarations, ${stat.examples} examples\n`)
  for (const failure of result.failures)
    process.stderr.write(`${failure}\n`)
  process.exitCode = result.failures.length ? 1 : 0
}
