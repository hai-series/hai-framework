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

let result
try {
  runPnpm(['-r', '--filter', './packages/*', '--if-present', 'build'], repoRoot)
  const packageSpecifiers = packPublicPackages(path.join(repoRoot, 'packages'), archiveRoot)

  result = spawnSync(
    pnpmBin,
    ['exec', 'vitest', 'run', 'tests/scaffold-gates.e2e.test.ts', '--testTimeout', '1800000', ...vitestArgs],
    {
      env: {
        ...process.env,
        HAI_CLI_PACKAGE_SPECIFIERS: JSON.stringify(packageSpecifiers),
        HAI_CLI_RUN_SCAFFOLD_GATES: '1',
      },
      shell: true,
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
