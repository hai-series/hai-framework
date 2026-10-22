/**
 * 配置模板与环境变量清单共用的转换逻辑。
 * @module cli-config-environment
 */
import { isMap, isScalar, isSeq, parseDocument, Scalar } from 'yaml'
import catalog from './cli-config-catalog.json' with { type: 'json' }

const catalogByName = new Map(catalog.map(entry => [entry.name, entry]))

/**
 * 单个环境变量的配置位置、示例建议值和取值说明。
 * @example
 * ```ts
 * const variable: ConfigEnvironmentVariable = {
 *   name: 'HAI_DB_TYPE', path: 'db.type', value: 'sqlite', constraint: 'sqlite | postgresql | mysql',
 * }
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
}

/**
 * 将运行参数改为显式环境引用，保留本地启动默认值和 YAML 注释。
 * 业务正文、表/列名、模型 ID 等结构定义保留在 YAML 中。
 * @param name - 配置名，不含文件名前导下划线
 * @param content - YAML 内容
 * @returns 含环境变量引用的 YAML
 * @example
 * ```ts
 * parameterizeConfig('db', 'type: sqlite\n') // type: ${HAI_DB_TYPE:sqlite}
 * ```
 */
export function parameterizeConfig(name: string, content: string): string {
  const document = parseDocument(content)
  if (document.errors.length > 0)
    throw new Error(`Invalid ${name} configuration template`)
  if (!document.contents || (isScalar(document.contents) && document.contents.value === null))
    return content

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
    }
  }

  walk(document.contents, [])
  return document.toString({ lineWidth: 0 })
}

/**
 * 从实际 YAML 引用提取变量清单，避免 .env 与模板的默认值各维护一份。
 * @param name - 配置名
 * @param content - 已转换的 YAML
 * @returns 去重后的变量列表（含注释中的可选凭据）
 * @example
 * ```ts
 * configEnvironmentVariables('db', 'type: ${HAI_DB_TYPE:sqlite}\n')[0].name // HAI_DB_TYPE
 * ```
 */
export function configEnvironmentVariables(name: string, content: string): ConfigEnvironmentVariable[] {
  const variables = new Map<string, ConfigEnvironmentVariable>()
  const locations = new Map<string, string>()
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
      for (const match of node.value.matchAll(/\$\{([^}:]+)/g))
        locations.set(match[1], [name, ...path].join('.'))
    }
  }
  locate(parseDocument(content).contents, [])
  for (const match of content.matchAll(/\$\{((?:HAI_|PUBLIC_|VITE_|AI_|OPENAI_|GEMINI_|DASHSCOPE_|ARK_|LDAP_)[A-Z0-9_]*)(?::([^}]*))?\}/g)) {
    const [, variable, value = ''] = match
    variables.set(variable, {
      name: variable,
      path: locations.get(variable) ?? `${name} (${variable}，可选块)`,
      value,
      constraint: variableConstraint(variable, value),
      description: catalogByName.get(variable)?.description,
    })
  }
  return [...variables.values()]
}

/** 根据公开模块 Schema 和基础标量类型描述取值约束。 */
function variableConstraint(name: string, value: string): string {
  const known = catalogByName.get(name)
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
    HAI_AI_LLM_API: 'chat | responses | anthropic',
    HAI_DB_SSL: 'false | true | require | prefer | allow | disable；或 TLS 对象',
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
 * @example
 * ```ts
 * renderEnvironment(configEnvironmentVariables('db', parameterizeConfig('db', 'type: sqlite\n')))
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
 * @example moduleEnvironmentVariables('db').find(variable => variable.name === 'HAI_DB_TYPE')
 */
export function moduleEnvironmentVariables(module: string): ConfigEnvironmentVariable[] {
  return catalog.filter(entry => entry.module === module)
}

/**
 * 提取生成源码直接使用的环境入口，复用统一清单中的用途与约束。
 * @param content - 生成后的 Vite、Playwright 或运行时源码
 * @returns 已知入口的去重清单，供环境示例的可选部分使用
 * @example runtimeEnvironmentVariables('const port = process.env.PORT')[0].name // PORT
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
