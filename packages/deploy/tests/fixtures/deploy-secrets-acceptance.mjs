/** 在隔离 Linux 目标验证真实凭据导入；容器和卷由外层运行器登记并回收。 */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

async function main() {
  const api = await import(pathToFileURL(process.argv[2]).href)
  const fixture = JSON.parse(readFileSync(process.argv[3], 'utf8'))
  const root = path.dirname(process.argv[3])
  const directory = path.join(root, 'server')
  mkdirSync(directory, { mode: 0o700 })
  writeFileSync(path.join(directory, 'current'), 'old-release\n')
  const inputFile = path.join(root, 'input.json')
  const input = {
    version: 1,
    projectName: fixture.projectName,
    credentials: { DB_PASSWORD: fixture.dbPassword, STORAGE_PASSWORD: fixture.storagePassword },
    services: [
      { service: 'db', kind: 'postgresql', container: fixture.dbName, volumes: [fixture.dbVolume] },
      { service: 'storage', kind: 's3', container: fixture.storageName, volumes: [fixture.storageVolume] },
    ],
  }
  const saveInput = value => writeFileSync(inputFile, JSON.stringify(value), { mode: 0o600 })
  saveInput(input)
  const options = { directory, inputFile, runtime: 'podman' }
  const before = readdirSync(directory)
  chmodSync(inputFile, 0o644)
  assert.equal((await api.importDeploymentSecrets(options)).success, false)
  chmodSync(inputFile, 0o600)
  const linkedInput = path.join(root, 'input-link.json')
  symlinkSync(inputFile, linkedInput)
  assert.equal((await api.importDeploymentSecrets({ ...options, inputFile: linkedInput })).success, false)
  unlinkSync(linkedInput)
  const plan = await api.importDeploymentSecrets(options)
  assert.equal(plan.success, true, JSON.stringify(plan))
  assert.equal(plan.data.changed, false)
  assert.deepEqual(readdirSync(directory), before)
  for (const secret of Object.values(input.credentials))
    assert.equal(JSON.stringify(plan).includes(secret), false)

  saveInput({ ...input, credentials: { ...input.credentials, DB_PASSWORD: 'WRONG_SYNTHETIC_PASSWORD' } })
  const wrong = await api.importDeploymentSecrets(options)
  assert.equal(wrong.success, false)
  assert.equal(existsSync(path.join(directory, 'managed-secrets.env')), false)
  saveInput(input)

  /** 在真实认证阻塞期间杀死调用进程：持锁提交器随 stdin 关闭退出，不发布凭据状态。 */
  const interrupted = path.join(root, 'interrupted')
  mkdirSync(interrupted, { mode: 0o700 })
  writeFileSync(path.join(interrupted, 'current'), 'original-release\n')
  let importer
  try {
    execFileSync('podman', ['pause', fixture.dbName], { stdio: 'pipe', timeout: 15000 })
    importer = spawn(process.execPath, ['--input-type=module', '-e', `const api=await import(process.argv[1]);await api.importDeploymentSecrets(JSON.parse(process.argv[2]))`, pathToFileURL(process.argv[2]).href, JSON.stringify({ ...options, directory: interrupted, dryRun: false })], { stdio: 'ignore' })
    const closed = once(importer, 'close')
    const started = Date.now()
    while (true) {
      if (existsSync(path.join(interrupted, '.deploy.lock'))) {
        try {
          execFileSync('flock', ['-n', path.join(interrupted, '.deploy.lock'), 'true'], { stdio: 'ignore' })
        }
        catch {
          break
        }
      }
      assert.ok(Date.now() - started < 10000, 'Importer did not acquire lock')
      await delay(50)
    }
    importer.kill('SIGKILL')
    await closed
  }
  finally {
    importer?.kill('SIGKILL')
    execFileSync('podman', ['unpause', fixture.dbName], { stdio: 'pipe', timeout: 15000 })
  }
  const releasedAt = Date.now()
  while (true) {
    try {
      execFileSync('flock', ['-n', path.join(interrupted, '.deploy.lock'), 'true'], { stdio: 'ignore' })
      break
    }
    catch {
      assert.ok(Date.now() - releasedAt < 5000, 'Importer left the deployment lock held')
      await delay(50)
    }
  }
  assert.equal(existsSync(path.join(interrupted, 'managed-secrets.env')), false)
  assert.equal(readFileSync(path.join(interrupted, 'current'), 'utf8'), 'original-release\n')
  assert.equal((await api.importDeploymentSecrets({ ...options, directory: interrupted, dryRun: false })).success, true)

  const owner = spawn('flock', ['-n', path.join(directory, '.deploy.lock'), process.execPath, '-e', 'process.stdout.write("READY\\n");process.stdin.resume()'], { stdio: ['pipe', 'pipe', 'inherit'] })
  const ownerClosed = once(owner, 'close')
  try {
    const [ready] = await once(owner.stdout, 'data')
    assert.match(ready.toString(), /READY/)
    const locked = await api.importDeploymentSecrets({ ...options, dryRun: false })
    assert.equal(locked.success, false)
    assert.equal(locked.error.ext.phase, 'lock')
  }
  finally {
    owner.stdin.end()
    await ownerClosed
  }

  const imported = await Promise.all([
    api.importDeploymentSecrets({ ...options, dryRun: false }),
    api.importDeploymentSecrets({ ...options, dryRun: false }),
  ])
  assert.equal(imported.filter(result => result.success && result.data.changed).length, 1)
  const statePath = path.join(directory, 'managed-secrets.env')
  const state = readFileSync(statePath, 'utf8')
  assert.equal(lstatSync(statePath).mode & 0o777, 0o600)
  assert.match(state, /^FORMAT_VERSION=2\n/)
  assert.equal(parseEnv(state).DB_PASSWORD, Buffer.from(fixture.dbPassword).toString('hex'))
  assert.equal(parseEnv(state).STORAGE_PASSWORD, Buffer.from(fixture.storagePassword).toString('hex'))
  assert.equal((await api.importDeploymentSecrets({ ...options, dryRun: false })).success, true)
  assert.equal(readFileSync(statePath, 'utf8'), state)

  writeFileSync(statePath, 'FORMAT_VERSION=2\nBROKEN=synthetic\n')
  assert.equal((await api.importDeploymentSecrets({ ...options, dryRun: false })).success, false)
  assert.equal(readFileSync(statePath, 'utf8'), 'FORMAT_VERSION=2\nBROKEN=synthetic\n')
  unlinkSync(statePath)
  const unrelated = path.join(root, 'untouched')
  writeFileSync(unrelated, 'must-not-change', { mode: 0o600 })
  symlinkSync(unrelated, statePath)
  assert.equal((await api.importDeploymentSecrets({ ...options, dryRun: false })).success, false)
  assert.equal(readFileSync(unrelated, 'utf8'), 'must-not-change')
  unlinkSync(statePath)
  writeFileSync(statePath, state, { mode: 0o600 })

  /** 两台打包机的候选不同，完整与部分配置均复用服务器值，不修改 current 或卷。 */
  for (const [index, partial] of [false, true].entries()) {
    const release = path.join(root, `computer-${index}`)
    mkdirSync(release, { mode: 0o700 })
    const candidate = (partial ? 'B' : 'A').repeat(32)
    const native = `POSTGRES_PASSWORD=${candidate}\n${partial ? '' : `RUSTFS_SECRET_KEY=${candidate}\n`}`
    const services = { db: { env_file: ['middleware-runtime.env'], volumes: ['db-data:/data'] }, ...(partial ? {} : { storage: { env_file: ['middleware-runtime.env'], volumes: ['storage-data:/data'] } }) }
    const volumes = { 'db-data': { name: fixture.dbVolume }, 'storage-data': { name: fixture.storageVolume } }
    const assets = api.createManagedSecretAssets(fixture.projectName, native, { services, volumes })
    for (const [name, text] of Object.entries(assets))
      writeFileSync(path.join(release, name), text, { mode: 0o600 })
    writeFileSync(path.join(release, 'middleware-runtime.env'), native, { mode: 0o600 })
    writeFileSync(path.join(release, '.env.runtime'), `HAI_DB_PASSWORD=${candidate}\n`, { mode: 0o600 })
    writeFileSync(path.join(release, 'middleware.env'), `HAI_DB='${JSON.stringify({ type: 'postgresql', url: `postgresql://hai:${candidate}@db:5432/hai` })}'\n${partial ? '' : `HAI_STORAGE='${JSON.stringify({ secretAccessKey: candidate })}'\n`}`, { mode: 0o600 })
    execFileSync('sh', [path.join(release, 'resolve-managed-secrets.sh'), directory, release, 'podman'], { stdio: 'pipe', timeout: 20000 })
    const application = parseEnv(readFileSync(path.join(release, 'middleware.env'), 'utf8'))
    assert.equal(decodeURIComponent(new URL(JSON.parse(application.HAI_DB).url).password), fixture.dbPassword)
    if (!partial)
      assert.equal(JSON.parse(application.HAI_STORAGE).secretAccessKey, fixture.storagePassword)
    assert.equal(readFileSync(statePath, 'utf8'), state)
  }
  assert.equal(readFileSync(path.join(directory, 'current'), 'utf8'), 'old-release\n')
  process.stdout.write('IMPORT_ACCEPTANCE_PASS\n')
}

main().catch((error) => {
  process.stderr.write(String(error.stack ?? error))
  process.exitCode = 1
})
