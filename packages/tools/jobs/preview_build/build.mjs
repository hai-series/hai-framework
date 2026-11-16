/** 固定浏览器构建器：只读项目源码，不执行项目脚本、配置或依赖安装。 */
import { Buffer } from 'node:buffer'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse as parseJavaScript } from 'acorn'
import * as esbuild from 'esbuild'
import { parse, serialize } from 'parse5'
import { compile, parse as parseComponent } from 'svelte/compiler'

const LIMIT = 1024 * 1024
const expectedVersions = {
  acorn: '8.19.0',
  esbuild: '0.28.2',
  parse5: '8.1.0',
  svelte: '5.57.3',
}
const require = createRequire(import.meta.url)
const toolDirectory = path.dirname(fileURLToPath(import.meta.url))
const runtimeImports = new Set([
  'svelte',
  'svelte/animate',
  'svelte/easing',
  'svelte/events',
  'svelte/legacy',
  'svelte/motion',
  'svelte/store',
  'svelte/transition',
  'svelte/internal/client',
  'svelte/internal/disclose-version',
  'svelte/internal/flags/legacy',
  'svelte/internal/flags/tracing',
])
const sourceLoaders = {
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.css': 'css',
  '.json': 'json',
}
const media = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}
const unsupported = () => Object.assign(new Error('Unsupported preview project'), { code: 'UNSUPPORTED_PROJECT' })
const invalid = () => Object.assign(new Error('Invalid preview project'), { code: 'INVALID_PROJECT' })
const outputLimit = () => Object.assign(new Error('Preview output exceeds its budget'), { code: 'OUTPUT_LIMIT' })
function inside(root, file) {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
function unsafeCharacters(value) {
  return [...value].some(character => character === '\\' || character.charCodeAt(0) < 32)
}
const ignored = file => /^(?:package(?:-lock)?\.json|(?:pnpm-lock|yarn)\..+|tsconfig(?:\..+)?\.json|(?:vite|svelte|rollup|webpack)\.config\..+)$/i.test(path.basename(file))

/** 编译版本由镜像预装，不能从用户项目中解析工具链。 */
async function verifyToolchain() {
  for (const [name, version] of Object.entries(expectedVersions)) {
    let directory = path.dirname(require.resolve(name === 'svelte'
      ? 'svelte/compiler'
      : name))
    let found = false
    while (path.dirname(directory) !== directory) {
      try {
        const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
        if (metadata.name === name) {
          found = metadata.version === version
          break
        }
      }
      catch {}
      directory = path.dirname(directory)
    }
    if (!found)
      throw Object.assign(new Error('Fixed preview toolchain version mismatch'), { code: 'ENVIRONMENT_UNAVAILABLE' })
  }
}

/** 最终代码不能保留需要运行期下载的 import、Node require 或 import.meta。 */
function checkBrowserCode(source) {
  const ast = parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'module' })
  const pending = [ast]
  while (pending.length) {
    const node = pending.pop()
    if (!node || typeof node !== 'object')
      continue
    if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration' || node.type === 'MetaProperty'
      || (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && ['require', '__require'].includes(node.callee.name))) {
      throw unsupported()
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        pending.push(...value)
      else if (value && typeof value === 'object')
        pending.push(value)
    }
  }
}

/** HTML 中的脚本/样式内容不能意外终止所在标签。 */
const scriptText = source => source.replace(/<\/script/gi, '<\\/script')
const styleText = source => source.replace(/<\/style/gi, '<\\/style')
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value
function setAttribute(node, name, value) {
  const current = node.attrs.find(item => item.name === name)
  if (current)
    current.value = value
  else node.attrs.push({ name, value })
}
function setText(node, value) {
  node.childNodes = [
    { nodeName: '#text', value, parentNode: node },
  ]
}
function remove(node) {
  if (node.parentNode)
    node.parentNode.childNodes = node.parentNode.childNodes.filter(item => item !== node)
}

