/**
 * @h-ai/kit — A2A Agent Card helpers
 *
 * 将应用层简化配置转换为协议兼容的 Agent Card，并提取 API Key 安全配置。
 * @module kit-a2a-agent-card
 */

/** A2A API Key 安全配置 */
export interface A2AApiKeySecurityConfig {
  in: 'header' | 'query'
  name: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null
  return value as Record<string, unknown>
}

function isApiKeyIn(value: unknown): value is 'header' | 'query' {
  return value === 'header' || value === 'query'
}

function parseApiKeySecurity(value: unknown): A2AApiKeySecurityConfig | undefined {
  const security = asRecord(value)
  if (!security)
    return undefined
  const location = security.in
  const name = security.name
  if (!isApiKeyIn(location) || typeof name !== 'string')
    return undefined
  return { in: location, name }
}

/**
 * 从 Agent Card（简化配置或协议对象）中提取 API Key 安全配置。
 */
export function getA2AApiKeySecurity(card: unknown): A2AApiKeySecurityConfig | undefined {
  const record = asRecord(card)
  if (!record)
    return undefined

  const configSecurity = asRecord(record.security)
  const configApiKey = parseApiKeySecurity(configSecurity?.apiKey)
  if (configApiKey)
    return configApiKey

  const schemes = asRecord(record.securitySchemes)
  if (!schemes)
    return undefined

  for (const schemeValue of Object.values(schemes)) {
    const scheme = asRecord(schemeValue)
    if (!scheme || scheme.type !== 'apiKey')
      continue
    const parsed = parseApiKeySecurity({ in: scheme.in, name: scheme.name })
    if (parsed)
      return parsed
  }

  return undefined
}

function isProtocolAgentCard(card: Record<string, unknown>): boolean {
  return typeof card.protocolVersion === 'string'
    && Array.isArray(card.defaultInputModes)
    && Array.isArray(card.defaultOutputModes)
}

/**
 * 归一化 Agent Card，保证 discovery 端点输出协议兼容 payload。
 */
export function toProtocolAgentCard(card: unknown): Record<string, unknown> {
  const record = asRecord(card)
  if (!record)
    return {}

  if (isProtocolAgentCard(record))
    return record

  const skills = Array.isArray(record.skills)
    ? record.skills
        .map((item) => {
          const skill = asRecord(item)
          if (!skill || typeof skill.id !== 'string' || typeof skill.name !== 'string')
            return null
          const tags = Array.isArray(skill.tags)
            ? skill.tags.filter((tag): tag is string => typeof tag === 'string')
            : []
          return {
            id: skill.id,
            name: skill.name,
            description: typeof skill.description === 'string' ? skill.description : '',
            tags,
          }
        })
        .filter((item): item is { id: string, name: string, description: string, tags: string[] } => item !== null)
    : []

  const normalized: Record<string, unknown> = {
    name: typeof record.name === 'string' ? record.name : '',
    description: typeof record.description === 'string' ? record.description : '',
    url: typeof record.url === 'string' ? record.url : '',
    version: typeof record.version === 'string' ? record.version : '1.0.0',
    protocolVersion: '0.3.0',
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    capabilities: {},
    skills,
  }

  const apiKey = getA2AApiKeySecurity(record)
  if (apiKey) {
    normalized.securitySchemes = {
      apiKey: {
        type: 'apiKey',
        in: apiKey.in,
        name: apiKey.name,
      },
    }
    normalized.security = [{ apiKey: [] }]
  }

  return normalized
}
