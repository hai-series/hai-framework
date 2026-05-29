/**
 * @h-ai/deploy — 凭证管理
 *
 * 管理全局凭证文件 `~/.hai/credentials.yml`。
 * 这些 helper 由 `deploy.credentials.*` 对外暴露，供 CLI 在加载 `_deploy.yml`
 * 之前注入 `HAI_DEPLOY_*` 环境变量。
 * @module deploy-credentials
 */

import type { HaiResult } from '@h-ai/core'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { core, err, ok } from '@h-ai/core'
import { parse, stringify } from 'yaml'
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'credentials' })

/** 仅允许写入 deploy 模块自有的环境变量前缀，避免把任意 YAML key 注入 process.env。 */
const DEPLOY_CREDENTIAL_KEY_PATTERN = /^HAI_DEPLOY_[A-Z0-9_]+$/

// ─── 内部工具 ───

/** 校验凭证键名是否属于 deploy 模块。 */
function isAllowedCredentialKey(key: string): boolean {
  return DEPLOY_CREDENTIAL_KEY_PATTERN.test(key)
}

/**
 * 标准化凭证键值对。
 *
 * 仅保留 `HAI_DEPLOY_*` 键，且值必须是可安全序列化为字符串的标量。
 */
function normalizeCredentialEntries(entries: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [key, value] of Object.entries(entries)) {
    if (!isAllowedCredentialKey(key)) {
      logger.warn('Ignoring unsupported deploy credential key', { key })
      continue
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = String(value)
      continue
    }

    logger.warn('Ignoring deploy credential with non-scalar value', { key })
  }

  return normalized
}

/** 在写入前校验单个凭证键名。 */
function assertAllowedCredentialKey(key: string): void {
  if (!isAllowedCredentialKey(key)) {
    throw new Error(deployM('deploy_credentialInvalidKey', { params: { key } }))
  }
}

/** 在写入前校验批量凭证键名。 */
function assertAllowedCredentialEntries(entries: Record<string, string>): void {
  for (const key of Object.keys(entries)) {
    assertAllowedCredentialKey(key)
  }
}

/**
 * 获取凭证文件路径
 *
 * @returns `~/.hai/credentials.yml` 的绝对路径
 */
export function getCredentialsPath(): string {
  return join(homedir(), '.hai', 'credentials.yml')
}

/**
 * 确保凭证目录存在
 *
 * @param filePath - 凭证文件路径
 */
function ensureDir(filePath: string): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * 读取凭证文件内容
 *
 * @returns 解析后的键值对，文件不存在时返回空对象
 */
function readCredentialsFile(): Record<string, string> {
  const filePath = getCredentialsPath()
  if (!existsSync(filePath)) {
    return {}
  }
  const content = readFileSync(filePath, 'utf-8')
  const parsed = parse(content)
  if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }
  return normalizeCredentialEntries(parsed as Record<string, unknown>)
}

/**
 * 写入凭证文件
 *
 * @param data - 凭证键值对
 */
function writeCredentialsFile(data: Record<string, string>): void {
  const filePath = getCredentialsPath()
  ensureDir(filePath)
  const header = '# Managed by hai cli - do not edit manually\n'
  const content = header + stringify(data)
  writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 })
}

// ─── 公共 API ───

/**
 * 加载全局凭证文件并注入到 process.env
 *
 * 读取 `~/.hai/credentials.yml` 中的所有键值对，
 * 将每个 key-value 设置到 `process.env` 中，
 * 使后续 core 配置加载时自动解析 `${HAI_DEPLOY_*}` 变量。
 *
 * @returns 成功返回加载的凭证键名列表
 *
 * @example
 * ```ts
 * const result = loadCredentials()
 * if (result.success) {
 *   console.log(`Loaded ${result.data.length} credentials`)
 * }
 * ```
 */
export function loadCredentials(): HaiResult<string[]> {
  try {
    const data = readCredentialsFile()
    const keys = Object.keys(data)
    for (const key of keys) {
      process.env[key] = String(data[key])
    }
    logger.debug('Credentials loaded', { count: keys.length })
    return ok(keys)
  }
  catch (error) {
    logger.error('Failed to load credentials', { error })
    return err(
      HaiDeployError.CREDENTIAL_ERROR,
      deployM('deploy_credentialError', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      error,
    )
  }
}

/**
 * 保存单个凭证到全局凭证文件
 *
 * 读取已有凭证 → 合并新凭证 → 写回文件。已有同名 key 会被覆盖。
 *
 * @param key - 环境变量名（如 HAI_DEPLOY_VERCEL_TOKEN）
 * @param value - 凭证值
 *
 * @example
 * ```ts
 * saveCredential('HAI_DEPLOY_VERCEL_TOKEN', 'vel_xxx')
 * ```
 */
export function saveCredential(key: string, value: string): HaiResult<void> {
  try {
    assertAllowedCredentialKey(key)
    const data = readCredentialsFile()
    data[key] = value
    writeCredentialsFile(data)
    process.env[key] = value
    logger.debug('Credential saved', { key })
    return ok(undefined)
  }
  catch (error) {
    logger.error('Failed to save credential', { key, error })
    return err(
      HaiDeployError.CREDENTIAL_ERROR,
      deployM('deploy_credentialError', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      error,
    )
  }
}

/**
 * 批量保存凭证到全局凭证文件
 *
 * @param entries - 凭证键值对
 *
 * @example
 * ```ts
 * saveCredentials({
 *   HAI_DEPLOY_VERCEL_TOKEN: 'vel_xxx',
 *   HAI_DEPLOY_NEON_API_KEY: 'neon_xxx',
 * })
 * ```
 */
export function saveCredentials(entries: Record<string, string>): HaiResult<void> {
  try {
    assertAllowedCredentialEntries(entries)
    const data = readCredentialsFile()
    for (const [key, value] of Object.entries(entries)) {
      data[key] = value
      process.env[key] = value
    }
    writeCredentialsFile(data)
    logger.debug('Credentials saved', { count: Object.keys(entries).length })
    return ok(undefined)
  }
  catch (error) {
    logger.error('Failed to save credentials', { error })
    return err(
      HaiDeployError.CREDENTIAL_ERROR,
      deployM('deploy_credentialError', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      error,
    )
  }
}