export async function buildPreview(directory) {
  await verifyToolchain()
  const root = await realpath(directory)
  const source = await readFile(path.join(root, 'index.html'))
  if (source.byteLength > LIMIT)
    throw invalid()
  const document = parse(new TextDecoder('utf-8', { fatal: true }).decode(source))
  const elements = []
  const visit = (node) => {
    if (node.tagName)
      elements.push(node)
    for (const child of node.childNodes ?? []) visit(child)
    if (node.content)
      visit(node.content)
  }
  visit(document)
  const head = elements.find(node => node.tagName === 'head')
  let assetBytes = 0
  let modules = 0

  async function local(specifier, base, extensions = false) {
    if (typeof specifier !== 'string' || !specifier || unsafeCharacters(specifier)
      || /^[a-z][a-z\d+.-]*:/i.test(specifier) || specifier.startsWith('//') || specifier.includes('?')) {
      throw unsupported()
    }
    let decoded
    try {
      decoded = decodeURIComponent(specifier.split('#')[0])
    }
    catch { throw unsupported() }
    if (!decoded || unsafeCharacters(decoded) || decoded.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(decoded))
      throw unsupported()
    const target = decoded.startsWith('/')
      ? path.resolve(root, `.${decoded}`)
      : path.resolve(base, decoded)
    if (!inside(root, target))
      throw unsupported()
    const candidates = extensions
      ? [
          target,
          ...[
            '.js',
            '.mjs',
            '.ts',
            '.tsx',
            '.jsx',
            '.json',
            '.svelte',
            '/index.js',
            '/index.ts',
          ].map(suffix => target + suffix),
        ]
      : [target]
    for (const candidate of candidates) {
      try {
        const resolved = await realpath(candidate)
        const info = await stat(resolved)
        if (!inside(root, resolved) || !info.isFile() || ignored(resolved) || resolved.split(path.sep).includes('node_modules'))
          throw unsupported()
        return resolved
      }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code))
          throw error
      }
    }
    throw unsupported()
  }

  function inspectSvg(contents) {
    const tree = parse(contents)
    const pending = [tree]
    while (pending.length) {
      const node = pending.pop()
      if ([
        'script',
        'foreignObject',
        'iframe',
        'object',
        'embed',
      ].includes(node.tagName)) {
        throw unsupported()
      }
      for (const item of node.attrs ?? []) {
        if (item.name.startsWith('on') || (['href', 'src'].includes(item.name) && !item.value.startsWith('#'))
          || (item.name === 'style' && /@import|url\(\s*[^#]/i.test(item.value))) {
          throw unsupported()
        }
      }
      pending.push(...(node.childNodes ?? []))
    }
    if (/@import|url\(\s*["']?[^\s#"']/i.test(contents))
      throw unsupported()
  }

  async function readMedia(file) {
    const type = media[path.extname(file).toLowerCase()]
    if (!type)
      throw unsupported()
    const data = await readFile(file)
    assetBytes += data.byteLength
    if (assetBytes > 8 * LIMIT)
      throw outputLimit()
    if (type === 'image/svg+xml')
      inspectSvg(new TextDecoder('utf-8', { fatal: true }).decode(data))
    return { data, type }
  }

  async function dataUrl(specifier, base) {
    const file = await local(specifier, base)
    const { data, type } = await readMedia(file)
    return `data:${type};base64,${data.toString('base64')}${specifier.includes('#')
      ? `#${specifier.split('#').slice(1).join('#')}`
      : ''}`
  }

  /** 仅重写模板 AST 的静态资源属性；动态资源继续使用源码中的本地 import。 */
  async function componentResources(contents, file) {
    const tree = parseComponent(contents, { modern: true })
    const pending = [tree.fragment]
    const replacements = []
    while (pending.length) {
      const node = pending.pop()
      if (!node || typeof node !== 'object')
        continue
      if (['RegularElement', 'SvelteElement'].includes(node.type)) {
        for (const item of node.attributes) {
          if (item.type !== 'Attribute')
            continue
          if (item.name === 'srcset')
            throw unsupported()
          if (!['src', 'poster'].includes(item.name))
            continue
          let value
          if (Array.isArray(item.value) && item.value.every(part => part.type === 'Text'))
            value = item.value.map(part => part.data).join('')
          else if (item.value?.type === 'ExpressionTag' && item.value.expression.type === 'Literal' && typeof item.value.expression.value === 'string')
            value = item.value.expression.value
          if (value) {
            const embedded = await dataUrl(value, path.dirname(file))
            replacements.push({ start: item.start, end: item.end, contents: `${item.name}={${JSON.stringify(embedded)}}` })
          }
        }
      }
      for (const child of Object.values(node)) {
        if (Array.isArray(child))
          pending.push(...child)
        else if (child && typeof child === 'object')
          pending.push(child)
      }
    }
    for (const replacement of replacements.sort((left, right) => right.start - left.start))
      contents = contents.slice(0, replacement.start) + replacement.contents + contents.slice(replacement.end)
    return contents
  }

  const componentStyles = new Map()
  const plugin = {
    name: 'fixed-local-project',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.trustedResolve)
          return undefined
        if (args.importer && !inside(root, args.importer))
          return undefined
        if (args.path === 'hai-component-style' && componentStyles.has(args.importer))
          return { path: args.importer, namespace: 'component-style' }
        if (runtimeImports.has(args.path)) {
          const resolved = await build.resolve(args.path, {
            resolveDir: toolDirectory,
            kind: args.kind,
            pluginData: { trustedResolve: true },
          })
          if (resolved.errors.length || !resolved.path)
            throw unsupported()
          return { path: resolved.path }
        }
        if (args.kind === 'url-token' && args.path.startsWith('#'))
          return { path: args.path, external: true }
        if (!args.path.startsWith('.') && !args.path.startsWith('/') && !['url-token', 'import-rule'].includes(args.kind))
          throw unsupported()
        const file = await local(args.path, args.resolveDir || root, true)
        return { path: file }
      })
      build.onLoad({ filter: /.*/, namespace: 'component-style' }, args => ({
        contents: componentStyles.get(args.path),
        loader: 'css',
        resolveDir: path.dirname(args.path),
      }))
      build.onLoad({ filter: /.*/ }, async (args) => {
        if (!inside(root, args.path))
          return undefined
        const extension = path.extname(args.path).toLowerCase()
        const bytes = await readFile(args.path)
        if (bytes.byteLength > LIMIT && !media[extension])
          throw invalid()
        if (media[extension])
          return { contents: (await readMedia(args.path)).data, loader: 'dataurl' }
        const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        if (extension === '.svelte') {
          const compiled = compile(await componentResources(contents, args.path), {
            filename: path.relative(root, args.path),
            generate: 'client',
            dev: false,
            css: 'external',
          })
          if (compiled.css?.code)
            componentStyles.set(args.path, compiled.css.code)
          return {
            contents: compiled.js.code + (compiled.css?.code ? '\nimport "hai-component-style";' : ''),
            loader: 'js',
            resolveDir: path.dirname(args.path),
          }
        }
        if (!sourceLoaders[extension])
          throw unsupported()
        return {
          contents,
          loader: sourceLoaders[extension],
          resolveDir: path.dirname(args.path),
        }
      })
    },
  }

  async function bundle(contents, loader, sourcefile, asModule = true) {
    try {
      const result = await esbuild.build({
        stdin: {
          contents,
          loader,
          sourcefile,
          resolveDir: path.dirname(sourcefile),
        },
        absWorkingDir: root,
        bundle: asModule,
        write: false,
        outfile: path.join(root, '__preview_out.js'),
        ...(loader === 'css'
          ? {
              outfile: path.join(root, '__preview_out.css'),
            }
          : {
              format: asModule ? 'iife' : undefined,
            }),
        platform: 'browser',
        target: 'es2022',
        conditions: ['browser', 'production'],
        tsconfigRaw: { compilerOptions: {} },
        plugins: [plugin],
        logLevel: 'silent',
        metafile: true,
        define: {
          'import.meta.env': JSON.stringify({
            MODE: 'production',
            BASE_URL: './',
            PROD: true,
            DEV: false,
            SSR: false,
          }),
        },
      })
      let code = ''
      let css = ''
      for (const output of result.outputFiles) {
        if (output.path.endsWith('.css')) {
          css += output.text
        }
        else {
          checkBrowserCode(output.text)
          code += output.text
        }
      }
      for (const output of Object.values(result.metafile.outputs)) {
        if (output.imports.some(item => item.external && !item.path.startsWith('#')))
          throw unsupported()
      }
      return { code, css }
    }
    catch (error) {
      if (error.code)
        throw error
      if (error.errors?.some(item => item.detail?.code === 'UNSUPPORTED_PROJECT'))
        throw unsupported()
      throw invalid()
    }
  }

  function appendStyle(css) {
    if (!css)
      return
    const node = {
      nodeName: 'style',
      tagName: 'style',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      attrs: [],
      childNodes: [],
      parentNode: head,
    }
    setText(node, styleText(css))
    head.childNodes.push(node)
  }

  for (const node of elements) {
    const tag = node.tagName
    if (['base', 'iframe', 'object', 'embed'].includes(tag) || (tag === 'meta' && attribute(node, 'http-equiv')?.toLowerCase() === 'refresh'))
      throw unsupported()
    if (tag === 'script') {
      const type = (attribute(node, 'type') ?? '').toLowerCase()
      if (![
        '',
        'module',
        'text/javascript',
        'application/javascript',
      ].includes(type)) {
        if (attribute(node, 'src'))
          throw unsupported()
        continue
      }
      if (attribute(node, 'async') !== undefined || attribute(node, 'defer') !== undefined)
        throw unsupported()
      if (type === 'module' && ++modules > 1)
        throw unsupported()
      const src = attribute(node, 'src')
      const file = src
        ? await local(src, root)
        : path.join(root, '__inline.js')
      const code = src
        ? new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file))
        : (node.childNodes ?? []).map(child => child.value ?? '').join('')
      const built = await bundle(code, sourceLoaders[path.extname(file)] ?? 'js', file, type === 'module')
      node.attrs = node.attrs.filter(item => !['src', 'integrity', 'crossorigin'].includes(item.name))
      setText(node, scriptText(built.code))
      appendStyle(built.css)
    }
    else if (tag === 'link') {
      const rel = (attribute(node, 'rel') ?? '').toLowerCase()
      const href = attribute(node, 'href')
      if (rel === 'modulepreload') {
        remove(node)
        continue
      }
      if (rel === 'stylesheet') {
        if (!href)
          throw unsupported()
        const file = await local(href, root)
        const css = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file))
        const built = await bundle(css, 'css', file)
        node.nodeName = node.tagName = 'style'
        node.attrs = node.attrs.filter(item => item.name === 'media' || item.name === 'title')
        setText(node, styleText(built.css))
      }
      else if (rel.includes('icon') && href) {
        setAttribute(node, 'href', await dataUrl(href, root))
      }
      else if (href && !['canonical', 'alternate'].includes(rel)) {
        throw unsupported()
      }
    }
    else if (tag === 'style') {
      const css = (node.childNodes ?? []).map(child => child.value ?? '').join('')
      setText(node, styleText((await bundle(css, 'css', path.join(root, '__inline.css'))).css))
    }
    else {
      for (const key of ['src', 'poster']) {
        const value = attribute(node, key)
        if (value)
          setAttribute(node, key, await dataUrl(value, root))
      }
      if (attribute(node, 'srcset'))
        throw unsupported()
    }
    const styles = attribute(node, 'style')
    if (styles) {
      const css = (await bundle(`x{${styles}}`, 'css', path.join(root, '__attribute.css'))).css
      setAttribute(node, 'style', css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')).trim())
    }
  }
  document.childNodes = document.childNodes.filter(node => node.nodeName !== '#documentType')
  const html = `<!doctype html>${serialize(document)}`
  if (Buffer.byteLength(html) > LIMIT)
    throw outputLimit()
  return html
}

async function main() {
  const [directory, output, status] = process.argv.slice(2)
  let result
  try {
    const html = await buildPreview(directory)
    await writeFile(output, html, { flag: 'wx' })
    result = { success: true }
  }
  catch (error) {
    result = {
      success: false,
      code: [
        'UNSUPPORTED_PROJECT',
        'INVALID_PROJECT',
        'OUTPUT_LIMIT',
        'ENVIRONMENT_UNAVAILABLE',
      ].includes(error.code)
        ? error.code
        : 'INVALID_PROJECT',
    }
  }
  finally { esbuild.stop() }
  await writeFile(status, JSON.stringify(result), { flag: 'wx' })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => { process.exitCode = 1 })
