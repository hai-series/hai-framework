import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { runACPContainerTests } from '../../.github/scripts/ci-acp-test.mjs'

describe('ci ACP 原生验收前置', () => {
  it('先成功构建三镜像，再显式启用真实 Agent 和 volume 测试', async () => {
    const calls = []
    await runACPContainerTests(async (command, args, environment) => {
      calls.push({ command, args, environment })
    }, {})
    expect(calls.map(call => [call.command, call.args[0]])).toEqual([
      ['docker', 'info'],
      ['docker', 'build'],
      ['docker', 'build'],
      ['docker', 'build'],
      ['pnpm', 'test'],
    ])
    for (const [index, name] of ['codex-acp', 'deepseek-harness', 'goose'].entries()) {
      const manifest = JSON.parse(readFileSync(new URL(`../../packages/ai/models/agents/${name}/agent.json`, import.meta.url), 'utf8'))
      expect(calls[index + 1].args).toContain(`${manifest.image}:${manifest.version}`)
      expect(calls[index + 1].args).toContain('DEBIAN_MIRROR=https://deb.debian.org/debian')
    }
    expect(calls[4].environment).toMatchObject({
      HAI_ACP_E2E_ENGINE: 'docker',
      HAI_ACP_E2E_IMAGE: calls[1].args.at(-2),
      HAI_ACP_E2E_DSH_IMAGE: calls[2].args.at(-2),
      HAI_ACP_E2E_GOOSE_IMAGE: calls[3].args.at(-2),
    })
  })

  it.each([0, 1, 2, 3])('第 %i 个前置命令失败时不运行测试或报告成功', async (failedIndex) => {
    const calls = []
    await expect(runACPContainerTests(async (command) => {
      calls.push(command)
      if (calls.length === failedIndex + 1)
        throw new Error('fixture prerequisite failed')
    }, {})).rejects.toThrow('fixture prerequisite failed')
    expect(calls).toHaveLength(failedIndex + 1)
    expect(calls).not.toContain('pnpm')
  })

  it('原生用例失败继续阻断根单元阶段', async () => {
    await expect(runACPContainerTests(async (command) => {
      if (command === 'pnpm')
        throw new Error('fixture tests failed')
    }, {})).rejects.toThrow('fixture tests failed')
  })

  it('必需 unit 阶段使用原生前置入口，Turbo 将启用配置纳入测试缓存身份', () => {
    const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
    expect(workflow.jobs.unit.with.command).toBe('node .github/scripts/ci-acp-test.mjs')
    expect(workflow.jobs.quality.needs).toContain('unit')
    const turbo = JSON.parse(readFileSync(new URL('../../turbo.json', import.meta.url), 'utf8'))
    expect(turbo.tasks.test.env).toContain('HAI_ACP_E2E_*')
  })

  const trustedEnvironment = {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    OPENROUTER_APIKEY: 'fixture-openrouter-secret',
    HAI_ACP_E2E_MODEL: 'fixture/model',
    HAI_ACP_E2E_CAPABILITIES: '{}',
  }

  it('可信 main 推送安装固定宿主版本，密钥只传给最后的定向真实测试', async () => {
    const calls = []
    await runACPContainerTests(async (command, args, environment) => {
      calls.push({ command, args, environment })
    }, {
      ...trustedEnvironment,
      HAI_ACP_E2E_OPENROUTER: '1',
      HAI_ACP_E2E_REQUIRED: '1',
      HAI_ACP_E2E_GOOSE: '1',
    })
    expect(calls.map(call => [call.command, call.args[0]])).toEqual([
      ['docker', 'info'],
      ['docker', 'build'],
      ['docker', 'build'],
      ['docker', 'build'],
      ['pnpm', 'test'],
      ['npm', 'install'],
      ['codex-acp', '--version'],
      ['codex', '--version'],
      ['dsh', '--version'],
      ['pnpm', '--filter'],
    ])
    for (const call of calls.slice(0, -1)) {
      expect(call.environment).not.toHaveProperty('OPENROUTER_APIKEY')
      expect(call.environment).not.toHaveProperty('HAI_ACP_E2E_OPENROUTER')
      expect(call.environment).not.toHaveProperty('HAI_ACP_E2E_REQUIRED')
      expect(call.environment).not.toHaveProperty('HAI_ACP_E2E_GOOSE')
    }
    const codex = JSON.parse(readFileSync(new URL('../../packages/ai/models/agents/codex-acp/agent.json', import.meta.url), 'utf8'))
    const dsh = JSON.parse(readFileSync(new URL('../../packages/ai/models/agents/deepseek-harness/agent.json', import.meta.url), 'utf8'))
    expect(calls[5].args).toEqual([
      'install',
      '--global',
      '--no-audit',
      '--no-fund',
      `${codex.package}@${codex.version}`,
      `${codex.runtime.package}@${codex.runtime.version}`,
      `${dsh.package}@${dsh.version}`,
    ])
    expect(calls.at(-1).args).toContain('tests/ai-acp-openrouter.e2e.test.ts')
    expect(calls.at(-1).args).toContain('tests/ai-acp-goose.e2e.test.ts')
    expect(calls.at(-1).environment).toMatchObject({
      ...trustedEnvironment,
      HAI_ACP_E2E_OPENROUTER: '1',
      HAI_ACP_E2E_REQUIRED: '1',
      HAI_ACP_E2E_GOOSE: '1',
      HAI_ACP_E2E_GOOSE_MODEL: trustedEnvironment.HAI_ACP_E2E_MODEL,
      HAI_ACP_E2E_GOOSE_IMAGE: calls[3].args.at(-2),
    })
  })

  it.each([
    { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/heads/main' },
    { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main' },
  ])('非可信 main 推送只运行无密钥夹具：%j', async (identity) => {
    const calls = []
    await runACPContainerTests(async (command, args, environment) => {
      calls.push({ command, args, environment })
    }, {
      ...trustedEnvironment,
      ...identity,
    })
    expect(calls).toHaveLength(5)
    expect(calls.every(call => !Object.hasOwn(call.environment, 'OPENROUTER_APIKEY'))).toBe(true)
  })

  it.each(['OPENROUTER_APIKEY', 'HAI_ACP_E2E_MODEL', 'HAI_ACP_E2E_CAPABILITIES'])('可信 main 缺少 %s 时明确失败，不能跳过真实验收', async (missing) => {
    const environment = { ...trustedEnvironment, [missing]: '' }
    await expect(runACPContainerTests(async () => {}, environment)).rejects.toThrow('Trusted main ACP acceptance requires')
  })

  it('真实定向验收失败阻断阶段，不会当作普通可选测试忽略', async () => {
    await expect(runACPContainerTests(async (_command, args) => {
      if (args.includes('tests/ai-acp-openrouter.e2e.test.ts'))
        throw new Error('fixture upstream acceptance failed')
    }, trustedEnvironment)).rejects.toThrow('fixture upstream acceptance failed')
  })

  it('linux runner 先准备沙箱并实际预检，前置没有上游密钥且临时目录被回收', async () => {
    const calls = []
    await runACPContainerTests(async (command, args, environment) => {
      calls.push({ command, args, environment })
    }, { ...trustedEnvironment, RUNNER_OS: 'Linux' })
    const setup = calls.findIndex(call => call.command === 'sudo')
    const probe = calls.findIndex(call => call.command === 'codex' && call.args.includes('sandbox'))
    expect(setup).toBeGreaterThan(0)
    expect(calls[setup].args[1]).toMatch(/ci-prepare-codex-sandbox\.sh$/)
    expect(probe).toBeGreaterThan(setup)
    expect(probe).toBeLessThan(calls.length - 1)
    expect(calls[probe].args).toContain(':workspace')
    expect(existsSync(dirname(calls[probe].environment.CODEX_HOME))).toBe(false)
    expect(calls.slice(0, -1).every(call => !Object.hasOwn(call.environment, 'OPENROUTER_APIKEY'))).toBe(true)
  })

  it.each(['setup', 'probe'])('linux 沙箱 %s 失败阻断真实请求，清理本轮临时目录', async (stage) => {
    const calls = []
    await expect(runACPContainerTests(async (command, args, environment) => {
      calls.push({ command, args, environment })
      if ((stage === 'setup' && command === 'sudo') || (stage === 'probe' && command === 'codex' && args.includes('sandbox')))
        throw new Error('sandbox prerequisite failed')
    }, { ...trustedEnvironment, RUNNER_OS: 'Linux' })).rejects.toThrow('sandbox prerequisite failed')
    expect(calls.some(call => call.args.includes('tests/ai-acp-openrouter.e2e.test.ts'))).toBe(false)
    const probe = calls.find(call => call.command === 'codex' && call.args.includes('sandbox'))
    if (probe)
      expect(existsSync(dirname(probe.environment.CODEX_HOME))).toBe(false)
  })

  it('工作流仅向可信 main 的 unit 执行步骤提供密钥，并在失败后保留截图证据', () => {
    const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
    const stage = parse(readFileSync(new URL('../../.github/workflows/ci-stage.yml', import.meta.url), 'utf8'))
    const secret = workflow.jobs.unit.secrets.OPENROUTER_APIKEY
    expect(secret).toContain('github.event_name == \'push\'')
    expect(secret).toContain('github.ref == \'refs/heads/main\'')
    expect(workflow.jobs.unit.with.browser).toBe(true)
    expect(workflow.jobs.unit.with.openrouter_model).toBe('qwen/qwen3.7-flash')
    expect(JSON.parse(workflow.jobs.unit.with.openrouter_capabilities)).toMatchObject({
      contextWindow: 1000000,
      maxOutputTokens: 65536,
      reasoning: {
        supported: true,
        efforts: ['low', 'medium', 'high'],
      },
    })
    expect(stage.on.workflow_call.secrets.OPENROUTER_APIKEY.required).toBe(false)
    expect(stage.jobs.check.env).not.toHaveProperty('OPENROUTER_APIKEY')
    const steps = stage.jobs.check.steps
    const execution = steps.findIndex(step => step.name === 'Execute verification')
    expect(steps[execution].env.OPENROUTER_APIKEY).toBe('$' + '{{ secrets.OPENROUTER_APIKEY }}')
    expect(JSON.stringify(steps.slice(0, execution))).not.toContain('secrets.OPENROUTER_APIKEY')
    const render = steps.find(step => step.name === 'Render ACP acceptance evidence')
    const artifact = steps.find(step => step.name === 'Upload ACP acceptance evidence')
    expect(render.if).toContain('always()')
    expect(render.run).toBe('node scripts/render-acp-evidence.mjs --require-records')
    expect(artifact.if).toContain('always()')
    expect(artifact.with.path).toBe('packages/ai/test-results/acp-openrouter')
  })
})
