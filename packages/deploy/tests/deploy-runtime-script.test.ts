import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { createDeploymentManifestFunctions } from '../src/container/deploy-manifest.js'
import { createRuntimeConfigurationScript } from '../src/container/deploy-runtime-script.js'

it('仅更新 Web 原样保留实际配置，不创建配置定稿容器', () => {
  const root = mkdtempSync(join(tmpdir(), 'hai-runtime-script-'))
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
  try {
    const server = join(root, 'server')
    const release = join(server, 'releases/next')
    mkdirSync(join(server, 'config'), { recursive: true })
    mkdirSync(join(release, 'config'), { recursive: true })
    mkdirSync(join(release, '.hai'))
    writeFileSync(join(release, '.hai/compose.json'), JSON.stringify({ services: { serv: { image: 'existing-node:1' }, web: { image: 'next-web:2' } } }))
    writeFileSync(join(release, 'manifest.json'), JSON.stringify({ metadata: { 'node-runtime': 'true' } }))
    const current = '# 运维保留的说明\nAPP="server-current"\nHAI_STORAGE=\'{"publicEndpoint":"https://files.example.test:8443/files"}\'\n'
    writeFileSync(join(server, 'config/.env.runtime'), current)
    writeFileSync(join(release, 'config/.env.runtime'), 'APP=incoming\n')
    const runtime = join(root, 'runtime.sh')
    writeFileSync(runtime, '#!/bin/sh\nprintf called > "$(dirname "$0")/runtime-called"\nexit 91\n')
    chmodSync(runtime, 0o700)
    const script = join(root, 'check.sh')
    writeFileSync(script, `#!/bin/sh\nset -eu\nroot=$1\nrelease=$2\nruntime=$3\nselected=web\npartial=true\nprevious=before\nid=next\nmetadata_work=''\nconfiguration_container=''\nconfiguration_creation_started=false\nruntime_config_changed=false\nruntime_config_existed=false\nruntime_next_owned=false\n${createDeploymentManifestFunctions()}\n${createRuntimeConfigurationScript('serv')}\ndeployment_metadata_init\ntrap deployment_metadata_cleanup EXIT\nprepare_application_runtime\n`)
    const result = spawnSync(shell, [script, server, release, runtime].map(path => path.replaceAll('\\', '/')), { encoding: 'utf8', timeout: 5000, windowsHide: true, env: { ...process.env, PATH: `${dirname(shell)}${delimiter}${process.env.PATH ?? ''}` } })
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(server, 'config/.env.runtime'), 'utf8')).toBe(current)
    expect(readFileSync(join(release, 'config/.env.runtime'), 'utf8')).toBe(current)
    expect(existsSync(join(root, 'runtime-called'))).toBe(false)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
