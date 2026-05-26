import { spawnSync } from 'node:child_process'
import process from 'node:process'

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(
  pnpmBin,
  ['exec', 'vitest', 'run', 'tests/scaffold-gates.e2e.test.ts', '--testTimeout', '1800000'],
  {
    env: { ...process.env, HAI_CLI_RUN_SCAFFOLD_GATES: '1' },
    shell: true,
    stdio: 'inherit',
  },
)

if (result.error) {
  process.stderr.write(`${result.error.message}\n`)
}

process.exit(result.status ?? 1)
