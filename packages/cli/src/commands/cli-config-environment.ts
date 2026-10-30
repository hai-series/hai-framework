/**
 * 配置模板与环境变量清单共用的转换逻辑。
 * @module cli-config-environment
 */
import { isMap, isScalar, isSeq, LineCounter, parseDocument, Scalar } from 'yaml'
import catalog from './cli-config-catalog.json' with { type: 'json' }

const catalogByName = new Map(catalog.map(entry => [entry.name, entry]))
const catalogByPath = new Map(catalog.map(entry => [entry.path, entry]))

/** YAML 使用配置块和列表表达结构；环境变量目录中的 JSON 覆盖说明不适合作为字段填写提示。 */
function configurationConstraint(value: string): string {
  return value.replaceAll('JSON 对象；整体覆盖时替换该节点', '配置块（填写下方缩进字段）')
    .replaceAll('JSON 数组；索引可按 0、1、2 扩展', '列表（每项以 - 开头）')
    .replaceAll('string,null', '字符串或空值')
    .replaceAll('；<= 9007199254740991', '')
}

/** 只清理生成的 YAML 注释，不能误删协议正文、标题等字符串里的同名文字。 */
function withoutGeneratedDocumentation(content: string): string {
  const { lines, document: optional, counter } = readOptionalConfig(content)
  const starts: number[] = []
  let offset = 0
  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }
  const ranges: Array<[number, number]> = []
  function originalOffset(position: number, end: boolean): number {
    const location = counter.linePos(position)
    const line = lines[location.line - 1] ?? ''
    const prefix = /^(\s*)# (?=\s*(?:[a-z][\w-]*:|-\s))/i.exec(line)
    const column = location.col - 1
    const removed = prefix && (column > prefix[1].length || (!end && column === prefix[1].length)) ? 2 : 0
    return (starts[location.line - 1] ?? content.length) + column + removed
  }
  function collect(node: unknown, virtual: boolean): void {
    if (isMap(node)) {
      for (const pair of node.items)
        collect(pair.value, virtual)
    }
    else if (isSeq(node)) {
      node.items.forEach(item => collect(item, virtual))
    }
    else if (isScalar(node) && node.range) {
      ranges.push(virtual ? [originalOffset(node.range[0], false), originalOffset(node.range[1], true)] : [node.range[0], node.range[1]])
    }
  }
  collect(parseDocument(content).contents, false)
  if (!optional.errors.length)
    collect(optional.contents, true)
  const protectedAt = (position: number) => ranges.some(([start, end]) => position >= start && position < end)
  return lines.flatMap((line, index) => {
    const metadata = /^(\s*)#\s*(?:用途|说明|取值)：/.exec(line)
    if (metadata && !protectedAt(starts[index] + metadata[1].length))
      return []
    const suffix = line.lastIndexOf(' # 说明：')
    return [suffix >= 0 && !protectedAt(starts[index] + suffix + 1) ? line.slice(0, suffix) : line]
  }).join('\n')
}

/**
 * 将 Schema 的用途说明同步到真实 YAML 字段，保留既有注释和值；重复生成不追加副本。
 * @param name - 模块配置名
 * @param content - 已有 YAML 或已参数化的模板
 * @returns 带字段用途说明的 YAML
 * @example 模块内部上下文
 * ```ts
 * const yaml = documentConfig('iam', 'register:\n  enabled: false\n')
 * // 保留 false，并说明关闭自助注册不会阻止已有账号登录。
 * ```
 */
