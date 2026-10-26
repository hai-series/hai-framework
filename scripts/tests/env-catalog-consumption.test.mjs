/** CLI 的环境建议目录须与实际 Core 配置和安全日志契约一致。 */
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

const catalog = JSON.parse(await readFile(new URL('../../packages/cli/src/commands/cli-config-catalog.json', import.meta.url), 'utf8'))

it('does not generate settings rejected by the strict Core schema', () => {
  const names = catalog.filter(entry => entry.module === 'core').map(entry => entry.name)
  expect(names).toContain('HAI_CORE_LOGGING_LEVEL')
  expect(names.some(name => /^HAI_CORE_(?:DEBUG|ID(?:_|$)|FEATURES(?:_|$)|SUPPORTEDLOCALES(?:_|$))/.test(name))).toBe(false)
})

it('preserves the actual reldb operationLog comment through schema object spreads', () => {
  const description = catalog.find(entry => entry.name === 'HAI_DB_OPERATIONLOG_MAXLENGTH')?.description
  expect(description).toContain('安全数量摘要')
  expect(description).toContain('0 表示省略摘要')
  expect(description).toContain('永不记录 SQL 原文或参数值')
})

it('documents independent host bootstrap secrets without adding them to module configuration', async () => {
  const adminExample = await readFile(new URL('../../apps/admin-console/.env.example', import.meta.url), 'utf8')
  const h5Example = await readFile(new URL('../../apps/h5-app/.env.example', import.meta.url), 'utf8')
  for (const name of ['HAI_AUDIT_ADMIN_PASSWORD', 'HAI_CONFIG_ADMIN_PASSWORD', 'HAI_BUSINESS_OPERATOR_PASSWORD']) {
    expect(catalog.find(entry => entry.name === name)).toMatchObject({ module: 'runtime', value: '' })
    expect(adminExample).toContain(`${name}=''`)
    expect(h5Example).not.toContain(name)
  }
})
