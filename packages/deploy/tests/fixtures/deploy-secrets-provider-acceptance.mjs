/** 真实 MySQL/LDAP 凭据验证；外层运行器负责创建和清理全部测试资源。 */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

async function main() {
  const api = await import(pathToFileURL(process.argv[2]).href)
  const fixture = JSON.parse(readFileSync(process.argv[3], 'utf8'))
  const root = path.dirname(process.argv[3])
  const directory = path.join(root, fixture.scenario)
  mkdirSync(directory, { mode: 0o700 })
  writeFileSync(path.join(directory, 'current'), 'original-release\n')
  const inputFile = path.join(root, `${fixture.scenario}.json`)
  const group = fixture.service === 'db' ? 'DB_PASSWORD' : 'LDAP_PASSWORD'
  const input = { version: 1, projectName: fixture.projectName, credentials: { [group]: fixture.password }, services: [{ service: fixture.service, kind: fixture.kind, container: fixture.container, volumes: fixture.volumes }] }
  const save = value => writeFileSync(inputFile, JSON.stringify(value), { mode: 0o600 })
  const options = { directory, inputFile, runtime: 'podman' }
  save({ ...input, credentials: { [group]: 'WRONG_SYNTHETIC_PASSWORD' } })
  assert.equal((await api.importDeploymentSecrets(options)).success, false)
  save(input)
  const plan = await api.importDeploymentSecrets(options)
  assert.equal(plan.success, fixture.expected, JSON.stringify(plan))
  if (!fixture.expected)
    assert.equal(plan.error.ext.phase, 'verification', JSON.stringify(plan))
  assert.equal(existsSync(path.join(directory, 'managed-secrets.env')), false)
  if (fixture.expected) {
    const result = await api.importDeploymentSecrets({ ...options, dryRun: false })
    assert.equal(result.success, true, JSON.stringify(result))
    const state = path.join(directory, 'managed-secrets.env')
    assert.equal(lstatSync(state).mode & 0o777, 0o600)
    assert.ok(readFileSync(state, 'utf8').includes(`${group}=${Buffer.from(fixture.password).toString('hex')}\n`))
    assert.equal((await api.importDeploymentSecrets({ ...options, dryRun: false })).success, true)
  }
  assert.equal(readFileSync(path.join(directory, 'current'), 'utf8'), 'original-release\n')
  process.stdout.write('PROVIDER_ACCEPTANCE_PASS\n')
}

main().catch((error) => {
  process.stderr.write(String(error.stack ?? error))
  process.exitCode = 1
})
