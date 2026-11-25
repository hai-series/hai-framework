/** 应用仅加载一份运行配置；部署阶段在隔离 Node 容器内定稿连接与托管密码。 */
import { Buffer } from 'node:buffer'
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const maximumBytes = 1024 * 1024
const refreshCookieSecure = 'HAI_SERV_REFRESH_COOKIE_SECURE'
// 启动参数、代理身份和 adapter 转发信任均由 Compose 固定，不属于业务可重载配置。
const startupEnvironment = new Set([
  'NODE_OPTIONS',
  'HAI_DEPLOY_PRIVATE_PROXY',
  'PROTOCOL_HEADER',
  'HOST_HEADER',
  'PORT_HEADER',
  'ADDRESS_HEADER',
  'XFF_DEPTH',
])

/** 拒绝特殊文件、链接、超限与不可读文件，不输出秘密。 */
function readText(name) {
  let descriptor
  try {
    descriptor = openSync(new URL(name, import.meta.url), constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0))
  }
  catch {
    throw new Error('Runtime environment file is missing or not readable')
  }
  try {
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || stat.size > maximumBytes)
      throw new Error('Runtime environment file must be a regular file no larger than 1 MiB')
    const buffer = Buffer.alloc(maximumBytes + 1)
    let length = 0
    while (length < buffer.length) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, null)
      if (!count)
        break
      length += count
    }
    if (length > maximumBytes)
      throw new Error('Runtime environment file exceeds 1 MiB')
    return buffer.subarray(0, length).toString('utf8')
  }
  finally {
    closeSync(descriptor)
  }
}

/** 与 Core 一致地读取 dotenv 字面值，包括生成器转义的回车和 CRLF。 */
function readEnvironment(name) {
  if (name === '-')
    return {}
  try {
    const text = readText(name)
    const values = parseEnv(text)
    const names = new Set()
    // 此脚本独立交付，行尾标记与 Core 的 dotenv 编码保持一致。
    const assignments = /^[ \t]*(?:export[ \t]+)?([A-Z_]\w*)[ \t]*=[ \t]*(?:'[^']*'|("(?:[^"\\]|\\.)*")(?:[ \t]+(# hai:json)[ \t]*(?=\r?\n|$))?|`[^`]*`|[^\r\n]*)/gim
    for (const match of text.matchAll(assignments)) {
      if (names.has(match[1]))
        throw new Error('Duplicate environment variable')
      names.add(match[1])
      const literal = match[2]
      const marked = match[3] !== undefined
      if (literal !== undefined && marked)
        values[match[1]] = JSON.parse(literal)
    }
    return values
  }
  catch { throw new Error('Runtime environment file could not be parsed') }
}

/** 校验最终生效的独立进程开关，允许空值使用 Serv 默认策略。 */
function validateRefreshCookie(values) {
  const value = values[refreshCookieSecure]
  if (value && value !== 'true' && value !== 'false')
    throw new Error(`Runtime environment file: ${refreshCookieSecure} must be true, false or empty`)
}

/** 清单只保存非敏感元数据，不把环境值放入错误消息。 */
function readManifest(name) {
  if (name === '-')
    return { metadata: {} }
  try {
    const value = JSON.parse(readText(name))
    if (!value || typeof value !== 'object' || Array.isArray(value) || !value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata)
      || Object.values(value.metadata).some(item => typeof item !== 'string')) {
      throw new Error('Invalid manifest')
    }
    return value
  }
  catch { throw new Error('Deployment manifest could not be parsed') }
}

/** 服务器凭据只在部署时注入最终配置；运行启动器不再读取第二份覆盖文件。 */
function applyManagedPasswords(values, bindings, state) {
  for (const line of bindings.split('\n').filter(Boolean)) {
    const [group, prefix, scope] = line.split(' ')
    if (scope !== 'prefix' || !Object.keys(values).some(key => key === prefix || key.startsWith(`${prefix}_`)))
      continue
    if (!['DB_PASSWORD', 'STORAGE_PASSWORD', 'LDAP_PASSWORD'].includes(group) || !state[group])
      throw new Error('Managed middleware credential state is missing')
    const password = state[group]
    let configuration = {}
    const parent = Object.hasOwn(values, prefix)
    if (parent) {
      try {
        configuration = JSON.parse(values[prefix])
        if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration))
          throw new Error('Invalid object')
      }
      catch { throw new Error(`Invalid managed application configuration: ${prefix}`) }
    }
    const passwordField = prefix === 'HAI_STORAGE'
      ? 'secretAccessKey'
      : prefix === 'HAI_IAM_LDAP'
        ? 'bindPassword'
        : 'password'
    if (![
      'HAI_STORAGE',
      'HAI_IAM_LDAP',
      'HAI_DB',
      'HAI_VECDB',
    ].includes(prefix)) {
      throw new Error('Unsupported managed middleware binding')
    }
    const url = values[`${prefix}_URL`] ?? configuration.url
    if (['HAI_DB', 'HAI_VECDB'].includes(prefix) && url) {
      try {
        const connection = new URL(url)
        connection.password = encodeURIComponent(password)
        values[`${prefix}_URL`] = connection.toString()
      }
      catch { throw new Error(`Invalid managed application connection: ${prefix}`) }
    }
    else {
      values[`${prefix}_${passwordField.toUpperCase()}`] = password
    }
  }
}

