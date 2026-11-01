import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

async function main() {
  const names = ['codex-acp', 'deepseek-harness']
  const [name, ...options] = process.argv.slice(2)
  if (!names.includes(name))
    throw new Error(`Select agent: ${names.join(', ')}`)
  const selected
    = options.find(value => value.startsWith('--engine='))?.slice(9) ?? 'auto'
  if (!['auto', 'podman', 'docker'].includes(selected))
    throw new Error('Invalid container engine')
  for (const option of options) {
    if (!['--java', '--rust', '--go', `--engine=${selected}`].includes(option))
      throw new Error(`Unknown option: ${option}`)
  }
  async function run(command, args) {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        stdio: 'inherit',
      })
      child.on('error', reject)
      child.on('close', code =>
        code === 0 ? resolve() : reject(new Error('Container command failed')))
    })
  }
  let engine
  for (const candidate of selected === 'auto'
    ? ['podman', 'docker']
    : [selected]) {
    try {
      await run(candidate, ['info'])
      engine = candidate
      break
    }
    catch {
      /* 未就绪时尝试下一引擎；明确选择的引擎不会降级。 */
    }
  }
  if (!engine)
    throw new Error('No ready Podman/Docker engine')
  const directory = fileURLToPath(new URL(`./${name}/`, import.meta.url))
  const manifest = JSON.parse(
    await readFile(new URL(`./${name}/agent.json`, import.meta.url), 'utf8'),
  )
  await run(engine, [
    'build',
    '--build-arg',
    `WITH_JAVA=${options.includes('--java')}`,
    '--build-arg',
    `WITH_RUST=${options.includes('--rust')}`,
    '--build-arg',
    `WITH_GO=${options.includes('--go')}`,
    '-t',
    `${manifest.image}:${manifest.version}`,
    directory,
  ])
}
main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
