import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDirectory, '../../..')
const vitestArgs = process.argv.slice(2)
const deployGate = vitestArgs.includes('--deploy')
const generateGate = vitestArgs.includes('--generate')
const i18nGate = vitestArgs.includes('--i18n')
const listGate = vitestArgs.includes('--list')
if (deployGate)
  vitestArgs.splice(vitestArgs.indexOf('--deploy'), 1)
if (generateGate)
  vitestArgs.splice(vitestArgs.indexOf('--generate'), 1)
if (i18nGate)
  vitestArgs.splice(vitestArgs.indexOf('--i18n'), 1)
if (listGate)
  vitestArgs.splice(vitestArgs.indexOf('--list'), 1)
if ([generateGate, deployGate, i18nGate].filter(Boolean).length > 1)
  throw new Error('Choose one of --generate, --deploy or --i18n')
const focusedGate = generateGate || i18nGate || listGate
const vitestCli = path.join(path.dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs')
const archiveRoot = mkdtempSync(path.join(tmpdir(), 'hai-cli-local-packages-'))
const lightTestFiles = ['tests/generate-i18n.test.ts', 'tests/command-locales.test.ts', 'tests/environment-output.test.ts']
const testFiles = deployGate
  ? ['tests/deploy-fixture-ownership.e2e.test.ts', 'tests/deploy-nginx.e2e.test.ts', 'tests/deploy-storage-proxy.e2e.test.ts', 'tests/deploy-docker-ssh.e2e.test.ts']
  : generateGate
    ? ['tests/generate-runtime.e2e.test.ts']
    : i18nGate
      ? lightTestFiles
      : ['tests/scaffold-gates.e2e.test.ts', 'tests/generate-runtime.e2e.test.ts', ...lightTestFiles]
// 两个重型文件同窗会争抢构建与安装资源；轻型进程门禁仍与 runtime 使用最多两个 worker。
// list 保持一次完整发现，便于直接消费 JSON，并覆盖所有默认门禁。
const batches = !deployGate && !generateGate && !i18nGate && !listGate
  ? [['tests/generate-runtime.e2e.test.ts', ...lightTestFiles], ['tests/scaffold-gates.e2e.test.ts']]
  : [testFiles]
// 真实生成门禁统一放在名称含 gates 的 suite 中；新增同族用例自动纳入，避免重跑文件内普通单测。
const namePattern = !deployGate && !vitestArgs.some(argument => /^(?:-t(?:=|$)|--testNamePattern(?:=|$))/.test(argument))
  ? ['--testNamePattern', '\\bgates\\b']
  : []

let exitCode = 0
try {
  // 按真实依赖图顺序构建，复用刚通过的产物，避免重新清理共享 dist 干扰其他门禁。
  if (!focusedGate)
    runPnpm(['exec', 'turbo', 'run', 'build', '--filter=@h-ai/*', '--concurrency=4'], repoRoot)
  // 定向生成门禁复用仓库已安装依赖；不隐式升级为全模块构建与发布包安装验收。
  const packageSpecifiers = focusedGate ? {} : packPublicPackages(path.join(repoRoot, 'packages'), archiveRoot)
  // 仅覆盖实际依赖边；全局覆盖会把可选 peer 变成安装依赖，污染生成项目。
  const packageOverrides = {}
  for (const directory of readdirSync(path.join(repoRoot, 'packages'), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'packages', directory.name, 'package.json'), 'utf8'))
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      if (packageSpecifiers[name])
        packageOverrides[`${manifest.name}>${name}`] = packageSpecifiers[name]
    }
  }

  for (const files of batches) {
    const result = spawnSync(
      process.execPath,
      [vitestCli, listGate ? 'list' : 'run', ...files, ...namePattern, ...(deployGate ? ['--no-file-parallelism'] : []), '--testTimeout', '1800000', ...vitestArgs],
      {
        env: {
          ...process.env,
          HAI_CLI_PACKAGE_SPECIFIERS: JSON.stringify(packageSpecifiers),
          HAI_CLI_PACKAGE_OVERRIDES: JSON.stringify(packageOverrides),
          HAI_CLI_RUN_SCAFFOLD_GATES: '1',
          ...(!deployGate && !i18nGate ? { HAI_CLI_RUN_GENERATE_GATES: '1' } : {}),
          ...(!deployGate && !generateGate ? { HAI_CLI_RUN_I18N_GATES: '1', HAI_CLI_RUN_LOCALE_GATES: '1', HAI_CLI_RUN_ENV_OUTPUT_GATES: '1' } : {}),
          ...(deployGate ? { HAI_DEPLOY_E2E: '1' } : {}),
        },
        // 直接启动 Node，测试名中的空格/正则不能被 Windows shell 当成命令。
        shell: false,
        stdio: 'inherit',
      },
    )
    // 普通失败继续收集下一批，保留首个失败码；启动失败或信号中断停止后续批次。
    if (result.status !== 0)
      exitCode ||= result.status ?? 1
    if (result.error) {
      process.stderr.write(`${result.error.message}\n`)
      break
    }
    // Vitest 可把信号转换为退出码；Windows 控制台取消还可能返回 STATUS_CONTROL_C_EXIT。
    if (result.signal || [130, 143, 3221225786, -1073741510].includes(result.status))
      break
  }
}
finally {
  rmSync(archiveRoot, { recursive: true, force: true })
}

process.exit(exitCode)

function packPublicPackages(packagesRoot, destination) {
  const specifiers = {}
  const packageDirectories = readdirSync(packagesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(packagesRoot, entry.name))

  for (const packageDirectory of packageDirectories) {
    const manifestPath = path.join(packageDirectory, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        continue
      throw error
    }

    if (manifest.private === true || typeof manifest.name !== 'string')
      continue

    const before = new Set(readdirSync(destination))
    runPnpm(['pack', '--pack-destination', destination], packageDirectory, 'pipe')
    const archiveName = readdirSync(destination).find(name => !before.has(name) && name.endsWith('.tgz'))
    if (!archiveName)
      throw new Error(`pnpm pack did not create an archive for ${manifest.name}`)

    const archivePath = path.join(destination, archiveName).replaceAll('\\', '/')
    specifiers[manifest.name] = `file:${archivePath}`
  }

  return specifiers
}

function runPnpm(args, cwd, stdio = 'inherit') {
  const command = spawnSync(pnpmBin, args, {
    cwd,
    shell: true,
    stdio,
  })
  if (command.error)
    throw command.error
  if (command.status !== 0) {
    if (stdio === 'pipe') {
      process.stderr.write(command.stdout ?? '')
      process.stderr.write(command.stderr ?? '')
    }
    throw new Error(`pnpm ${args.join(' ')} failed with exit code ${command.status ?? 1}`)
  }
}