/** 保留父 JSON、细项和字面回车，结果由容器中同一版本的启动器读取。 */
function serialize(values) {
  return `${Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).filter(([name]) => !startupEnvironment.has(name)).map(([name, value]) => {
    let literal = `'${value}'`
    if (value.includes('\'') || value.includes('\r'))
      literal = `${JSON.stringify(value)} # hai:json`
    return `${name}=${literal}`
  }).join('\n')}\n`
}

/** 局部后端发布沿用当前连接，完整发布采用新配置；不改动托管凭据状态。 */
function prepare(directory, previousManifest, previousEnvironment, credentialState, mode) {
  if (!['full', 'partial'].includes(mode))
    throw new Error('Invalid runtime configuration preparation mode')
  const base = new URL(directory, import.meta.url)
  const incoming = readManifest(new URL('manifest.json', base))
  const previous = mode === 'full'
    ? { metadata: {} }
    : readManifest(previousManifest)
  const before = mode === 'full'
    ? {}
    : readEnvironment(previousEnvironment)
  const next = readEnvironment(new URL('config/.env.runtime', base))
  const entries = key => [
    ...new Set(`${previous.metadata[key] ?? ''}\n${incoming.metadata[key] ?? ''}`.split('\n').filter(Boolean)),
  ]
  const keys = entries('managed-app-keys')
  if (keys.some(key => !/^HAI_[A-Z0-9_]+$/.test(key)))
    throw new Error('Invalid managed application environment key')
  if (mode === 'partial') {
    for (const key of keys) {
      const retained = Object.keys(before).filter(name => name === key || name.startsWith(`${key}_`))
      if (retained.length) {
        for (const name of Object.keys(next)) {
          if (name === key || name.startsWith(`${key}_`))
            delete next[name]
        }
        for (const name of retained)
          next[name] = before[name]
      }
    }
  }
  const bindings = entries('managed-bindings').join('\n')
  const state = readEnvironment(credentialState)
  if (Object.entries(state).some(([key, value]) => !['DB_PASSWORD', 'STORAGE_PASSWORD', 'LDAP_PASSWORD'].includes(key) || !/^[\w-]{32}$/.test(value)))
    throw new Error('Managed middleware credential state is invalid')
  applyManagedPasswords(next, bindings, state)
  validateRefreshCookie(next)
  incoming.metadata['managed-app-keys'] = `${keys.join('\n')}${keys.length ? '\n' : ''}`
  incoming.metadata['managed-bindings'] = `${bindings}${bindings ? '\n' : ''}`
  const environment = serialize(next)
  if (Buffer.byteLength(environment) > maximumBytes)
    throw new Error('Prepared runtime environment exceeds 1 MiB')
  return { environment, manifest: incoming }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'prepare' || process.argv.length !== 8)
    throw new Error('Runtime preparation requires a release directory, previous manifest, current environment, credential state and mode')
  process.stdout.write(JSON.stringify(prepare(...process.argv.slice(3))))
}
else {
  const values = readEnvironment('./config/.env.runtime')
  for (const name of startupEnvironment)
    delete values[name]
  // HAI 配置的显式进程来源最高；镜像内 NODE_ENV/HOST/PORT 默认值由运行文件定稿。
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => name.startsWith('HAI_') && value !== undefined))
  for (const name of Object.keys(inherited).sort((left, right) => left.length - right.length)) {
    for (const previous of Object.keys(values)) {
      // 与 Core 来源合并保持一致：独立开关只允许同名变量覆盖。
      if (previous !== refreshCookieSecure && previous.startsWith(`${name}_`))
        delete values[previous]
    }
    values[name] = inherited[name]
  }
  validateRefreshCookie(values)
  Object.assign(process.env, values)
}
