/**
 * 通过公开 deploy API 打包，再在真实 Linux 容器中执行原始 apply.sh。
 * flock/文件描述符/进程与容器重启均为真实行为；仅 Compose/HTTP 用确定性夹具阻塞或失败。
 * 运行：HAI_DEPLOY_E2E=1 pnpm --filter @h-ai/deploy exec vitest run tests/deploy-lock.e2e.test.ts
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deploy } from '../src/index.js'

const enabled = process.env.HAI_DEPLOY_E2E === '1'
let runtime: 'podman' | 'docker'
let root: string
let container: string
let sequence = 0

/** 只运行本次专用容器中的命令，不连接用户部署目录或实际容器服务。 */
function execute(script: string): string {
  return execFileSync(runtime, ['exec', container, 'sh', '-c', script], { encoding: 'utf8', timeout: 20_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** 原封不动运行生成的服务器脚本，保留其真实退出码。 */
function apply(bundle: { directory: string }) {
  return spawnSync(runtime, ['exec', container, 'sh', '-c', `export PATH=/fixture/bin:$PATH; sh /fixture/${bundle.directory}/apply.sh /fixture/server`], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
}

/** 后台启动真实 shell，并将日志与 PID 保留在本次容器中。 */
function start(bundle: { directory: string }): number {
  return Number(execute(`export PATH=/fixture/bin:$PATH; sh /fixture/${bundle.directory}/apply.sh /fixture/server >/fixture/${bundle.directory}.log 2>&1 & echo $!`))
}

/** 经公开 API 创建真实校验和及配置，再把包送入测试 Linux。 */
async function pack(selectedServices?: string[]): Promise<{ id: string, directory: string }> {
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, selectedServices })
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected a complete deployment bundle')
  const directory = `package-${sequence++}`
  const extracted = join(root, directory)
  mkdirSync(extracted)
  execFileSync('tar', ['-xf', result.data.bundlePath, '-C', extracted], { windowsHide: true })
  execFileSync(runtime, ['cp', extracted, `${container}:/fixture/${directory}`], { windowsHide: true })
  return { id: result.data.deploymentId, directory }
}

describe.skipIf(!enabled)('linux deployment process locks', () => {
  beforeEach(async () => {
    const candidate = (['podman', 'docker'] as const).find(command => spawnSync(command, ['version'], { timeout: 20_000, windowsHide: true, stdio: 'ignore' }).status === 0)
    if (!candidate)
      throw new Error('Deployment lock gate requires a reachable Podman or Docker engine')
    runtime = candidate
    root = mkdtempSync(join(tmpdir(), 'hai-deploy-lock-'))
    container = `hai-deploy-lock-${randomUUID()}`
    const artifacts = join(root, '.hai/build/docker/release-1')
    mkdirSync(artifacts, { recursive: true })
    mkdirSync(join(root, 'bin'))
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  .: {}\n')
    writeFileSync(join(root, '.env.test'), 'HAI_CORE_ENV=test\n')
    writeFileSync(join(root, '.hai/build/docker/latest'), 'release-1\n')
    writeFileSync(join(artifacts, 'app-1.2.3.tar'), 'prebuilt-image')
    writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 3, appVersion: '1.2.3', buildId: 'release-1', images: [{ name: 'app', file: 'app-1.2.3.tar', imageRef: 'localhost/lock-test:1', sha256: createHash('sha256').update('prebuilt-image').digest('hex'), containerPort: 3000 }] }))
    writeFileSync(join(root, 'bin/docker'), `#!/bin/sh
printf '%s\\n' "$*" >> /fixture/commands.log
case "$*" in
  *'up --help'*) printf 'never\\n';;
  *'config --services'*) if [ -f /fixture/has-web ]; then printf 'app\\nweb\\n'; else printf 'app\\n'; fi;;
  *'image inspect --format'*) printf 'amd64\\n';;
esac
if [ "$1" = load ] && [ -f /fixture/block-load ]; then
  printf '%s\\n' "$$" > /fixture/runtime.pid
  touch /fixture/entered-load
  while [ ! -f /fixture/release-load ]; do sleep 0.05; done
fi
if [ -f /fixture/background-service ]; then
  case " $* " in
    *' up -d '*)
      sleep 3600 </dev/null >/dev/null 2>&1 &
      printf '%s\\n' "$!" > /fixture/service.pid
      ;;
  esac
fi
`)
    writeFileSync(join(root, 'bin/curl'), '#!/bin/sh\ntest ! -f /fixture/fail-health\n')
    execFileSync(runtime, ['run', '-d', '--name', container, '--entrypoint', 'node', 'docker.io/library/node:24.22.1-bookworm-slim', '-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' })
    execFileSync(runtime, ['cp', root, `${container}:/fixture`], { windowsHide: true })
    execute('chmod 700 /fixture/bin/*; command -v flock; mkdir -p /fixture/server/.deploy-lock')
    expect(await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime: 'docker' }, expose: { hostPort: 18080 } } })).toMatchObject({ success: true })
  }, 60_000)

  afterEach(async () => {
    await deploy.close()
    if (container) {
      spawnSync(runtime, ['kill', '--signal', 'KILL', container], { windowsHide: true, stdio: 'ignore' })
      execFileSync(runtime, ['rm', '-f', container], { windowsHide: true, stdio: 'ignore' })
    }
    if (root) {
      if (dirname(root) !== tmpdir() || !basename(root).startsWith('hai-deploy-lock-'))
        throw new Error('Unexpected deployment lock fixture cleanup path')
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('真实 Linux 执行 app 增量容量更新：复用 Web 镜像更新代理，失败恢复旧配置', async () => {
    const artifacts = join(root, '.hai/build/docker/release-1')
    mkdirSync(join(root, 'config'))
    writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 1048576\n')
    const images = ['app', 'web'].map((name) => {
      const file = `${name}-1.2.3.tar`
      const content = `prebuilt-${name}`
      writeFileSync(join(artifacts, file), content)
      return { name, file, imageRef: `localhost/capacity-${name}:1`, sha256: createHash('sha256').update(content).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
    })
    writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 3, appVersion: '1.2.3', buildId: 'release-1', hasWeb: true, images }))
    execute('touch /fixture/has-web')
    const full = await pack()
    expect(apply(full).status).toBe(0)
    writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 8388608\n')
    const incremental = await pack(['app'])
    const applied = apply(incremental)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0)
    expect(execute(`cat /fixture/server/releases/${incremental.id}/web.conf`)).toContain('client_max_body_size 16809984;')
    expect(execute(`cat /fixture/server/releases/${incremental.id}/compose-files`)).toContain('proxy-entry.json')
    expect(execute('cat /fixture/commands.log')).toContain('--no-recreate app web')
    expect(execute('cat /fixture/commands.log')).not.toContain(`load -i /fixture/server/releases/${incremental.id}/images/web-`)
    writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 4194304\n')
    const failed = await pack(['app'])
    execute('touch /fixture/fail-health; printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep')
    expect(apply(failed).status).toBe(1)
    expect(execute('cat /fixture/server/current')).toBe(incremental.id)
    expect(execute(`cat /fixture/server/releases/${incremental.id}/web.conf`)).toContain('client_max_body_size 16809984;')
    expect(execute('cat /fixture/commands.log')).toContain(`/releases/${incremental.id}/compose-entry.json`)
  }, 60_000)

  it('并发只允许一个，活跃长部署不被超时偷锁；完成后同一 inode 可复用', async () => {
    const owner = await pack()
    const contender = await pack()
    execute('touch /fixture/block-load')
    start(owner)
    await vi.waitFor(() => expect(execute('test -f /fixture/entered-load && echo ready')).toBe('ready'))
    const inode = execute('stat -c %i /fixture/server/.deploy.lock')
    for (let attempt = 0; attempt < 2; attempt++) {
      const blocked = apply(contender)
      expect(blocked.status).toBe(1)
      expect(blocked.stderr).toContain('Another deployment is running')
      expect(execute(`test ! -e /fixture/server/result-${contender.id}.json && echo absent`)).toBe('absent')
      await setTimeout(600)
    }
    execute('touch /fixture/release-load')
    await vi.waitFor(() => expect(execute('cat /fixture/server/current')).toBe(owner.id), { timeout: 10_000 })
    expect(apply(contender).status).toBe(0)
    expect(execute('stat -c %i /fixture/server/.deploy.lock')).toBe(inode)
    expect(execute('test -d /fixture/server/.deploy-lock && echo retained')).toBe('retained')
  }, 60_000)

  it('正常完成后后台服务继承的描述符不阻塞下一次部署', async () => {
    const owner = await pack()
    const next = await pack()
    execute('touch /fixture/background-service')
    expect(apply(owner).status).toBe(0)
    expect(JSON.parse(execute(`cat /fixture/server/result-${owner.id}.json`))).toMatchObject({ stage: 'complete', exitCode: 0 })
    const servicePid = execute('cat /fixture/service.pid')
    expect(execute(`kill -0 ${servicePid} && readlink /proc/${servicePid}/fd/9`)).toBe('/fixture/server/.deploy.lock')
    const repeated = apply(next)
    expect(repeated.status, repeated.stderr).toBe(0)
    expect(execute('cat /fixture/server/current')).toBe(next.id)
    expect(execute(`kill -0 ${servicePid} && echo alive`)).toBe('alive')
  }, 60_000)

  it.each(['KILL', 'TERM'] as const)('父 shell 收到 %s 后活跃子命令继续持锁；子命令退出后自动恢复', async (signal) => {
    const owner = await pack()
    const retry = await pack()
    execute('touch /fixture/block-load')
    const pid = start(owner)
    expect(Number.isSafeInteger(pid) && pid > 1).toBe(true)
    await vi.waitFor(() => expect(execute('test -f /fixture/entered-load && echo ready')).toBe('ready'))
    execute(`kill -${signal} ${pid}`)
    expect(execute('kill -0 "$(cat /fixture/runtime.pid)" && echo alive')).toBe('alive')
    const blocked = apply(retry)
    expect(blocked.status).toBe(1)
    expect(blocked.stderr).toContain('Another deployment is running')
    execute('touch /fixture/release-load')
    await vi.waitFor(() => expect(execute('flock -n /fixture/server/.deploy.lock -c "echo released"')).toBe('released'), { timeout: 10_000 })
    expect(apply(retry).status).toBe(0)
    if (signal === 'KILL')
      expect(execute(`test ! -e /fixture/server/result-${owner.id}.json && echo unknown`)).toBe('unknown')
    else
      expect(JSON.parse(execute(`cat /fixture/server/result-${owner.id}.json`))).toMatchObject({ stage: 'images', exitCode: 130 })
  }, 60_000)

  it('全部持有进程强杀和容器重启后锁自动释放，不要求删除锁文件或旧锁目录', async () => {
    const killed = await pack()
    const afterKill = await pack()
    const rebooted = await pack()
    const afterReboot = await pack()
    execute('touch /fixture/block-load')
    const pid = start(killed)
    await vi.waitFor(() => expect(execute('test -f /fixture/entered-load && echo ready')).toBe('ready'))
    const inode = execute('stat -c %i /fixture/server/.deploy.lock')
    execute(`kill -KILL ${pid} "$(cat /fixture/runtime.pid)"; touch /fixture/release-load`)
    await vi.waitFor(() => expect(execute('flock -n /fixture/server/.deploy.lock -c "echo released"')).toBe('released'), { timeout: 10_000 })
    expect(apply(afterKill).status).toBe(0)
    execute('rm /fixture/release-load /fixture/entered-load')
    start(rebooted)
    await vi.waitFor(() => expect(execute('test -f /fixture/entered-load && echo ready')).toBe('ready'))
    execFileSync(runtime, ['restart', '--time', '0', container], { windowsHide: true, stdio: 'ignore' })
    execute('touch /fixture/release-load')
    expect(apply(afterReboot).status).toBe(0)
    expect(execute('stat -c %i /fixture/server/.deploy.lock')).toBe(inode)
    expect(execute('test -d /fixture/server/.deploy-lock && echo retained')).toBe('retained')
  }, 60_000)

  it('真实 Linux 脚本拒绝首次增量，允许同版本更新，健康失败保持成功基线并保留恢复结果', async () => {
    const firstPartial = await pack(['app'])
    expect(apply(firstPartial).status).toBe(1)
    const full = await pack()
    expect(apply(full).status).toBe(0)
    const partial = await pack(['app'])
    expect(apply(partial).status).toBe(0)
    const failed = await pack(['app'])
    // 将健康轮询的等待缩短，不替换 flock 或进程行为。
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/fail-health')
    expect(apply(failed).status).toBe(1)
    expect(execute('cat /fixture/server/current')).toBe(partial.id)
    expect(JSON.parse(execute(`cat /fixture/server/result-${failed.id}.json`))).toMatchObject({ stage: 'health', exitCode: 1 })
    expect(execute(`test -f /fixture/server/diagnostics-${failed.id}.log && echo retained`)).toBe('retained')
  }, 60_000)

  it('缺失 flock 或文件系统锁失败时预检关闭，不冒充另一个活跃部署', async () => {
    const bundle = await pack()
    execute('mv /usr/bin/flock /usr/bin/flock.disabled')
    const missing = apply(bundle)
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('Required command missing: flock')
    expect(execute('test ! -e /fixture/server/.deploy.lock && echo absent')).toBe('absent')
    execute('printf "#!/bin/sh\\nexit 73\\n" > /fixture/bin/flock; chmod 700 /fixture/bin/flock')
    const unsupported = apply(bundle)
    expect(unsupported.status).toBe(73)
    expect(unsupported.stderr).toContain('Check filesystem flock support and permissions')
    expect(unsupported.stderr).not.toContain('Another deployment is running')
  }, 60_000)
  it('完整目录复制到含空格路径后自动解包并执行相同部署流程', async () => {
    const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
    expect(result.success).toBe(true)
    if (!result.success || !result.data.bundlePath)
      throw new Error('Expected a deployment bundle')
    execFileSync(runtime, ['cp', dirname(result.data.bundlePath), `${container}:/fixture/local package`], { windowsHide: true })
    execute('export PATH=/fixture/bin:$PATH; cd /; sh \'/fixture/local package/deploy-local.sh\' /fixture/server')
    expect(execute('cat /fixture/server/current')).toBe(result.data.deploymentId)
    expect(execute('find \'/fixture/local package\' -maxdepth 1 -name \'deploy-local-*.log\' | wc -l')).toBe('1')
    expect(execute('find /tmp -maxdepth 1 -type d -name \'hai-deploy.*\' | wc -l')).toBe('0')
  }, 30_000)
})
