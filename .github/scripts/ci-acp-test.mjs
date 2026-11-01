/** CI 在单元阶段准备原生智能体镜像，确保容器与真实 Agent 测试不会因缺少环境配置而跳过。 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 直接执行固定的 CI 工具；失败立即阻止后续测试，不使用 shell 或输出环境变量。 */
async function execute(command, args, environment = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, stdio: 'inherit', shell: false, windowsHide: true })
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`ACP CI command failed: ${command}; exit ${code}`)))
  })
}

/**
 * 构建真实程序的基础镜像并执行夹具门禁，可信 main 推送继续执行真实 OpenRouter 验收。
 * @param run - 内部命令执行器；测试通过注入记录执行和失败边界。
 * @param environment - 工作流执行环境；只有可信 main 推送才向定向真实测试传递密钥。
 * @returns 全部前置与测试完成后的 Promise；任一命令失败则拒绝。
 * @example
 * ```js
 * await runACPContainerTests()
 * ```
 */
export async function runACPContainerTests(run = execute, environment = process.env) {
  const { OPENROUTER_APIKEY: apiKey, ...fixtureEnvironment } = environment
  // 普通根测试不接收真实上游凭据或启用开关，防止重复运行付费测试。
  delete fixtureEnvironment.HAI_ACP_E2E_OPENROUTER
  delete fixtureEnvironment.HAI_ACP_E2E_REQUIRED
  delete fixtureEnvironment.HAI_ACP_E2E_GOOSE
  await run('docker', ['info'], fixtureEnvironment)
  if (fixtureEnvironment.RUNNER_OS === 'Linux' && environment.GITHUB_EVENT_NAME === 'push' && environment.GITHUB_REF === 'refs/heads/main')
    await run('sudo', ['sh', fileURLToPath(new URL('./ci-prepare-codex-sandbox.sh', import.meta.url))], fixtureEnvironment)
  const images = {}
  const manifests = []
  for (const name of ['codex-acp', 'deepseek-harness', 'goose']) {
    const directory = resolve(root, 'packages/ai/models/agents', name)
    const manifest = JSON.parse(await readFile(resolve(directory, 'agent.json'), 'utf8'))
    manifests.push(manifest)
    images[name] = `${manifest.image}:${manifest.version}`
    await run('docker', [
      'build',
      '--build-arg',
      'DEBIAN_MIRROR=https://deb.debian.org/debian',
      '--build-arg',
      'DEBIAN_SECURITY_MIRROR=https://deb.debian.org/debian-security',
      '-t',
      images[name],
      directory,
    ], fixtureEnvironment)
  }
  const fixtureTestEnvironment = {
    ...fixtureEnvironment,
    HAI_ACP_E2E_ENGINE: 'docker',
    HAI_ACP_E2E_IMAGE: images['codex-acp'],
    HAI_ACP_E2E_DSH_IMAGE: images['deepseek-harness'],
    HAI_ACP_E2E_GOOSE_IMAGE: images.goose,
  }
  await run('pnpm', ['test'], fixtureTestEnvironment)
  if (environment.GITHUB_EVENT_NAME !== 'push' || environment.GITHUB_REF !== 'refs/heads/main')
    return
  if (!apiKey || !environment.HAI_ACP_E2E_MODEL || !environment.HAI_ACP_E2E_CAPABILITIES)
    throw new Error('Trusted main ACP acceptance requires OpenRouter credentials, model and verified capabilities')
  const nativeManifests = manifests.filter(manifest => typeof manifest.package === 'string')
  const packages = nativeManifests.flatMap(manifest => [
    `${manifest.package}@${manifest.version}`,
    ...(manifest.runtime ? [`${manifest.runtime.package}@${manifest.runtime.version}`] : []),
  ])
  await run('npm', ['install', '--global', '--no-audit', '--no-fund', ...packages], fixtureEnvironment)
  for (const manifest of nativeManifests) {
    await run(manifest.command, ['--version'], fixtureEnvironment)
    if (manifest.runtime)
      await run(manifest.runtime.command, ['--version'], fixtureEnvironment)
  }
  if (fixtureEnvironment.RUNNER_OS === 'Linux') {
    const temporaryRoot = resolve(fixtureEnvironment.RUNNER_TEMP || tmpdir())
    await mkdir(temporaryRoot, { recursive: true })
    const directory = await mkdtemp(join(temporaryRoot, 'hai-acp-sandbox-'))
    if (dirname(directory) !== temporaryRoot)
      throw new Error('Unexpected sandbox preflight directory')
    try {
      const home = join(directory, 'state')
      await mkdir(home)
      await writeFile(join(directory, 'probe-input.txt'), 'ACP sandbox filesystem probe')
      const code = 'const fs=require("node:fs");const input=fs.readFileSync("probe-input.txt","utf8");fs.writeFileSync("probe-output.txt",input);if(fs.readFileSync("probe-output.txt","utf8")!==input)process.exit(1);process.stdout.write("Codex native sandbox ready\\n")'
      await run('codex', ['sandbox', '-P', ':workspace', '-C', directory, '--', process.execPath, '-e', code], { ...fixtureEnvironment, CODEX_HOME: home })
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  await run('pnpm', ['--filter', '@h-ai/ai', 'exec', 'vitest', 'run', 'tests/ai-acp-openrouter.e2e.test.ts', 'tests/ai-acp-goose.e2e.test.ts', '--maxWorkers=1'], {
    ...fixtureTestEnvironment,
    OPENROUTER_APIKEY: apiKey,
    HAI_ACP_E2E_OPENROUTER: '1',
    HAI_ACP_E2E_REQUIRED: '1',
    HAI_ACP_E2E_GOOSE: '1',
    HAI_ACP_E2E_GOOSE_MODEL: environment.HAI_ACP_E2E_MODEL,
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runACPContainerTests().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
