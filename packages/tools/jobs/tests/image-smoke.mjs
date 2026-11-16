import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

async function smoke() {
  const engine = process.env.HAI_TOOL_IMAGE_ENGINE ?? 'podman'
  if (!['podman', 'docker'].includes(engine))
    throw new Error('HAI_TOOL_IMAGE_ENGINE must be podman or docker')
  const directory = await mkdtemp(join(tmpdir(), 'hai-tool-images-'))
  const input = join(directory, 'input')
  const output = join(directory, 'output')
  try {
    await mkdir(input, { mode: 0o755 })
    await mkdir(output)
    await chmod(output, 0o777)
    await writeFile(join(input, 'input.txt'), 'HAI tool image fixture')
    for (const [name, request, check] of [
      [
        'documents',
        { operation: 'documents.extract', input: 'input.txt' },
        result => result.data?.text === 'HAI tool image fixture',
      ],
      [
        'office',
        { operation: 'office.convert', input: 'input.txt', output: 'office.pdf' },
        result => result.error?.code === 'INVALID_REQUEST',
      ],
      [
        'ocr',
        { operation: 'ocr.recognize', input: 'input.txt' },
        result => result.error?.code === 'INVALID_INPUT',
      ],
      [
        'browser',
        { operation: 'browser.navigate', url: 'https://example.com/', output: 'page.png' },
        result => result.error?.code === 'NETWORK_POLICY_REQUIRED',
      ],
    ]) {
      const image = process.env[`HAI_TOOL_IMAGE_${name.toUpperCase()}`]
      if (!image)
        throw new Error(`Missing image for ${name}`)
      const task = spawnSync(engine, [
        'run',
        '--rm',
        '--pull=never',
        '-i',
        '--network=none',
        '--read-only',
        '--tmpfs=/tmp:rw,nosuid,nodev,size=128m',
        ...(engine === 'podman'
          ? ['--userns=keep-id:uid=1000,gid=1000']
          : []),
        '--mount',
        `type=bind,src=${input},dst=/input,ro=true`,
        '--mount',
        `type=bind,src=${output},dst=/output`,
        image,
      ], {
        input: JSON.stringify(request),
        encoding: 'utf8',
        timeout: 30_000,
      })
      if (task.status !== 0)
        throw new Error(`${name} failed to start: ${task.stderr ?? task.error}`)
      const result = JSON.parse(task.stdout)
      if (!check(result))
        throw new Error(`${name} returned unexpected result: ${JSON.stringify(result)}`)
      process.stdout.write(`${name} image smoke passed\n`)
    }
    if (await readFile(join(input, 'input.txt'), 'utf8') !== 'HAI tool image fixture')
      throw new Error('Tool modified read-only input')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

smoke().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
