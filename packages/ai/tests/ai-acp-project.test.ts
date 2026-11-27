import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { ai } from '../src/index.js'

const exec = promisify(execFile)

it('exports a bounded Git snapshot, creates an applicable patch and pushes only a confirmed task branch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-project-test-'))
  const project = join(directory, 'project')
  const remote = join(directory, 'remote')
  try {
    await exec('git', ['init', '--initial-branch=main', project])
    await exec('git', ['init', '--bare', remote])
    await mkdir(join(project, 'src'))
    await writeFile(join(project, 'src', 'index.txt'), 'old\n')
    const script = '#!/bin/sh\nprintf executable\n'
    await writeFile(join(project, 'src', 'check.sh'), script)
    await exec('git', ['-C', project, 'add', '.'])
    await exec('git', [
      '-C',
      project,
      'update-index',
      '--chmod=+x',
      'src/check.sh',
    ])
    await exec('git', [
      '-C',
      project,
      '-c',
      'user.name=Tester',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-m',
      'Base',
    ])
    expect((await ai.init({})).success).toBe(true)
    const read = await ai.acp.workspaces.readGitSnapshot({ directory: project, revision: 'refs/heads/main' })
    expect(read.success).toBe(true)
    if (!read.success)
      throw new Error(read.error.message)
    const executableContent = Buffer.from(script).toString('base64')
    expect(read.data.files).toEqual({ 'src/index.txt': 'b2xkCg==', 'src/check.sh': executableContent })
    expect(read.data.executables).toEqual(['src/check.sh'])
    expect((await ai.acp.workspaces.readGitSnapshot({ directory: project, revision: 'refs/heads/main', maxBytes: 2 })).success).toBe(false)
    const pending = await ai.acp.workspaces.diffSnapshot(read.data.files, { 'src/new.txt': 'bmV3Cg==', 'src/check.sh': executableContent })
    expect(pending.success).toBe(true)
    if (!pending.success)
      throw new Error(pending.error.message)
    expect(pending.data.paths).toEqual(['src/index.txt', 'src/new.txt'])
    expect(pending.data.patch).toContain('+new')
    expect((await ai.acp.workspaces.diffSnapshot(read.data.files, { '../danger': 'bmV3Cg==' })).success).toBe(false)
    const publish = {
      directory: project,
      remote,
      revision: read.data.revision,
      patch: pending.data.patch,
      branch: 'agent/test-task',
      author: { name: 'Tester', email: 'test@example.invalid' },
      date: '2026-11-15T00:00:00.000Z',
    }
    expect((await ai.acp.workspaces.publishSnapshot({ ...publish, branch: 'main' })).success).toBe(false)
    const saved = await ai.acp.workspaces.publishSnapshot(publish)
    expect(saved.success).toBe(true)
    expect(await ai.acp.workspaces.publishSnapshot(publish)).toEqual(saved)
    expect((await exec('git', [
      '-C',
      remote,
      'show',
      'refs/heads/agent/test-task:src/new.txt',
    ])).stdout).toBe('new\n')
    expect((await exec('git', ['-C', project, 'rev-parse', 'HEAD'])).stdout.trim()).toBe(read.data.revision)
    await expect(exec('git', [
      '-C',
      remote,
      'rev-parse',
      '--verify',
      'refs/heads/main',
    ])).rejects.toThrow()
  }
  finally {
    await ai.close()
    await rm(directory, { recursive: true, force: true })
  }
})