export function documentConfig(name: string, content: string): string {
  content = withoutGeneratedDocumentation(content)
  const document = parseDocument(content)
  if (document.errors.length)
    throw new Error(`Invalid ${name} configuration documentation source`)
  let changed = false
  function clearGeneratedComments(node: unknown): void {
    if (isMap(node) || isSeq(node) || isScalar(node)) {
      for (const field of ['commentBefore', 'comment'] as const) {
        const previous = node[field]
        if (!previous)
          continue
        const kept = previous.split('\n').filter(line => !/^\s*(?:用途|说明|取值)：/.test(line)).join('\n') || null
        if (kept !== previous) {
          node[field] = kept
          changed = true
        }
      }
    }
  }
  function walk(node: unknown, segments: string[], sequenceItem = false): void {
    // 首字段/段尾的注释可能附在容器或前一个值上；只清理元数据，不触碰 Markdown 正文。
    clearGeneratedComments(node)
    if (isMap(node)) {
      for (const [index, pair] of node.items.entries()) {
        if (!isScalar(pair.key))
          continue
        clearGeneratedComments(pair.key)
        const field = [...segments, String(pair.key.value)]
        const description = catalogByPath.get([name, ...field].join('.').replace(/\.\d+(?=\.|$)/g, '.0'))?.description
        if (description) {
          // 数组项的首字段说明放在短横线之前，避免生成 "- # 注释" 破坏既有排版规范。
          const target = sequenceItem && index === 0 ? node : pair.key
          const entry = catalogByPath.get([name, ...field].join('.').replace(/\.\d+(?=\.|$)/g, '.0'))
          const comment = [target.commentBefore, ` 说明：${description}`, entry?.constraint ? ` 取值：${configurationConstraint(entry.constraint)}` : undefined].filter(Boolean).join('\n')
          if (target.commentBefore !== comment) {
            target.commentBefore = comment
            changed = true
          }
        }
        walk(pair.value, field)
      }
    }
    else if (isSeq(node)) {
      node.items.forEach((item, index) => walk(item, [...segments, String(index)], true))
    }
  }
  walk(document.contents, [])
  return documentOptionalConfig(name, changed ? document.toString({ lineWidth: 0 }) : content)
}

/** 注释中的可选字段同样要说明用途与取值；保持单层 #，不启用可选功能。 */
function documentOptionalConfig(name: string, content: string): string {
  const { lines, document, counter } = readOptionalConfig(content)
  if (document.errors.length)
    return content
  const additions = new Map<number, string>()
  function walk(node: unknown, path: string[]): void {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key))
          continue
        const segments = [...path, String(pair.key.value)]
        const entry = catalogByPath.get([name, ...segments].join('.').replace(/\.\d+(?=\.|$)/g, '.0'))
        if (entry && pair.key.range) {
          const line = counter.linePos(pair.key.range[0]).line - 1
          const prefix = /^(\s*#\s*)(?:-\s*)?[A-Z][\w-]*:/i.exec(lines[line])?.[1]
          // 用行尾说明保留可直接取消注释的 YAML，不额外生成会被误取消注释的说明行。
          if (prefix && !additions.has(line))
            additions.set(line, ` # 说明：${entry.description}；取值：${configurationConstraint(entry.constraint)}`)
        }
        walk(pair.value, segments)
      }
    }
    else if (isSeq(node)) {
      node.items.forEach((item, index) => walk(item, [...path, String(index)]))
    }
  }
  walk(document.contents, [])
  return lines.map((line, index) => line + (additions.get(index) ?? '')).join('\n')
}

