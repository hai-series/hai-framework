import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

/** 执行实际生成的配置与凭据声明，不启动服务，不读取宿主的真实密码。 */
function evaluate(source: string, environment: Record<string, string>): Record<string, unknown> {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports: Record<string, unknown> = {}
  runInNewContext(compiled, {
    exports,
    URL,
    require: (name: string) => {
      if (name === 'node:process')
        return { __esModule: true, default: { env: environment } }
      if (name === '@playwright/test')
        return { defineConfig: (configuration: unknown) => configuration }
      return { createE2eServerEnv: (configuration: unknown) => configuration, createE2eNotificationEnv: () => ({}), createE2eTransportRing: () => 'fixture-ring' }
    },
  })
  return exports
}

it.each([true, false])('fullstack真实模板反馈=%s的职责密码覆盖、托管回退与所有登录位置一致', async (feedback) => {
  const directory = await mkdtemp(path.join(process.cwd(), '.tmp-template-credentials-'))
  if (path.dirname(directory) !== process.cwd() || !path.basename(directory).startsWith('.tmp-template-credentials-'))
    throw new Error('Unexpected template credentials cleanup path')
  try {
    await generateFromTemplates(directory, buildTemplateContext({ name: 'credential-fixture', appType: 'fullstack', frontends: ['web'], features: feedback ? ['feedback'] : [], packageManager: 'pnpm' }))
    const configuration = await readFile(path.join(directory, 'playwright.config.ts'), 'utf8')
    const spec = await readFile(path.join(directory, 'e2e/fullstack.spec.ts'), 'utf8')
    const session = await readFile(path.join(directory, 'e2e/session-close.spec.ts'), 'utf8')
    const environments: Record<string, string>[] = [{}, { E2E_AUDIT_ADMIN_PASSWORD: 'fixture-audit-override', E2E_CONFIG_ADMIN_PASSWORD: 'fixture-config-override', E2E_BUSINESS_OPERATOR_PASSWORD: 'fixture-operator-override' }]
    for (const environment of environments) {
      const config = evaluate(configuration, environment).default as { webServer: Array<{ env: Record<string, string> }> }
      const prefix = spec.slice(0, spec.indexOf('// 测试专用'))
      const captured = evaluate(`${prefix}\nexport const captured = { auditAdminPassword, configAdminPassword${feedback ? ', businessOperatorPassword' : ''} }`, environment).captured
      expect(captured).toEqual({
        auditAdminPassword: config.webServer[0].env.HAI_AUDIT_ADMIN_PASSWORD,
        configAdminPassword: config.webServer[0].env.HAI_CONFIG_ADMIN_PASSWORD,
        ...(feedback ? { businessOperatorPassword: config.webServer[0].env.HAI_BUSINESS_OPERATOR_PASSWORD } : {}),
      })
      expect(config.webServer[0].env).toMatchObject({
        HAI_AUDIT_ADMIN_PASSWORD: environment.E2E_AUDIT_ADMIN_PASSWORD || 'Scaffold-test-Audit123!',
        HAI_CONFIG_ADMIN_PASSWORD: environment.E2E_CONFIG_ADMIN_PASSWORD || 'Scaffold-test-Config123!',
        HAI_BUSINESS_OPERATOR_PASSWORD: environment.E2E_BUSINESS_OPERATOR_PASSWORD || 'Scaffold-test-Operator123!',
      })
      const sessionPrefix = session.slice(0, session.indexOf('async function dismissToasts'))
      expect(evaluate(`${sessionPrefix}\nexport const captured = configAdminPassword`, environment).captured).toBe(config.webServer[0].env.HAI_CONFIG_ADMIN_PASSWORD)
    }
    // 登录与再次验证的每个消费位置均使用同一声明，不能仅改服务配置而仍硬编码调用方。
    for (const match of spec.matchAll(/login\(page, 'audit_admin', ([^)]+)\)/g))
      expect(match[1]).toBe('auditAdminPassword')
    expect(spec).toContain('locator(\'input\').fill(auditAdminPassword)')
    expect(spec).toContain('login(page, \'config_admin\', configAdminPassword)')
    expect(session).toContain('login(page, \'config_admin\', configAdminPassword)')
    expect(spec.includes('const businessOperatorPassword')).toBe(feedback)
    if (feedback)
      expect(spec).toContain('login(page, \'business_operator\', businessOperatorPassword)')
  }
  finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}, 30_000)
