import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDirectory, '../../..')
const archiveRoot = mkdtempSync(path.join(tmpdir(), 'hai-cli-local-packages-'))
const vitestArgs = process.argv.slice(2)
const deployGate = vitestArgs.includes('--deploy')
if (deployGate)
  vitestArgs.splice(vitestArgs.indexOf('--deploy'), 1)
const vitestCli = path.join(path.dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs')

let result
try {
  // 打包前顺序重建所有 @h-ai 包（--workspace-concurrency=1）。
  // CI 并行构建下 tsup 的 .d.ts 生成会偶发失败（典型为 @h-ai/kit、@h-ai/capacitor），
  // 使 tarball 缺失类型声明，生成项目 svelte-check 报 "Cannot find module … type declarations"。
  // 顺序重建可稳定产出含 .d.ts 的完整 dist。原 './packages/*' 过滤在 shell:true 下被展开成 no-op。
  runPnpm(['-r', '--filter', '@h-ai/*', '--workspace-concurrency=1', 'build'], repoRoot)
  const packageSpecifiers = packPublicPackages(path.join(repoRoot, 'packages'), archiveRoot)
  // 仅覆盖实际依赖边；全局覆盖会把可选 peer 变成安装依赖，污染生成项目。
  const packageOverrides = {}
  for (const directory of readdirSync(path.join(repoRoot, 'packages'), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'packages', directory.name, 'package.json'), 'utf8'))
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      if (packageSpecifiers[name])
        packageOverrides[`${manifest.name}>${name}`] = packageSpecifiers[name]
    }
  }

  result = spawnSync(
    process.execPath,
    [vitestCli, 'run', deployGate ? 'tests/deploy-docker-ssh.e2e.test.ts' : 'tests/scaffold-gates.e2e.test.ts', '--testTimeout', '1800000', ...vitestArgs],
    {
      env: {
        ...process.env,
        HAI_CLI_PACKAGE_SPECIFIERS: JSON.stringify(packageSpecifiers),
        HAI_CLI_PACKAGE_OVERRIDES: JSON.stringify(packageOverrides),
        HAI_CLI_RUN_SCAFFOLD_GATES: '1',
        ...(deployGate ? { HAI_DEPLOY_E2E: '1' } : {}),
      },
      // 直接启动 Node，测试名中的空格/正则不能被 Windows shell 当成命令。
      shell: false,
      stdio: 'inherit',
    },
  )
}
finally {
  rmSync(archiveRoot, { recursive: true, force: true })
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`)
}

process.exit(result.status ?? 1)

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
