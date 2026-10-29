/** 验证实际策略判定与启动文件快照；性能数据由独立基准记录，单元测试不使用易抖动的耗时阈值。 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AccessConditionSchema, core, RequestAccessConfigSchema, RequestAccessPolicySchema } from '../src/index.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

it('关闭策略直接允许，路径只在策略启用后校验', () => {
  expect(core.access.createRequestCheck(false)('/bad%2fpath', 'GET').allowed).toBe(true)
  expect(core.access.createRequestCheck({})('/bad%2fpath', 'GET')).toEqual({ allowed: false, reason: 'path' })
})

it('按完整路径段匹配，方法过滤且多条规则和全局条件取交集', () => {
  const check = core.access.createRequestCheck({
    global: { denyIps: ['192.0.2.7'] },
    rules: [
      { id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24', '2001:db8::/32'] },
      { id: 'write', paths: ['/api/v1/external/sync'], methods: ['POST'], denyIps: ['192.0.2.8'] },
    ],
  })
  expect(check('/api/v1/external/sync', 'POST', '192.0.2.10').allowed).toBe(true)
  expect(check('/api/v1/external', 'GET', '::ffff:192.0.2.10').allowed).toBe(true)
  expect(check('/api/v1/external/sync/', 'POST', '2001:db8::1').allowed).toBe(true)
  expect(check('/api/v1/external/sync', 'POST', '192.0.2.8')).toMatchObject({ allowed: false, reason: 'address', ruleId: 'write' })
  expect(check('/api/v1/external/sync', 'GET', '192.0.2.8').allowed).toBe(true)
  expect(check('/api/v1/external-other', 'GET', '198.51.100.10').allowed).toBe(true)
  expect(check('/api/v1/external', 'GET')).toMatchObject({ allowed: false, reason: 'address', ruleId: undefined })
  expect(check('/api/v1/other', 'GET', '192.0.2.7')).toMatchObject({ allowed: false, reason: 'address' })
  expect(check('/API/v1/external', 'GET', '198.51.100.10').allowed).toBe(true)
})

it('不能使用编码、双重编码、重复分隔符或点段绕过规则', () => {
  const check = core.access.createRequestCheck({ rules: [{ id: 'api', paths: ['/api/v1/**'], allowIps: ['192.0.2.10'] }] })
  expect(check('/%61pi/v1/sync', 'GET', '198.51.100.10')).toMatchObject({ allowed: false, ruleId: 'api' })
  for (const pathname of ['/api%2fv1/sync', '/api%252fv1/sync', '/api//v1/sync', '/api/../v1/sync', '/api\\v1', '/api/%ZZ', '/api/%00'])
    expect(check(pathname, 'GET', '192.0.2.10')).toMatchObject({ allowed: false, reason: 'path' })
})

it('使用 UTC 与本地时区，跨午夜、含起不含止在分钟边界准确生效', () => {
  vi.useFakeTimers()
  const check = core.access.createRequestCheck({ rules: [{ id: 'night', paths: ['/**'], timezone: 'Asia/Shanghai', windows: [{ days: [1], start: '22:00', end: '02:00' }] }] })
  for (const [time, expected] of [
    ['2026-10-26T13:59:59.999Z', false],
    ['2026-10-26T14:00:00.000Z', true],
    ['2026-10-26T17:59:59.999Z', true],
    ['2026-10-26T18:00:00.000Z', false],
    ['2026-10-27T14:00:00.000Z', false],
  ] as const) {
    vi.setSystemTime(new Date(time))
    expect(check('/api', 'POST').allowed, time).toBe(expected)
  }
  const login = core.access.createConditionCheck(AccessConditionSchema.parse({ timezone: 'UTC', windows: [{ days: [1], start: '14:00', end: '18:00' }] }))
  vi.setSystemTime(new Date('2026-10-26T14:00:00Z'))
  expect(login().allowed).toBe(true)
  vi.setSystemTime(new Date('2026-10-26T18:00:00Z'))
  expect(login()).toMatchObject({ allowed: false, reason: 'time' })
})

it('规则文件只在启动读取，拒绝未知字段、别名、重复键和过大文件且不暴露正文', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hai-policy-'))
  const file = path.join(directory, 'policy.yaml')
  try {
    await writeFile(file, 'rules:\n  - id: external\n    paths: [/api/v1/**]\n    allowIps: [192.0.2.10]\n')
    const check = core.access.createRequestCheck({ file })
    expect(check('/api/v1/sync', 'GET', '192.0.2.11').allowed).toBe(false)
    await writeFile(file, 'rules: []\n')
    expect(check('/api/v1/sync', 'GET', '192.0.2.11').allowed).toBe(false)
    expect(core.access.createRequestCheck({ file })('/api/v1/sync', 'GET', '192.0.2.11').allowed).toBe(true)
    for (const text of ['global: &secret {allowIps: [192.0.2.10]}\nrules: [*secret]', 'rules: []\nrules: []', 'privateKey: PRIVATE_SENTINEL']) {
      await writeFile(file, text)
      expect(() => core.access.loadPolicy({ file })).toThrow(/Request access policy/)
      try {
        core.access.loadPolicy({ file })
      }
      catch (error) {
        expect(String(error)).not.toContain('PRIVATE_SENTINEL')
      }
    }
    await writeFile(file, ' '.repeat(1024 * 1024 + 1))
    expect(() => core.access.loadPolicy({ file })).toThrow(/1 MiB/)
    expect(() => core.access.loadPolicy({ file: 'absent.yaml' }, directory)).toThrow(/could not be read/)
    expect(RequestAccessConfigSchema.safeParse({ file, rules: [] }).success).toBe(false)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('启动拒绝重复编号、正则路径、无效 IP/时区和相同起止时间', () => {
  const rule = { id: 'one', paths: ['/api/**'] }
  for (const config of [
    { rules: [rule, rule] },
    { rules: [{ ...rule, paths: ['/api/*/sync'] }] },
    { global: { allowIps: ['192.0.2.0/99'] } },
    { global: { timezone: 'invalid' } },
    { global: { windows: [{ days: [1], start: '09:00', end: '09:00' }] } },
  ]) expect(RequestAccessPolicySchema.safeParse(config).success).toBe(false)
})

