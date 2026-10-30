import { readFileSync } from 'node:fs'
import { IamConfigSchema } from '@h-ai/iam'
import { ReachConfigSchema } from '@h-ai/reach'
import { afterEach, expect, it, vi } from 'vitest'
import { configEnvironmentVariables, documentConfig, parameterizeConfig } from '../src/commands/cli-config-environment.js'
import { generateConfigFile, generateEnvExample } from '../src/commands/cli-config-templates.js'
import { loadConfigText } from './helpers/config.js'

afterEach(() => vi.unstubAllEnvs())

it('启用项的默认值优先于注释中的替代方案，注释先出现也不会覆盖', () => {
  const yaml = `# type: \${HAI_VECDB_TYPE:chroma}\ntype: \${HAI_VECDB_TYPE:lancedb}\n# type: \${HAI_VECDB_TYPE:qdrant}\n`
  expect(configEnvironmentVariables('vecdb', yaml)).toMatchObject([{ name: 'HAI_VECDB_TYPE', value: 'lancedb', optional: false }])
  const environment = generateEnvExample(['deploy', 'reach', 'vecdb'])
  expect(environment).toContain('HAI_DEPLOY_PROVIDER_TYPE=\'docker-ssh\'')
  expect(environment).toContain('HAI_REACH_PROVIDERS_0_TYPE=\'console\'')
  expect(environment).toContain('HAI_VECDB_TYPE=\'lancedb\'')
})

it('第二个模型沿用 Schema 的说明和约束，仍显示实际字段索引', () => {
  const variables = configEnvironmentVariables('ai', `# apiKey: \${HAI_AI_LLM_MODELS_1_APIKEY:}\n`)
  expect(variables[0]).toMatchObject({ path: 'ai.llm.models.1.apiKey', optional: true })
  expect(variables[0].description).toBeTruthy()
  expect(variables[0].constraint).toBeTruthy()
})

it.each(['core', 'serv', 'kit', 'db', 'cache', 'storage', 'iam', 'ai', 'vecdb', 'reach', 'audit', 'scheduler', 'payment', 'feedback'])('%s 配置重复生成时不累加注释或改变环境默认值', (module) => {
  const yaml = generateConfigFile(module)
  expect(documentConfig(module, yaml)).toBe(yaml)
  expect(parameterizeConfig(module, yaml)).toBe(yaml)
  expect(yaml).not.toMatch(/^\s*#\s*#/m)
})

it.each([
  ['ai', ['HAI_AI_LLM_PROTOCOL', 'HAI_AI_LLM_MODELS_0_PROTOCOL', 'HAI_AI_KNOWLEDGE_COLLECTION', 'HAI_AI_AUDIO_MODELS_0_BASEURL']],
  ['iam', ['HAI_IAM_LDAP_URL', 'HAI_IAM_LDAP_SEARCHBASE', 'terminalLimits', 'windows']],
  ['serv', ['HAI_SERV_HTTP_DOCS', 'HAI_SERV_HTTP_ACCESS_GLOBAL_TIMEZONE', 'HAI_SERV_TRANSPORT_ROUTEPLAINTEXTBYTES']],
])('%s 的实际配置与可选块都有明确环境入口', (module, variables) => {
  const content = generateConfigFile(module)
  for (const variable of variables) expect(content).toContain(variable)
})

it('配置注释不使用重复 #，公开端点允许代理目录', () => {
  for (const module of ['ai', 'vecdb']) expect(generateConfigFile(module)).not.toMatch(/^\s*#\s*#/m)
  const storage = generateConfigFile('storage', { storage: { type: 's3' } })
  expect(storage).not.toContain('不含桶名或网站目录')
  expect(storage).toContain('代理目录')
})

it('env 示例保留细项和必要开关，不重复列出父 JSON 对象', () => {
  const content = generateEnvExample(['ai', 'iam', 'deploy'])
  expect(content).not.toMatch(/^#?\s*HAI_AI=/m)
  expect(content).not.toMatch(/^#?\s*HAI_AI_LLM=/m)
  expect(content).not.toMatch(/^#?\s*HAI_AI_LLM_MODELS_0=/m)
  expect(content).toContain('HAI_AI_LLM_MODELS_0_PROTOCOL=')
})

it('启用 LDAP 可选块后，公开 Core 加载入口实际消费环境地址和 DN', () => {
  const generated = generateConfigFile('iam')
  const block = generated.slice(generated.indexOf('# ldap:'), generated.indexOf('# API Key 登录'))
  const yaml = block.replace(/^(\s*)# (?=\s*(?:[A-Z][\w-]*:|-\s))/gim, '$1')
  vi.stubEnv('HAI_IAM_LDAP_URL', 'ldaps://directory.test:636')
  vi.stubEnv('HAI_IAM_LDAP_BINDDN', 'cn=app,dc=test')
  vi.stubEnv('HAI_IAM_LDAP_BINDPASSWORD', 'fixture-only')
  vi.stubEnv('HAI_IAM_LDAP_SEARCHBASE', 'ou=people,dc=test')
  const config = IamConfigSchema.parse(loadConfigText('iam', yaml))
  expect(config.ldap).toMatchObject({ url: 'ldaps://directory.test:636', bindDn: 'cn=app,dc=test', searchBase: 'ou=people,dc=test' })
})

it.each(['common', 'fullstack'])('%s Reach 示例中的实际数组索引与环境入口一致', (template) => {
  const source = template === 'common' ? generateConfigFile('reach') : documentConfig('reach', parameterizeConfig('reach', readFileSync(new URL('../templates/apps/fullstack/packages/{{projectName}}-serv/config/_reach.yml.hbs', import.meta.url), 'utf8')))
  const block = source.slice(source.indexOf('# providers:'), source.indexOf('\ntemplates:'))
  const yaml = block.replace(/^(\s*)# (?=\s*(?:[A-Z][\w-]*:|-\s))/gim, '$1')
  vi.stubEnv('HAI_REACH_PROVIDERS_0_HOST', 'smtp.test')
  vi.stubEnv('HAI_REACH_PROVIDERS_1_ACCESSKEYID', 'fixture-sms-key')
  vi.stubEnv('HAI_REACH_PROVIDERS_1_ACCESSKEYSECRET', 'fixture-sms-secret')
  vi.stubEnv('HAI_REACH_PROVIDERS_1_SIGNNAME', 'Fixture')
  vi.stubEnv('HAI_REACH_PROVIDERS_2_URL', 'https://notify.test/send')
  vi.stubEnv('HAI_REACH_PROVIDERS_2_HEADERS_AUTHORIZATION', 'Bearer fixture-token')
  const config = ReachConfigSchema.parse(loadConfigText('reach', yaml))
  expect(config.providers).toHaveLength(3)
  expect(config.providers[0]).toMatchObject({ type: 'smtp', host: 'smtp.test' })
  expect(config.providers[1]).toMatchObject({ type: 'aliyun-sms', accessKeyId: 'fixture-sms-key', signName: 'Fixture' })
  expect(config.providers[2]).toMatchObject({ type: 'api', url: 'https://notify.test/send' })
})
