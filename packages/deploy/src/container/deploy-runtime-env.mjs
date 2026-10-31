/** 应用仅加载一份运行配置；部署阶段在隔离 Node 容器内定稿连接与托管密码。 */
import { Buffer } from 'node:buffer'
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const maximumBytes = 1024 * 1024

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

/** 使用与启动入口一致的 dotenv 字面规则，保留混合引号、UTF-8 和多行值。 */
function readEnvironment(name) {
  if (name === '-')
    return {}
  try {
    const text = readText(name)
    const values = parseEnv(text)
    const names = new Set()
    for (const match of text.matchAll(/^(?:export\s+)?([A-Z_]\w*)\s*=\s*('[^']*'|"(?:[^"\\]|\\.)*"|`[^`]*`|[^\r\n]*)/gim)) {
      if (names.has(match[1]))
        throw new Error('Duplicate environment variable')
      names.add(match[1])
      if (match[2].startsWith('"') && (match[2].includes('\\"') || match[2].includes('\\u0027'))) {
        try {
          values[match[1]] = JSON.parse(match[2])
        }
        catch { /* 普通 dotenv 双引号仍按 Node 原生规则解析。 */ }
      }
    }
    return values
  }
  catch { throw new Error('Runtime environment file could not be parsed') }
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
    let password = state[group]
    if (state.FORMAT_VERSION === '2') {
      if (!/^(?:[a-f0-9]{2})+$/.test(password))
        throw new Error('Managed middleware credential encoding is invalid')
      password = Buffer.from(password, 'hex').toString('utf8')
    }
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
    const passwordField = prefix === 'HAI_STORAGE' ? 'secretAccessKey' : prefix === 'HAI_IAM_LDAP' ? 'bindPassword' : 'password'
    if (!['HAI_STORAGE', 'HAI_IAM_LDAP', 'HAI_DB', 'HAI_VECDB'].includes(prefix))
      throw new Error('Unsupported managed middleware binding')
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

/** 保留父 JSON 与显式细项；粗细覆盖由应用通用配置解析器完成。 */
function serialize(values) {
  return `${Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).filter(([name]) => name !== 'NODE_OPTIONS' && name !== 'HAI_DEPLOY_PRIVATE_PROXY').map(([name, value]) => {
    const literal = !value.includes('\'') ? `'${value}'` : JSON.stringify(value).replaceAll('\'', '\\u0027')
    return `${name}=${literal}`
  }).join('\n')}\n`
}

/** 局部后端发布沿用当前连接，完整发布采用新配置；不改动托管凭据状态。 */
function prepare(directory, previousManifest, previousEnvironment, credentialState, mode) {
  if (!['full', 'partial'].includes(mode))
    throw new Error('Invalid runtime configuration preparation mode')
  const base = new URL(directory, import.meta.url)
  const incoming = readManifest(new URL('manifest.json', base))
  const previous = mode === 'full' ? { metadata: {} } : readManifest(previousManifest)
  const before = mode === 'full' ? {} : readEnvironment(previousEnvironment)
  const next = readEnvironment(new URL('config/.env.runtime', base))
  const entries = key => [...new Set(`${previous.metadata[key] ?? ''}\n${incoming.metadata[key] ?? ''}`.split('\n').filter(Boolean))]
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
  const project = incoming.metadata['managed-project'] ?? previous.metadata['managed-project']
  if (state.PROJECT && project && state.PROJECT !== project.trim())
    throw new Error('Managed middleware credential project mismatch')
  applyManagedPasswords(next, bindings, state)
  incoming.metadata['managed-app-keys'] = `${keys.join('\n')}${keys.length ? '\n' : ''}`
  incoming.metadata['managed-bindings'] = `${bindings}${bindings ? '\n' : ''}`
  if (project)
    incoming.metadata['managed-project'] = project
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
  // 启动参数与私有代理身份属于部署装配，不由业务运行文件覆盖。
  delete values.NODE_OPTIONS
  delete values.HAI_DEPLOY_PRIVATE_PROXY
  // HAI 配置的显式进程来源最高；镜像内 NODE_ENV/HOST/PORT 默认值由运行文件定稿。
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => name.startsWith('HAI_') && value !== undefined))
  for (const name of Object.keys(inherited).sort((left, right) => left.length - right.length)) {
    for (const previous of Object.keys(values)) {
      if (previous.startsWith(`${name}_`))
        delete values[previous]
    }
    values[name] = inherited[name]
  }
  Object.assign(process.env, values)
}