it('千条规则精确和前缀索引保持选择性，GET 不自动包含 HEAD', () => {
  const rules = Array.from({ length: 1000 }, (_, index) => ({ id: `route-${index}`, paths: [`/api/v1/item-${index}/**`], methods: ['POST' as const], allowIps: ['192.0.2.10'] }))
  const check = core.access.createRequestCheck({ rules })
  expect(check('/api/v1/item-999/publish', 'POST', '192.0.2.11')).toMatchObject({ allowed: false, ruleId: 'route-999' })
  expect(check('/api/v1/item-999/publish', 'HEAD', '192.0.2.11').allowed).toBe(true)
  expect(check('/api/v1/item-9990/publish', 'POST', '192.0.2.11').allowed).toBe(true)
})

it('加密模式按完整路径和方法选择，不改变 IP 条件或未配置路径的宿主默认值', () => {
  const check = core.access.createRequestCheck({ rules: [
    { id: 'partner-post', paths: ['/api/v1/partner/**'], methods: ['POST'], encryption: 'disabled', allowIps: ['192.0.2.10'] },
    { id: 'partner-get', paths: ['/api/v1/partner/**'], methods: ['GET'], encryption: 'required' },
    { id: 'exact', paths: ['/health'], encryption: 'required' },
  ] })
  expect(check.requiresEncryption).toBe(true)
  expect(check.encryption('/api/v1/partner/sync', 'POST')).toBe('disabled')
  expect(check.encryption('/api/v1/partner/', 'GET')).toBe('required')
  expect(check.encryption('/%61pi/v1/partner', 'POST')).toBe('disabled')
  expect(check.encryption('/api/v1/partner-other', 'POST')).toBeUndefined()
  expect(check.encryption('/api/v1/partner', 'HEAD')).toBeUndefined()
  expect(check.encryption('/health/deep', 'GET')).toBeUndefined()
  expect(check.encryption('/health/', 'GET')).toBe('required')
  expect(check.encryption('/health', 'PROPFIND')).toBe('required')
  expect(check.encryption('/api%2fv1/partner', 'POST')).toBeUndefined()
  expect(check('/api/v1/partner/sync', 'POST', '198.51.100.10')).toMatchObject({ allowed: false, reason: 'address' })
  expect(core.access.createRequestCheck(false).requiresEncryption).toBe(false)
  expect(core.access.createRequestCheck(false).encryption('/health', 'GET')).toBeUndefined()
  expect(RequestAccessPolicySchema.safeParse({ rules: [{ id: 'invalid', paths: ['/api'], encryption: true }] }).success).toBe(false)
})

