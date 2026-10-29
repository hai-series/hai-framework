/** 环境示例的默认值必须匹配消费者公开 schema，而不是复用子 schema 的独立默认值。 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { KnowledgeConfigSchema } from '@h-ai/ai'
import { ChunkOptionsSchema } from '@h-ai/datapipe'
import { IamConfigSchema } from '@h-ai/iam'
import { KitConfigSchema } from '@h-ai/kit'
import { ServConfigSchema } from '@h-ai/serv'
import { it } from 'vitest'

it('aI Knowledge 的父级默认覆盖 datapipe 默认，环境目录与实际解析一致', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../packages/cli/src/commands/cli-config-catalog.json', import.meta.url), 'utf8'))
  const standalone = ChunkOptionsSchema.parse({ mode: 'paragraph' })
  const consumed = KnowledgeConfigSchema.parse({}).chunkOptions
  assert.equal(standalone.overlap, 0)
  assert.equal(consumed.overlap, 200)
  for (const field of ['mode', 'maxSize', 'overlap']) {
    const variable = `HAI_AI_KNOWLEDGE_CHUNKOPTIONS_${field.toUpperCase()}`
    assert.equal(catalog.find(entry => entry.name === variable)?.value, String(consumed[field]), variable)
  }
})

it('数组索引示例不把第零项的默认值复制到每个实际索引', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../packages/cli/src/commands/cli-config-catalog.json', import.meta.url), 'utf8'))
  assert.equal(catalog.find(entry => entry.name === 'HAI_SERV_CORS_ALLOWEDHEADERS_1')?.value, 'Content-Type')
  assert.equal(catalog.find(entry => entry.name === 'HAI_SERV_CORS_ALLOWEDHEADERS_2')?.value, 'X-Client-Id')
})

it('请求策略目录保留真实默认值和复用的访问条件说明', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../packages/cli/src/commands/cli-config-catalog.json', import.meta.url), 'utf8'))
  const serv = ServConfigSchema.parse({})
  const kit = KitConfigSchema.parse({})
  const iam = IamConfigSchema.parse({})
  for (const [name, value] of [
    ['HAI_SERV_HTTP_ACCESS', serv.http.access],
    ['HAI_SERV_HTTP_TRUSTEDPROXIES', serv.http.trustedProxies],
    ['HAI_KIT_ACCESS', kit.access],
    ['HAI_KIT_TRUSTEDPROXIES', kit.trustedProxies],
    ['HAI_IAM_REGISTER_DEFAULTACCOUNTSTATUS', iam.register.defaultAccountStatus],
  ]) {
    assert.equal(catalog.find(entry => entry.name === name)?.value, String(value), name)
  }
  assert.match(catalog.find(entry => entry.name === 'HAI_IAM_LOGINACCESS_ALLOWIPS_0')?.description ?? '', /IP|地址/)
  assert.match(catalog.find(entry => entry.name === 'HAI_SERV_HTTP_ACCESS_RULES_0_WINDOWS_0_END')?.description ?? '', /结束/)
  assert.equal(catalog.some(entry => entry.name === 'HAI_IAM_REGISTER_DEFAULTENABLED'), false)
})
