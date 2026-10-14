import type { GuideOptions, GuideProgress } from './guide-types.js'
import { readStoredValue, writeStoredValue } from './internal/browser-safety.js'

/** 存储受限时使用会话内存；只保存非敏感的引导偏好。 */
export function createGuideStorage(options: GuideOptions) {
  const memory = new Map<string, string | null>()
  const persistence = options.persistence ?? 'cookie'

  function read(key: string): string | null {
    if (memory.has(key))
      return memory.get(key) ?? null
    try {
      if (persistence === 'localStorage')
        return readStoredValue(key) ?? memory.get(key) ?? null
      if (persistence === 'cookie' && typeof document !== 'undefined') {
        const prefix = `${encodeURIComponent(key)}=`
        const value = document.cookie.split('; ').find(item => item.startsWith(prefix))
        return value ? decodeURIComponent(value.slice(prefix.length)) : memory.get(key) ?? null
      }
    }
    catch {
      // Cookie 禁用或内容损坏时不影响正常使用。
    }
    return memory.get(key) ?? null
  }

  function write(key: string, value: string | null): void {
    memory.set(key, value)
    try {
      if (persistence === 'localStorage') {
        if (value === null) {
          if (typeof localStorage !== 'undefined')
            localStorage.removeItem(key)
        }
        else {
          writeStoredValue(key, value)
        }
      }
      else if (persistence === 'cookie' && typeof document !== 'undefined') {
        const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : ''
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value ?? '')
        }; Path=/; SameSite=Lax; Max-Age=${value === null ? '0' : '31536000'}${secure}`
      }
    }
    catch {
      // WebView 或隐私模式下保留内存态。
    }
  }

  return {
    get(key: string): GuideProgress | null {
      try {
        const raw = read(key)
        if (!raw)
          return null
        const value: unknown = JSON.parse(raw)
        if (value && typeof value === 'object'
          && 'version' in value && typeof value.version === 'number' && Number.isFinite(value.version)
          && 'updatedAt' in value && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
          && 'status' in value && (value.status === 'completed' || value.status === 'dismissed' || value.status === 'deferred')) {
          return { version: value.version, updatedAt: value.updatedAt, status: value.status }
        }
      }
      catch {
        // 损坏的偏好作为未看过处理。
      }
      return null
    },
    set(key: string, progress: GuideProgress | null) {
      write(key, progress ? JSON.stringify(progress) : null)
    },
  }
}
