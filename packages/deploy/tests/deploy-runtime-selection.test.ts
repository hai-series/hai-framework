import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { deploymentRuntimeFunctions } from '../src/container/deploy-runtime-selection.js'

it.skipIf(process.platform !== 'linux' || process.getuid?.() === 0).each([
  'ready',
  'rootful',
  'missing',
  'symlink',
])('rootless Docker 只使用 SSH 用户自己的已校验套接字 (%s)', async (state) => {
  const directory = await mkdtemp(join(await realpath(homedir()), '.hai-socket-'))
  const socket = join(directory, 'docker.sock')
  const listener = createServer()
  try {
    const listenAt = state === 'symlink'
      ? join(directory, 'other.sock')
      : socket
    if (state !== 'missing')
      await new Promise<void>((resolve, reject) => listener.once('error', reject).listen(listenAt, resolve))
    if (state === 'symlink')
      await symlink(listenAt, socket)
    const docker = join(directory, 'docker')
    await writeFile(docker, [
      '#!/bin/sh',
      'test "$DOCKER_HOST" = "unix://$XDG_RUNTIME_DIR/docker.sock" || exit 42',
      'test -z "$DOCKER_CONTEXT" || exit 42',
      'case "$*" in',
      '  info*) printf "name=seccomp\\n%s\\n" "$HAI_TEST_SECURITY";;',
      '  version|"compose version") ;;',
      '  "compose up --help") printf -- "--pull never\\n";;',
      '  *) exit 1;;',
      'esac',
    ].join('\n'), { mode: 0o700 })
    await chmod(directory, 0o700)
    const result = spawnSync('/bin/sh', [
      '-ec',
      [
        deploymentRuntimeFunctions,
        'select_deployment_runtime docker rootless',
        'check_deployment_compose',
        'printf "%s\\n" "$DOCKER_HOST"',
      ].join('\n'),
    ], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: [directory, process.env.PATH].join(delimiter),
        XDG_RUNTIME_DIR: directory,
        DOCKER_HOST: 'tcp://not-the-deployment-host.example.test:2375',
        DOCKER_CONTEXT: 'unrelated',
        HAI_TEST_SECURITY: state === 'rootful'
          ? ''
          : 'name=rootless',
      },
    })
    if (state === 'ready') {
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout.trim()).toBe(`unix://${socket}`)
    }
    else {
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toMatch(/private runtime directory and docker\.sock|not running in rootless mode/)
    }
  }
  finally {
    await new Promise<void>(resolve => listener.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
