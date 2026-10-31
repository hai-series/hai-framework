/* eslint-disable no-template-curly-in-string -- 验证秘密与环境 JSON 的插值标记保持字面量。 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv as nativeParseEnv } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { core } from '../src/index.js'

const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  core.config.clear()
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

it('通用配置按父 JSON、子对象和细项覆盖，新增可选字段不依赖模块名称', () => {
  const schema = z.object({ enabled: z.boolean(), connection: z.object({ host: z.string(), port: z.number(), publicEndpoint: z.string().optional(), password: z.string() }) })
  const result = core.config.resolve({ name: 'example', value: {}, schema, environment: {
    HAI_EXAMPLE: '{"enabled":true,"connection":{"host":"original","port":123,"password":"${KEEP_LITERAL}"}}',
    HAI_EXAMPLE_CONNECTION_PORT: '456',
    HAI_EXAMPLE_CONNECTION_PUBLICENDPOINT: 'https://example.test:8443/files',
    HAI_EXAMPLE_CONNECTION_PASSWORD: '00123',
  } })
  expect(result).toMatchObject({ success: true, data: { enabled: true, connection: { host: 'original', port: 456, publicEndpoint: 'https://example.test:8443/files', password: '00123' } } })
  const literal = core.config.resolve({ name: 'example', value: {}, schema, environment: { HAI_EXAMPLE: '{"enabled":true,"connection":{"host":"original","port":123,"password":"${KEEP_LITERAL}"}}' } })
  expect(literal).toMatchObject({ success: true, data: { connection: { password: '${KEEP_LITERAL}' } } })
})

it('父 JSON 中没有的可选对象按 Schema 补路径，显式空串、false 和 0 保持类型', () => {
  const schema = z.object({ options: z.object({ publicEndpoint: z.string(), enabled: z.boolean(), retries: z.number(), token: z.string() }).optional() })
  const result = core.config.resolve({ name: 'example', value: {}, schema, environment: { HAI_EXAMPLE_OPTIONS_PUBLICENDPOINT: 'https://example.test', HAI_EXAMPLE_OPTIONS_ENABLED: 'false', HAI_EXAMPLE_OPTIONS_RETRIES: '0', HAI_EXAMPLE_OPTIONS_TOKEN: '' } })
  expect(result).toMatchObject({ success: true, data: { options: { publicEndpoint: 'https://example.test', enabled: false, retries: 0, token: '' } } })
})

it('数组 JSON 可以被索引细化，越界不追加也不生成空洞', () => {
  const schema = z.object({ providers: z.array(z.object({ name: z.string(), port: z.number(), password: z.string().optional() })) })
  const environment = { HAI_EXAMPLE_PROVIDERS: '[{"name":"mail","port":465},{"name":"other","port":123}]', HAI_EXAMPLE_PROVIDERS_0_PORT: '587', HAI_EXAMPLE_PROVIDERS_0_PASSWORD: '${LITERAL_SECRET}' }
  expect(core.config.resolve({ name: 'example', value: {}, schema, environment })).toMatchObject({ success: true, data: { providers: [{ name: 'mail', port: 587, password: '${LITERAL_SECRET}' }, { name: 'other', port: 123 }] } })
  const invalid = core.config.resolve({ name: 'example', value: {}, schema, environment: { ...environment, HAI_EXAMPLE_PROVIDERS_2_NAME: 'private-invalid-value' } })
  expect(invalid.success).toBe(false)
  expect(JSON.stringify(invalid)).not.toContain('private-invalid-value')
})

it('未知细项不会创建一个空的可选节点', () => {
  const schema = z.object({ connection: z.object({ host: z.string() }).optional() })
  expect(core.config.resolve({ name: 'example', value: {}, schema, environment: { HAI_EXAMPLE_CONNECTION_UNKNOWN: 'ignored' } })).toMatchObject({ success: true, data: {} })
})

it('细化判别字段先选择新分支，再读取新分支的可选字段', () => {
  const schema = z.object({ provider: z.discriminatedUnion('type', [z.object({ type: z.literal('remote'), token: z.string() }), z.object({ type: z.literal('ssh'), ssh: z.object({ host: z.string(), port: z.number().optional() }) })]) })
  expect(core.config.resolve({ name: 'example', value: { provider: { type: 'remote', token: 'old' } }, schema, environment: { HAI_EXAMPLE_PROVIDER: '{}', HAI_EXAMPLE_PROVIDER_TYPE: 'ssh', HAI_EXAMPLE_PROVIDER_SSH_HOST: 'server.test', HAI_EXAMPLE_PROVIDER_SSH_PORT: '2202' } })).toMatchObject({ success: true, data: { provider: { type: 'ssh', ssh: { host: 'server.test', port: 2202 } } } })
})

it('不提供 Schema 时，空对象替换仍能按原声明定位细项，但不恢复原值', () => {
  expect(core.config.resolve({ name: 'example', value: { connection: { host: 'old.test', port: 123 }, enabled: true }, environment: { HAI_EXAMPLE: '{}', HAI_EXAMPLE_CONNECTION_HOST: 'new.test' } })).toEqual({ success: true, data: { connection: { host: 'new.test' } } })
})

it('缺少列表或默认空列表的索引覆盖失败，已有默认列表允许覆盖且忽略未设置变量', () => {
  for (const providers of [z.array(z.object({ name: z.string() })).optional(), z.array(z.object({ name: z.string() })).default([])]) {
    expect(core.config.resolve({ name: 'example', value: {}, schema: z.object({ providers }), environment: { HAI_EXAMPLE_PROVIDERS_0_NAME: 'private-invalid' } }).success).toBe(false)
  }
  expect(core.config.resolve({ name: 'example', value: {}, schema: z.object({ providers: z.array(z.object({ name: z.string() })).default([{ name: 'default' }]) }), environment: { HAI_EXAMPLE_PROVIDERS_0_NAME: 'override', HAI_EXAMPLE_PROVIDERS_1_NAME: undefined } })).toMatchObject({ success: true, data: { providers: [{ name: 'override' }] } })
})

it('同源更细字段可以替换粗粒度 false 节点，高来源 false 先清理低来源细项', () => {
  const schema = z.object({ access: z.union([z.literal(false), z.object({ file: z.string() })]) })
  const environment = { HAI_EXAMPLE_ACCESS: 'false', HAI_EXAMPLE_ACCESS_FILE: '/config/access.yml' }
  expect(core.config.resolve({ name: 'example', value: {}, schema, environment })).toMatchObject({ success: true, data: { access: { file: '/config/access.yml' } } })
  expect(core.config.resolve({ name: 'example', value: {}, schema, environment: core.config.mergeEnv([environment, { HAI_EXAMPLE_ACCESS: 'false' }]) })).toMatchObject({ success: true, data: { access: false } })
})

it('来源优先于细化程度，同来源按父到子处理且不依赖输入顺序', () => {
  const merged = core.config.mergeEnv([
    { HAI_EXAMPLE_LOGGING_LEVEL: 'debug', HAI_EXAMPLE_NAME: 'low' },
    { HAI_EXAMPLE_LOGGING_LEVEL: 'error', HAI_EXAMPLE_LOGGING: '{"level":"warn","format":"json"}' },
  ])
  expect(merged).toEqual({ HAI_EXAMPLE_NAME: 'low', HAI_EXAMPLE_LOGGING: '{"level":"warn","format":"json"}', HAI_EXAMPLE_LOGGING_LEVEL: 'error' })
  expect(core.config.mergeEnv([merged, { HAI_EXAMPLE: '{"name":"replacement"}' }])).toEqual({ HAI_EXAMPLE: '{"name":"replacement"}' })
})

it('生成默认展开对象、保留数组 JSON 和不能无损映射的动态字典', () => {
  const schema = z.object({ connection: z.object({ publicEndpoint: z.string(), enabled: z.boolean() }), labels: z.record(z.string(), z.string()), items: z.array(z.object({ name: z.string() })) })
  const values = core.config.toEnv({ prefix: 'HAI_EXAMPLE', schema, value: { connection: { publicEndpoint: 'https://example.test', enabled: false }, labels: { 'X-Exact-Case': 'value' }, items: [{ name: 'first' }] } })
  expect(values).toEqual({ HAI_EXAMPLE_CONNECTION_PUBLICENDPOINT: 'https://example.test', HAI_EXAMPLE_CONNECTION_ENABLED: 'false', HAI_EXAMPLE_LABELS: '{"X-Exact-Case":"value"}', HAI_EXAMPLE_ITEMS: '[{"name":"first"}]' })
  expect(core.config.resolve({ name: 'example', value: {}, schema, environment: values })).toMatchObject({ success: true, data: { connection: { publicEndpoint: 'https://example.test', enabled: false }, labels: { 'X-Exact-Case': 'value' }, items: [{ name: 'first' }] } })
})

it('dotenv 序列化无损保留混合引号、多行、反斜线和 Unicode，JSON 排在细项前', () => {
  const values = { HAI_EXAMPLE_FIELD: 'both \'single\' and "double" with `\nline\\path $value 中文', HAI_EXAMPLE: '{"field":"base"}', WINDOWS_VALUE: 'C:\\temp\\O\'Brien\\new' }
  const serialized = core.config.stringifyEnv(values)
  expect(serialized.indexOf('HAI_EXAMPLE=')).toBeLessThan(serialized.indexOf('HAI_EXAMPLE_FIELD='))
  expect(core.config.parseEnv(serialized)).toEqual(values)
  expect(() => core.config.parseEnv('HAI_EXAMPLE=first\nHAI_EXAMPLE=second\n')).toThrow()
  const manual = 'PATH="C:\\temp\\new\\key"\n'
  expect(core.config.parseEnv(manual)).toEqual(nativeParseEnv(manual))
})

it('所有 dotenv 层使用统一来源优先级，高来源父对象不遗留低来源细项', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-env-layers-'))
  directories.push(directory)
  writeFileSync(join(directory, '.env'), 'HAI_EXAMPLE_LOGGING_LEVEL=debug\n')
  writeFileSync(join(directory, '.env.test'), 'HAI_EXAMPLE_NAME=test\n')
  writeFileSync(join(directory, '.env.local'), 'HAI_EXAMPLE_NAME=private\n')
  writeFileSync(join(directory, '.env.test.local'), 'HAI_EXAMPLE_LOGGING=\'{"level":"warn"}\'\n')
  expect(core.config.loadEnvFiles({ mode: 'test', envDir: directory })).toMatchObject({ success: true, data: { HAI_EXAMPLE_NAME: 'private', HAI_EXAMPLE_LOGGING: '{"level":"warn"}' } })
  const loaded = core.config.loadEnvFiles({ mode: 'test', envDir: directory })
  expect(loaded.success && loaded.data.HAI_EXAMPLE_LOGGING_LEVEL).toBeUndefined()
})

it('宿主提供 Schema 后，Core 扫描的配置也能读取 YAML 未填写的字段', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-env-schema-'))
  directories.push(directory)
  writeFileSync(join(directory, '_example.yml'), 'enabled: true\n')
  vi.stubEnv('HAI_EXAMPLE_PUBLICENDPOINT', 'https://example.test:8443/files')
  core.init({ configDir: directory, configSchemas: { example: z.object({ enabled: z.boolean(), publicEndpoint: z.string().optional() }) } })
  expect(core.config.get('example')).toMatchObject({ enabled: true, publicEndpoint: 'https://example.test:8443/files' })
})

it('扫描只使用 Schema 的结构信息，完整业务校验仍由模块启动或显式 validate 执行', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-env-validation-'))
  directories.push(directory)
  writeFileSync(join(directory, '_example.yml'), 'name: ""\n')
  const schema = z.object({ name: z.string().min(1) })
  core.init({ configDir: directory, configSchemas: { example: schema } })
  expect(core.config.get('example')).toEqual({ name: '' })
  expect(core.config.validate('example', schema).success).toBe(false)
})