/** 将可选示例临时作为 YAML 读取，只用于获取路径和位置，原文件仍保持注释。 */
function readOptionalConfig(content: string) {
  const lines = content.split('\n')
  const virtual = lines.map(line => line.replace(/^(\s*)# (?=\s*(?:[A-Z][\w-]*:|-\s))/i, '$1')).join('\n')
  const counter = new LineCounter()
  const document = parseDocument(virtual, { uniqueKeys: false, lineCounter: counter })
  return { lines, document, counter }
}

/**
 * 单个环境变量的配置位置、示例建议值和取值说明。
 * @example 模块内部上下文
 * ```ts
 * const variable: ConfigEnvironmentVariable = { name: 'HAI_DB_TYPE', path: 'db.type', value: 'sqlite', constraint: 'sqlite | postgresql | mysql' }
 * ```
 */
export interface ConfigEnvironmentVariable {
  /** 环境变量名，例如 HAI_DB_TYPE。 */
  name: string
  /** YAML 字段路径；显式别名使用变量名辅助定位。 */
  path: string
  /** 仍包含必要 YAML 引号的非敏感示例建议值；不等于所有 Provider 的 Schema 默认值。 */
  value: string
  /** 类型、枚举、范围、单位或条件约束。 */
  constraint: string
  /** 字段用途；优先来自模块配置 Schema 的源码注释。 */
  description?: string
  /** 仅出现在注释示例中；.env.example 保持注释，避免误以为该功能已经启用。 */
  optional?: boolean
}

/**
 * 将运行参数改为显式环境引用，保留本地启动默认值和 YAML 注释。
 * 业务正文、表/列名、模型 ID 等结构定义保留在 YAML 中。
 * @param name - 配置名，不含文件名前导下划线
 * @param content - YAML 内容
 * @returns 含环境变量引用的 YAML
 * @example 模块内部上下文
 * ```ts
 * const yaml = parameterizeConfig('db', 'type: sqlite\n') // type: ${HAI_DB_TYPE:sqlite}
 * ```
 */
export function parameterizeConfig(name: string, content: string): string {
  content = parameterizeOptionalConfig(name, content)
  const document = parseDocument(content)
  if (document.errors.length > 0)
    throw new Error(`Invalid ${name} configuration template`)
  if (!document.contents || (isScalar(document.contents) && document.contents.value === null))
    return content

  let changed = false
  function walk(node: unknown, path: string[]): void {
    // 固定业务契约不配置化；正文中的 {code} 等占位符也不能作为环境变量默认值。
    if (['templates', 'supportedLocales', 'id'].includes(path[0]) || path.includes('redact')
      || (name === 'audit' && /^(?:userTable|userIdColumn|userNameColumn)$/.test(path[0] ?? ''))
      || (name === 'iam' && ['ui', 'agreements', 'rbac'].includes(path[0]) && !(path.at(-1) ?? '').endsWith('Url'))
      || (['id', 'name', 'operations'].includes(path.at(-1) ?? '') && path.some(segment => /^\d+$/.test(segment)))) {
      return
    }

    if (isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.key))
          walk(pair.value, [...path, String(pair.key.value)])
      }
    }
    else if (isSeq(node)) {
      node.items.forEach((item, index) => walk(item, [...path, String(index)]))
    }
    else if (isScalar(node) && node.value !== null && node.value !== undefined) {
      const value = String(node.value)
      // 显式厂商凭据名沿用原约定；多行正文和含花括号的业务文本不能嵌入默认值语法。
      if (value.includes('${') || /[\n\r}]/.test(value))
        return
      const variable = ['HAI', name, ...path].map(part => part.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase()).join('_')
      const parsed = parseDocument(value)
      const fallback = typeof node.value === 'string' && value !== '' && (parsed.errors.length > 0 || !isScalar(parsed.contents) || parsed.contents.value !== value) ? JSON.stringify(value) : value
      node.value = `\${${variable}:${fallback}}`
      node.type = Scalar.PLAIN
      changed = true
    }
  }

  walk(document.contents, [])
  return changed ? document.toString({ lineWidth: 0 }) : content
}

/** 可选 YAML 示例保留注释状态，但使用与启用字段相同的环境路径，便于取消注释后直接配置。 */
function parameterizeOptionalConfig(name: string, content: string): string {
  const { lines, document, counter } = readOptionalConfig(content)
  if (document.errors.length)
    return content
  const edits = new Map<number, Array<{ start: number, end: number, value: string }>>()
  function walk(node: unknown, segments: string[]): void {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.key))
          walk(pair.value, [...segments, String(pair.key.value)])
      }
    }
    else if (isSeq(node)) {
      node.items.forEach((item, index) => walk(item, [...segments, String(index)]))
    }
    else if (isScalar(node) && node.range && node.value !== null && node.value !== undefined) {
      const location = counter.linePos(node.range[0])
      const line = lines[location.line - 1]
      if (!/^\s*# /.test(line) || /[\n\r}]/.test(String(node.value)) || String(node.value).includes('${'))
        return
      const field = [name, ...segments].join('.').replace(/\.\d+(?=\.|$)/g, '.0')
      if (!catalogByPath.has(field) || ['id', 'name', 'operations'].includes(segments.at(-1) ?? '') || segments.includes('templates') || segments.includes('redact'))
        return
      const variable = ['HAI', name, ...segments].map(part => part.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase()).join('_')
      const text = String(node.value)
      const parsed = parseDocument(text)
      const fallback = typeof node.value === 'string' && text !== '' && (parsed.errors.length > 0 || !isScalar(parsed.contents) || parsed.contents.value !== text) ? JSON.stringify(text) : text
      const replacement = `\${${variable}:${fallback}}`
      const list = edits.get(location.line - 1) ?? []
      list.push({ start: location.col + 1, end: location.col + 1 + node.range[1] - node.range[0], value: JSON.stringify(replacement) })
      edits.set(location.line - 1, list)
    }
  }
  walk(document.contents, [])
  for (const [index, replacements] of edits) {
    for (const edit of replacements.sort((a, b) => b.start - a.start))
      lines[index] = lines[index].slice(0, edit.start) + edit.value + lines[index].slice(edit.end)
  }
  return lines.join('\n')
}

/**
 * 从实际 YAML 引用提取变量清单，避免 .env 与模板的默认值各维护一份。
 * @param name - 配置名
 * @param content - 已转换的 YAML
 * @returns 去重后的变量列表（含注释中的可选凭据）
 * @example 模块内部上下文
 * ```ts
 * const variables = configEnvironmentVariables('db', 'type: ${HAI_DB_TYPE:sqlite}\n')
 * const name = variables[0]?.name // HAI_DB_TYPE
 * ```
 */
