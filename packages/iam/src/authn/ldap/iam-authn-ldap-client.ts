/** LDAP 默认客户端，应用只需配置连接信息；每次认证独立连接并释放。 */
import type { LdapClientFactory } from './iam-authn-ldap-strategy.js'
import { err, ok } from '@h-ai/core'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'

/** 启用 LDAP 时加载可选 SDK；自定义 ldapClientFactory 不经过此入口。 */
export async function loadLdapClientFactory(): Promise<LdapClientFactory> {
  const { Client } = await import('ldapts')
  return async (config) => {
    const client = new Client({ url: config.url, connectTimeout: config.connectTimeout, timeout: config.connectTimeout })
    try {
      if (config.useTls && config.url.startsWith('ldap://'))
        await client.startTLS({ minVersion: 'TLSv1.2' })
      return ok({
        async bind(dn, password) {
        // 空密码的 simple bind 可能被服务器当作匿名认证，必须先拒绝。
          if (!password)
            return err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
          try {
            await client.bind(dn, password)
            return ok(undefined)
          }
          catch (error) {
            return err(HaiIamError.LDAP_BIND_FAILED, iamM('iam_passwordWrong'), error)
          }
        },
        async search(base, filter, attributes) {
          try {
            const result = await client.search(base, { scope: 'sub', filter, attributes })
            return ok(result.searchEntries.map((entry) => {
              const values: Record<string, string | string[]> = {}
              for (const attribute of attributes) {
                const value = entry[attribute]
                if (typeof value === 'string')
                  values[attribute] = value
                else if (Array.isArray(value))
                  values[attribute] = value.map(item => String(item))
                else if (value !== undefined)
                  values[attribute] = String(value)
              }
              return { dn: entry.dn, attributes: values }
            }))
          }
          catch (error) {
            return err(HaiIamError.LDAP_SEARCH_FAILED, iamM('iam_ldapSearchFailed'), error)
          }
        },
        async unbind() {
          try {
            await client.unbind()
            return ok(undefined)
          }
          catch (error) {
            return err(HaiIamError.LDAP_CONNECTION_FAILED, iamM('iam_ldapConnectionFailed'), error)
          }
        },
      })
    }
    catch (error) {
      await client.unbind().catch(() => {})
      return err(HaiIamError.LDAP_CONNECTION_FAILED, iamM('iam_ldapConnectionFailed'), error)
    }
  }
}
