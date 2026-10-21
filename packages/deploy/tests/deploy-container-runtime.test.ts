import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runCommand } from '../src/container/deploy-command.js'
import { buildImage } from '../src/container/deploy-container-runtime.js'

vi.mock('../src/container/deploy-command.js', () => ({ runCommand: vi.fn() }))
let directory: string | undefined
afterEach(() => {
  vi.clearAllMocks()
  if (directory)
    rmSync(directory, { recursive: true, force: true })
})

it('passes the generated ignore file explicitly to Podman for an external Dockerfile', async () => {
  directory = mkdtempSync(join(tmpdir(), 'hai-private-context-'))
  const target = join(directory, '.hai/deploy/test')
  mkdirSync(target, { recursive: true })
  const dockerfilePath = join(target, 'Dockerfile')
  writeFileSync(`${dockerfilePath}.dockerignore`, '**/.env.local\n**/.hai/deploy\n')
  vi.mocked(runCommand).mockResolvedValue({ success: true, data: { code: 0, stdout: '', stderr: '' } })
  const result = await buildImage('podman', { contextDir: directory, dockerfilePath, imageRef: 'test', httpProxy: false })
  expect(result.success).toBe(true)
  expect(runCommand).toHaveBeenCalledWith('podman', expect.arrayContaining(['--ignorefile', `${dockerfilePath}.dockerignore`, '--http-proxy=false']), { cwd: directory })
})