export function configEnvironmentVariables(name: string, content: string): ConfigEnvironmentVariable[] {
  const variables = new Map<string, ConfigEnvironmentVariable>()
  const locations = new Map<string, string>()
  const activeValues = new Map<string, string>()
  function locate(node: unknown, path: string[]): void {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.key))
          locate(pair.value, [...path, String(pair.key.value)])
      }
    }
    else if (isSeq(node)) {
      node.items.forEach((item, index) => locate(item, [...path, String(index)]))
    }
    else if (isScalar(node) && typeof node.value === 'string') {
      for (const match of node.value.matchAll(/\$\{([^}:]+)(?::([^}]*))?\}/g)) {
        locations.set(match[1], [name, ...path].join('.'))
        if (!activeValues.has(match[1]))
          activeValues.set(match[1], match[2] ?? '')
      }
    }
  }
  locate(parseDocument(content).contents, [])
  for (const match of content.matchAll(/\$\{((?:HAI_|PUBLIC_|VITE_|AI_|OPENAI_|GEMINI_|DASHSCOPE_|ARK_|LDAP_)[A-Z0-9_]*)(?::([^}]*))?\}/g)) {
    const [, variable, value = ''] = match
    if (variables.has(variable))
      continue
    const normalized = catalogByName.get(variable.replace(/_\d+(?=_|$)/g, '_0'))
    const entry = catalogByName.get(variable) ?? normalized
    const indices = [...variable.matchAll(/_(\d+)(?=_|$)/g)].map(item => item[1])
    const catalogPath = (entry?.path === variable ? normalized?.path : entry?.path)?.replace(/\.0(?=\.|$)/g, () => `.${indices.shift() ?? '0'}`)
    variables.set(variable, {
      name: variable,
      path: locations.get(variable) ?? catalogPath ?? `${name} (${variable}，可选块)`,
      value: activeValues.get(variable) ?? value,
      constraint: variableConstraint(variable, value),
      description: entry?.description,
      optional: !locations.has(variable),
    })
  }
  return [...variables.values()]
}

/** 根据公开模块 Schema 和基础标量类型描述取值约束。 */
function variableConstraint(name: string, value: string): string {
  const known = catalogByName.get(name) ?? catalogByName.get(name.replace(/_\d+(?=_|$)/g, '_0'))
  if (known)
    return known.constraint
  const enums: Record<string, string> = {
    HAI_CORE_ENV: 'development | test | production | staging',
    HAI_CORE_LOGGING_LEVEL: 'trace | debug | info | warn | error | fatal',
    HAI_CORE_LOGGING_FORMAT: 'json | pretty',
    HAI_DB_TYPE: 'sqlite | postgresql | mysql',
    HAI_CACHE_TYPE: 'memory | redis',
    HAI_STORAGE_TYPE: 'local | s3',
    HAI_VECDB_TYPE: 'lancedb | pgvector | qdrant | chroma',
    HAI_AI_LLM_PROTOCOL: 'chat | responses | anthropic',
    HAI_DB_SSL: 'MySQL：false 或严格 TLS 对象（{} 默认校验证书链和 DNS 身份）；PostgreSQL：布尔值、require/prefer/allow/disable 或 TLS 对象',
    HAI_IAM_PASSWORD_MINLENGTH: '整数 >= 1，且不大于 maxLength',
    HAI_IAM_PASSWORD_MAXLENGTH: '整数 1–256，且不小于 minLength',
    HAI_IAM_PASSWORD_EXPIRATIONDAYS: '整数 >= 0，单位天；0 表示不过期',
    HAI_IAM_SESSION_MAXAGE: '整数 >= 60，单位秒',
    HAI_IAM_SESSION_REFRESHTOKENMAXAGE: '整数 >= 3600，单位秒',
    HAI_IAM_SECURITY_MAXLOGINATTEMPTS: '整数 >= 1',
    HAI_IAM_SECURITY_LOCKOUTDURATION: '整数 >= 60，单位秒',
    HAI_IAM_OTP_LENGTH: '整数 4–8',
    HAI_IAM_OTP_EXPIRESIN: '整数 >= 60，单位秒',
    HAI_IAM_OTP_MAXATTEMPTS: '整数 >= 1',
    HAI_IAM_OTP_RESENDINTERVAL: '整数 >= 30，单位秒',
    HAI_IAM_PASSWORDRESET_MODE: 'email | phone',
    HAI_IAM_PASSWORDRESET_TOKENEXPIRESIN: '整数 >= 300，单位秒',
    HAI_IAM_PASSWORDRESET_MAXATTEMPTS: '整数 >= 1',
  }
  if (enums[name])
    return enums[name]
  if (value === 'true' || value === 'false')
    return 'true | false'
  if (/(?:PASSWORD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATEKEY|BINDPASSWORD|_PASS$)(?:_|$)/.test(name))
    return '敏感字符串；启用对应 Provider 时必须注入，禁止提交真实值'
  if (/(?:^|_)PORT$/.test(name))
    return '整数 1–65535'
  if (name.endsWith('TEMPERATURE'))
    return '数字 0–2'
  if (/^HAI_AI_.*(?:TIMEOUT|MAXTOKENS|CACHE_TTL)$/.test(name))
    return name.endsWith('MAXTOKENS') ? '数字 > 0，单位 token' : '数字 > 0，单位毫秒'
  if (name === 'HAI_CACHE_DB')
    return '整数 0–15'
  if (name === 'HAI_DB_DATABASE')
    return 'SQLite 文件路径或 :memory:；PostgreSQL/MySQL 数据库名'
  if (/(?:BASEURL|ENDPOINT|RESETURL|_URL)$/.test(name))
    return '启用时填写有效 URL；协议由对应 Provider 校验'
  if (/^-?\d+(?:\.\d+)?$/.test(value))
    return '数字；单位与上下界见对应模块 Schema 和 YAML 字段注释'
  return '字符串；枚举、格式及必填条件由对应模块 Schema 校验'
}

