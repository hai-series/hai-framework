/** Provider 配置收缩必须反映到真实供 CLI/应用消费的环境目录。 */
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const catalog = JSON.parse(await readFile(new URL('../../packages/cli/src/commands/cli-config-catalog.json', import.meta.url), 'utf8'))
const variables = new Map(catalog.map(entry => [entry.name, entry]))

describe('mysql environment contract', () => {
  it('does not advertise unused timezone and preserves provider-specific acquisition bounds', () => {
    expect(variables.has('HAI_DB_MYSQL_TIMEZONE')).toBe(false)
    expect(variables.get('HAI_DB_POOL_ACQUIRETIMEOUT')?.constraint).toContain('PostgreSQL >=0')
    expect(variables.get('HAI_DB_POOL_ACQUIRETIMEOUT')?.constraint).toContain('MySQL 1–2147483647')
    expect(variables.get('HAI_DB_POOL_QUEUELIMIT')?.value).toBe('1000')
    expect(variables.get('HAI_DB_POOL_MIN')?.description).toContain('PostgreSQL')
    expect(variables.get('HAI_DB_POOL_IDLETIMEOUT')?.description).toContain('PostgreSQL')
  })

  it('documents strict TLS defaults and forbids hidden URL options', () => {
    expect(variables.get('HAI_DB_SSL_VERIFYIDENTITY')?.value).toBe('true')
    expect(variables.get('HAI_DB_SSL_REJECTUNAUTHORIZED')?.value).toBe('true')
    expect(variables.get('HAI_DB_SSL_KEY')?.description).toContain('PEM')
    expect(variables.get('HAI_DB_URL')?.description).toContain('query/fragment')
  })
})
