import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { createDeploymentManifestFunctions } from '../src/container/deploy-manifest.js'

it('清单读取和服务列表使用本次私有缓存，正常退出后回收缓存', () => {
  const root = mkdtempSync(join(tmpdir(), 'hai-manifest-functions-'))
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
  try {
    mkdirSync(join(root, '.hai'))
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({ metadata: { 'health-paths': '/health\n/ready\n' } }))
    writeFileSync(join(root, '.hai/compose.json'), JSON.stringify({ services: { serv: { image: 'example:v1' } } }))
    const script = join(root, 'check.sh')
    writeFileSync(script, `#!/bin/sh\nset -eu\numask 077\nroot=$1\n${createDeploymentManifestFunctions()}\ndeployment_metadata_init\ntrap deployment_metadata_cleanup EXIT\nmetadata=$(deployment_metadata_file "$root" health-paths)\ncat "$metadata"\nservices=$(deployment_services_file "$root")\ncat "$services"\n`)
    const result = spawnSync(shell, [script.replaceAll('\\', '/'), root.replaceAll('\\', '/')], { encoding: 'utf8', timeout: 5000, windowsHide: true, env: { ...process.env, PATH: `${dirname(shell)}${delimiter}${process.env.PATH ?? ''}` } })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.replaceAll('\r\n', '\n')).toBe('/health\n/ready\nserv\n')
    expect(readdirSync(root).some(name => name.startsWith('.deployment-metadata.'))).toBe(false)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