/**
 * 将变量列表序列化为可直接复制的 dotenv 配置及逐项说明。
 * @param variables - 从 YAML 提取的变量
 * @returns dotenv 内容
 * @example 模块内部上下文
 * ```ts
 * const variables = configEnvironmentVariables('db', parameterizeConfig('db', 'type: sqlite\n'))
 * const dotenv = renderEnvironment(variables)
 * ```
 */
export function renderEnvironment(variables: ConfigEnvironmentVariable[]): string {
  return variables.map((variable) => {
    // 单引号保留 #、空格与双引号；含单引号时改用双引号并转义。
    const value = variable.value.includes('\'')
      ? JSON.stringify(variable.value)
      : `'${variable.value}'`
    return `# ${variable.path}${variable.description ? ` — ${variable.description}` : ''}\n# 约束：${variable.constraint}\n${variable.name}=${value}`
  }).join('\n\n')
}

/**
 * 获取模块所有可配置变量的说明；未声明在 YAML 中的字段应先启用对应路径。
 * @param module - 配置名，例如 db
 * @returns 从公开 Schema 生成的变量清单
 * @example 模块内部上下文
 * ```ts
 * const variable = moduleEnvironmentVariables('db').find(item => item.name === 'HAI_DB_TYPE')
 * ```
 */
export function moduleEnvironmentVariables(module: string): ConfigEnvironmentVariable[] {
  return catalog.filter(entry => entry.module === module)
}

/**
 * 提取生成源码直接使用的环境入口，复用统一清单中的用途与约束。
 * @param content - 生成后的 Vite、Playwright 或运行时源码
 * @returns 已知入口的去重清单，供环境示例的可选部分使用
 * @example 模块内部上下文
 * ```ts
 * const variables = runtimeEnvironmentVariables('const port = process.env.PORT')
 * const name = variables[0]?.name // PORT（仅提取目录中已知变量）
 * ```
 */
export function runtimeEnvironmentVariables(content: string): ConfigEnvironmentVariable[] {
  const variables = new Map<string, ConfigEnvironmentVariable>()
  for (const match of content.matchAll(/(?:process\.env|import\.meta\.env)(?:\?\.)?\.?(?:([A-Z][A-Z0-9_]+)|\[['"]([A-Z][A-Z0-9_]+)['"]\])|\$\{((?:HAI_|PUBLIC_|VITE_)[A-Z0-9_]+)(?::[^}]*)?\}/g)) {
    const name = match[1] ?? match[2] ?? match[3]
    if (match[0].startsWith('import.meta.env') && ['SSR', 'MODE', 'DEV', 'PROD', 'BASE_URL'].includes(name))
      continue
    const variable = catalogByName.get(name)
    if (variable)
      variables.set(name, variable)
  }
  return [...variables.values()]
}
