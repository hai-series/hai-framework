import { createHash, randomBytes } from 'node:crypto'

const scopePattern = /^[a-f0-9]{64}$/
export const browserScopeCookie = 'hai_playground_scope'

/** 仅通过服务器生成作用域，不依赖浏览器传入的公开 profileId。 */
export function issueBrowserScope(): string {
  return randomBytes(32).toString('hex')
}

/** 老浏览器身份可跨请求复用，非法 Cookie 不用于读取业务数据。 */
export function validBrowserScope(scope: string | undefined): scope is string {
  return scope !== undefined && scopePattern.test(scope)
}

/** 将不可猜测的 Cookie 和用户选择的标签绑定为单独的数据库主体。 */
export function scopeProfile(scope: string, label: string): string {
  return createHash('sha256').update(JSON.stringify([scope, label])).digest('hex')
}