it('重叠路径和方法的加密冲突在启动时拒绝，与声明顺序无关；同模式和分离方法可组合', () => {
  for (const paths of [
    ['/api/**', '/api/partner'],
    ['/api/**', '/api/partner/**'],
    ['/api/partner', '/api/partner/'],
    ['/**', '/api/partner/**'],
  ]) {
    const rules = paths.map((path, index) => ({ id: `rule-${index}`, paths: [path!], encryption: index ? 'disabled' as const : 'required' as const }))
    expect(() => core.access.createRequestCheck({ rules })).toThrow(/encryption conflicts/)
    expect(() => core.access.createRequestCheck({ rules: rules.toReversed() })).toThrow(/encryption conflicts/)
  }
  const check = core.access.createRequestCheck({ rules: [
    { id: 'same-parent', paths: ['/api/**'], methods: ['POST'], encryption: 'disabled' },
    { id: 'same-child', paths: ['/api/partner'], methods: ['POST'], encryption: 'disabled' },
    { id: 'different-method', paths: ['/api/partner'], methods: ['GET'], encryption: 'required' },
    { id: 'sibling', paths: ['/apix/**'], encryption: 'required' },
  ] })
  expect(check.encryption('/api/partner', 'POST')).toBe('disabled')
  expect(check.encryption('/api/partner', 'GET')).toBe('required')
})

it('直连不信任伪造头；可信代理链从右侧解析，过长或无效链不降级为可信 IP', () => {
  const resolve = core.access.createClientIpResolver(['192.0.2.10', '192.0.2.20'])
  const forwarded = new Request('https://example.test', { headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.10, 192.0.2.20' } })
  expect(resolve(forwarded, '192.0.2.10')).toBe('198.51.100.10')
  expect(resolve(forwarded, '198.51.100.10')).toBe('198.51.100.10')
  expect(resolve(new Request('https://example.test', { headers: { 'x-forwarded-for': 'invalid' } }), '192.0.2.10')).toBeUndefined()
  expect(resolve(new Request('https://example.test', { headers: { 'x-forwarded-for': Array.from({ length: 33 }).fill('192.0.2.20').join(',') } }), '192.0.2.10')).toBeUndefined()
  expect(resolve(forwarded)).toBeUndefined()
})

it('auto 只在受管私有代理部署中采用容器网段，显式空数组仍禁用转发头', () => {
  const request = new Request('https://example.test', { headers: { 'x-forwarded-for': '198.51.100.10' } })
  vi.stubEnv('HAI_DEPLOY_PRIVATE_PROXY', '')
  expect(core.access.createClientIpResolver('auto')(request, '192.0.2.10')).toBe('192.0.2.10')
  const local = Object.values(networkInterfaces()).flat().find(value => value && !value.internal && value.cidr && !value.cidr.includes('%'))
  expect(local).toBeDefined()
  vi.stubEnv('HAI_DEPLOY_PRIVATE_PROXY', '1')
  expect(core.access.createClientIpResolver('auto')(request, local!.address)).toBe('198.51.100.10')
  expect(core.access.createClientIpResolver([])(request, local!.address)).toBe(local!.address)
})
