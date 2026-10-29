import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { CacheConfigSchema } from '@h-ai/cache'
import { AlipayConfigSchema } from '@h-ai/payment'
import { ReldbConfigSchema } from '@h-ai/reldb'
import { StorageConfigSchema } from '@h-ai/storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configEnvironmentVariables, documentConfig, moduleEnvironmentVariables, parameterizeConfig, renderEnvironment, runtimeEnvironmentVariables } from '../src/commands/cli-config-environment.js'
import { generateConfigFile, generateEnvExample } from '../src/commands/cli-config-templates.js'
import { loadConfigText } from './helpers/config.js'

afterEach(() => vi.unstubAllEnvs())

describe('environment configuration', () => {
  it.each(['iam', 'reach'])('真实应用 %s 配置的说明可重复更新，数组与段尾注释不累加', async (module) => {
    const original = await readFile(new URL(`../../../apps/admin-console/config/_${module}.yml`, import.meta.url), 'utf8')
    const first = documentConfig(module, original)
    expect(loadConfigText(module, first)).toEqual(loadConfigText(module, original))
    expect(documentConfig(module, first)).toBe(first)
    expect(first).not.toMatch(/- # 用途：/)
  })
  it('字段文档生成保留标量、数组、正文和已有注释，且重复执行不累加', () => {
    const original = '# 业务保留的说明\nregister:\n  enabled: false\n  defaultAccountStatus: active\nloginAccess:\n  allowIps: [127.0.0.1]\nagreements:\n  userAgreementMarkdown: |\n    # 正文标题\n    用户协议正文。\n'
    const documented = documentConfig('iam', original)
    expect(loadConfigText('iam', documented)).toEqual(loadConfigText('iam', original))
    expect(documented).toContain('# 业务保留的说明')
    expect(documented).toContain('自助注册')
    expect(documentConfig('iam', documented)).toBe(documented)
  })
  it('支付宝 H5 returnUrl 经生成 YAML 和真实环境插值后由渠道 Schema 校验', () => {
    const generated = generateConfigFile('payment')
    const alipayExample = generated.match(/^# alipay:\n(?:# {3}.*\n)+/m)?.[0]
    if (!alipayExample)
      throw new Error('Missing Alipay configuration example')
    // 示例渠道默认注释关闭；用户启用后由真实参数化入口生成对应环境引用。
    const yaml = parameterizeConfig('payment', alipayExample.replace(/^# ?/gm, ''))
    expect(yaml).toContain('HAI_PAYMENT_ALIPAY_RETURNURL')
    vi.stubEnv('HAI_PAYMENT_ALIPAY_APPID', 'test-app')
    vi.stubEnv('HAI_PAYMENT_ALIPAY_SELLERID', 'test-seller')
    vi.stubEnv('HAI_PAYMENT_ALIPAY_PRIVATEKEY', 'test-private-key')
    vi.stubEnv('HAI_PAYMENT_ALIPAY_ALIPAYPUBLICKEY', 'test-public-key')
    vi.stubEnv('HAI_PAYMENT_ALIPAY_RETURNURL', 'https://shop.example/payment/return')
    const config = loadConfigText<{ alipay: unknown }>('payment', yaml)
    expect(AlipayConfigSchema.parse(config.alipay).returnUrl).toBe('https://shop.example/payment/return')
    vi.stubEnv('HAI_PAYMENT_ALIPAY_RETURNURL', 'http://shop.example/payment/return')
    expect(AlipayConfigSchema.safeParse(loadConfigText<{ alipay: unknown }>('payment', yaml).alipay).success).toBe(false)
  })
  it('服务端密钥环仅出现在实际服务端入口，不能随客户端 crypto 配置推荐', () => {
    expect(moduleEnvironmentVariables('crypto').some(variable => variable.name === 'HAI_CRYPTO_TRANSPORT_SERVERKEYRING')).toBe(false)
    expect(runtimeEnvironmentVariables('const ring = process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING')).toMatchObject([{ name: 'HAI_CRYPTO_TRANSPORT_SERVERKEYRING' }])
  })
  it('同一份数据库 YAML 仅通过环境变量即可切换三种 Provider，并拒绝非法类型/端口', () => {
    const yaml = generateConfigFile('db')
    expect(yaml).toContain('type: $' + '{HAI_DB_TYPE:sqlite}')
    expect(ReldbConfigSchema.parse(loadConfigText('db', yaml)).type).toBe('sqlite')
    for (const type of ['postgresql', 'mysql']) {
      vi.stubEnv('HAI_DB_TYPE', type)
      vi.stubEnv('HAI_DB_DATABASE', 'business')
      vi.stubEnv('HAI_DB_HOST', 'db.internal')
      vi.stubEnv('HAI_DB_PORT', type === 'mysql' ? '3306' : '5432')
      expect(ReldbConfigSchema.parse(loadConfigText('db', yaml))).toMatchObject({ type, host: 'db.internal', database: 'business' })
    }
    vi.stubEnv('HAI_DB_PORT', '70000')
    expect(ReldbConfigSchema.safeParse(loadConfigText('db', yaml)).success).toBe(false)
    vi.stubEnv('HAI_DB_TYPE', 'unsupported')
    expect(ReldbConfigSchema.safeParse(loadConfigText('db', yaml)).success).toBe(false)
  })

  it('缓存和存储的 Provider 连接字段无需改 YAML 即可由环境选择', () => {
    vi.stubEnv('HAI_CACHE_TYPE', 'redis')
    vi.stubEnv('HAI_CACHE_HOST', 'cache.internal')
    expect(CacheConfigSchema.parse(loadConfigText('cache', generateConfigFile('cache')))).toMatchObject({ type: 'redis', host: 'cache.internal' })
    vi.stubEnv('HAI_STORAGE_TYPE', 's3')
    vi.stubEnv('HAI_STORAGE_BUCKET', 'test-bucket')
    vi.stubEnv('HAI_STORAGE_ACCESSKEYID', 'test-key')
    vi.stubEnv('HAI_STORAGE_SECRETACCESSKEY', 'test-secret')
    expect(StorageConfigSchema.parse(loadConfigText('storage', generateConfigFile('storage')))).toMatchObject({ type: 's3', bucket: 'test-bucket' })
  })

  it('真实 dotenv 解析与 core 插值保留含冒号、井号以及看似布尔/数字的字符串', () => {
    const yaml = parameterizeConfig('sample', 'label: "Ops: primary #1"\ncode: "123"\ntext: "false"\nenabled: false\n')
    const environment = renderEnvironment(configEnvironmentVariables('sample', yaml))
    for (const [name, value] of Object.entries(parseEnv(environment)))
      vi.stubEnv(name, value)
    expect(loadConfigText('sample', yaml)).toEqual({ label: 'Ops: primary #1', code: '123', text: 'false', enabled: false })
  })

  it('业务正文/表结构保留原样，运行参数及数组索引生成统一变量和约束', () => {
    const yaml = parameterizeConfig('ai', 'audio:\n  models:\n    - id: asr\n      timeout: 5000\n      baseUrl: https://example.com\n')
    expect(yaml).toContain('id: asr')
    expect(yaml).toContain('$' + '{HAI_AI_AUDIO_MODELS_0_BASEURL:https://example.com}')
    expect(parameterizeConfig('audit', 'userTable: hai_iam_users\n')).toContain('userTable: hai_iam_users')
    const env = generateEnvExample(['db', 'cache'])
    expect(env).toContain('sqlite | postgresql | mysql')
    expect(env).toContain('>= 1；<= 65535')
    expect(env).toContain('HAI_CACHE_CONNECTTIMEOUT=')
  })
})
