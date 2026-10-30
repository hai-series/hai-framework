/**
 * 通过公开 deploy API 打包，再在真实 Linux 容器中执行原始 apply.sh。
 * flock/文件描述符/进程与容器重启均为真实行为；仅 Compose/HTTP 用确定性夹具阻塞或失败。
 * 运行：HAI_DEPLOY_E2E=1 pnpm --filter @h-ai/deploy exec vitest run tests/deploy-lock.e2e.test.ts
 */
import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApplyScript } from '../src/container/deploy-scripts.js'
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

/** 只在故障夹具中替换已校验的卷/引擎元数据，重新生成真实 SHA-256。 */
function declareDatabaseBackend(bundle: { directory: string }, backend: 'postgresql' | 'mysql'): string {
  const project = execute(`cat /fixture/${bundle.directory}/managed-project`)
  const volume = `${project}_${project.slice('hai-'.length)}-db-data`
  execute(`printf 'db ${backend} ${volume}\\n' > /fixture/${bundle.directory}/state-backends; cd /fixture/${bundle.directory}; sed '/  state-backends$/d' SHA256SUMS > SHA256SUMS.next; sha256sum state-backends >> SHA256SUMS.next; mv SHA256SUMS.next SHA256SUMS; printf '${volume}\\n' > /fixture/volume-to-create`)
  return volume
}

/** 故障夹具只调整公开目录元数据并重算摘要，真实apply负责判断增量是否匹配既有基线。 */
function declareWebBase(bundle: { directory: string }, base: '/yyy' | '/other') {
  execute(`printf '%s\\n' '${base}' > /fixture/${bundle.directory}/web-base-path; cd /fixture/${bundle.directory}; sed '/  web-base-path$/d' SHA256SUMS > SHA256SUMS.next; sha256sum web-base-path >> SHA256SUMS.next; mv SHA256SUMS.next SHA256SUMS`)
}

/** 确定性 Compose 夹具仅声明代理身份；真实 shell 必须按该元数据刷新并恢复保留代理。 */
function declareProxyIdentity(bundle: { directory: string }, proxy: 'web' | 'gateway'): void {
  execute(`cd /fixture/${bundle.directory}; printf '%s\\n' '${proxy}' > proxy-service; awk -F: 'BEGIN {OFS=":"} {$3="${proxy === 'web' ? 'true' : 'gateway'}"; print}' layout > layout.next; mv layout.next layout; sed '/  proxy-service$/d; /  layout$/d' SHA256SUMS > SHA256SUMS.next; sha256sum proxy-service layout >> SHA256SUMS.next; mv SHA256SUMS.next SHA256SUMS`)
}

/** 只调整非敏感配置摘要并重算真实交付校验和，验证更新前的增量拒绝。 */
function declareStorageRouting(bundle: { directory: string }, value: string | undefined): void {
  const digest = value === undefined ? undefined : createHash('sha256').update(value).digest('hex')
  execute(`cd /fixture/${bundle.directory}; ${digest ? `printf '%s\\n' '${digest}' > storage-routing` : 'rm storage-routing'}; sed '/  storage-routing$/d' SHA256SUMS > SHA256SUMS.next; ${digest ? 'sha256sum storage-routing >> SHA256SUMS.next;' : ''} mv SHA256SUMS.next SHA256SUMS`)
}

/** 只写入公开导入工具会生成的受控 v2 状态；实际容器身份仍由脚本重新核对。 */
function seedImportedDatabase(bundle: { directory: string }, volume: string, projectOverride?: string): string {
  const project = execute(`cat /fixture/${bundle.directory}/managed-project`)
  const imported = join(root, 'imported-managed-secrets.env')
  writeFileSync(imported, `FORMAT_VERSION=2\nPROJECT=${projectOverride ?? project}\nDB_PASSWORD=${Buffer.from('fixture-import-password').toString('hex')}\nVOLUME_1=DB_PASSWORD:${volume}\n`)
  execFileSync(runtime, ['cp', imported, `${container}:/fixture/server/managed-secrets.env`], { windowsHide: true })
  execute('chmod 600 /fixture/server/managed-secrets.env')
  return project
}
/** 失败必须停在预检；不能由启动失败或历史回滚副作用凑成拒绝。 */
function expectPreflightRefusal(bundle: { id: string }, outcome: ReturnType<typeof apply>): void {
  expect(outcome.status, `${outcome.stdout}\n${outcome.stderr}`).toBe(1)
  expect(JSON.parse(execute(`cat /fixture/server/result-${bundle.id}.json`))).toMatchObject({ stage: 'preflight', exitCode: 1 })
  expect(execute('cat /fixture/commands.log')).not.toMatch(/load -i|rm -f| up -d /)
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
  const packed = { id: result.data.deploymentId, directory }
  if (execute('if [ -f /fixture/has-db ]; then printf yes; fi') === 'yes')
    declareDatabaseBackend(packed, 'postgresql')
  return packed
}

describe.skipIf(!enabled)('linux deployment process locks', () => {
  beforeEach(async () => {
    const candidate = (['podman', 'docker'] as const).find(command => spawnSync(command, ['version'], { timeout: 20_000, windowsHide: true, stdio: 'ignore' }).status === 0)
    if (!candidate)
      throw new Error('Deployment lock gate requires a reachable Podman or Docker engine')
    runtime = candidate
    root = mkdtempSync(join(tmpdir(), 'hai-deploy-lock-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: basename(root) }))
    const containerName = `hai-deploy-lock-${randomUUID()}`
    container = ''
    const artifacts = join(root, '.hai/build/docker/release-1')
    mkdirSync(artifacts, { recursive: true })
    mkdirSync(join(root, 'bin'))
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  .: {}\n')
    writeFileSync(join(root, '.env.test'), 'HAI_CORE_ENV=test\n')
    writeFileSync(join(root, '.hai/build/docker/latest'), 'release-1\n')
    writeFileSync(join(artifacts, 'serv-1.2.3.tar'), 'prebuilt-image')
    writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'release-1', images: [{ name: 'serv', file: 'serv-1.2.3.tar', imageRef: 'localhost/lock-test:1', sha256: createHash('sha256').update('prebuilt-image').digest('hex'), containerPort: 3000 }] }))
    writeFileSync(join(root, 'bin/docker'), `#!/bin/sh
printf '%s\\n' "$*" >> /fixture/commands.log
query_project=''
query_role=''
query_column=1
for argument in "$@"; do
  case "$argument" in
    label=*.project=*) query_project=$(printf '%s' "$argument" | sed 's/^label=[^=]*=//');;
    label=*.service=*) query_role=$(printf '%s' "$argument" | sed 's/^label=[^=]*=//');;
  esac
  case "$argument" in label=io.podman.compose.project=*) query_column=3;; esac
done
if [ -n "$query_project" ] && [ -n "$query_role" ]; then
  printf '%s' "$query_project" > /fixture/query-project
  printf '%s' "$query_role" > /fixture/query-role
  if [ -f /fixture/io-only ] && [ "$query_column" = 1 ]; then exit 0; fi
  if [ "$query_role" = db ] && [ -f /fixture/container-labels ]; then
    awk -F'|' -v project="$query_project" -v service="$query_role" -v column="$query_column" '{exit !($column==project && $(column+1)==service)}' /fixture/container-labels || exit 0
  fi
fi
case "$*" in
  *'up --help'*) printf 'never\\n';;
  'context show') if [ -f /fixture/docker-context ]; then cat /fixture/docker-context; else printf 'default\\n'; fi;;
  'info --format '*Host.ServiceIsRemote*) if [ -f /fixture/remote-podman ]; then printf 'true\\n'; else printf 'false\\n'; fi;;
  'info --format '*Host.Hostname*) printf 'fixture-host|/fixture/podman-store|overlay\\n';;
  'info --format '*) if [ -f /fixture/daemon-identity ]; then cat /fixture/daemon-identity; else printf 'fixture-daemon|/fixture/docker-store|overlay\\n'; fi;;
  'volume ls -q') if [ -f /fixture/persistent-volumes ]; then cat /fixture/persistent-volumes; fi;;
  *'inspect --format'*'.Config.Labels'*)
    if [ "$(cat /fixture/query-role)" = db ] && [ -f /fixture/container-labels ]; then cat /fixture/container-labels;
    elif [ -f /fixture/io-only ]; then printf '<no value>|<no value>|%s|%s\\n' "$(cat /fixture/query-project)" "$(cat /fixture/query-role)";
    else printf '%s|%s|%s|%s\\n' "$(cat /fixture/query-project)" "$(cat /fixture/query-role)" "$(cat /fixture/query-project)" "$(cat /fixture/query-role)"; fi;;
  *'inspect --format {{.Config.Image}} '*) if [ -f /fixture/active-image ]; then cat /fixture/active-image; else printf 'docker.io/library/postgres:16.15-alpine\\n'; fi;;
  *'inspect --format'*'.Mounts'*) if [ -f /fixture/active-mounts ]; then cat /fixture/active-mounts; elif [ -f /fixture/persistent-volumes ]; then cat /fixture/persistent-volumes; fi;;
  *'ps -aq --filter volume='*) if [ -f /fixture/orphan-volume-reference ]; then printf '0123456789ab\\n'; fi;;
  *'ps -aq'*) if [ -f /fixture/has-db ]; then printf '0123456789ab\\n'; fi;;
  'healthcheck run '*)
    if [ -f /fixture/probe-error ]; then exit 125; fi
    touch /fixture/health-probed;;
  *'inspect --format'*'State.Running'*) if [ -f /fixture/services-stopped ]; then printf 'false\\n'; else printf 'true\\n'; fi;;
  *'inspect --format'*'State.Health'*)
    if [ -f /fixture/unhealthy ]; then printf 'unhealthy\\n'; exit 0; fi
    if [ -f /fixture/manual-health ]; then
      if [ -f /fixture/health-probed ]; then printf 'healthy\\n'; else printf 'starting\\n'; fi
      exit 0
    fi
    count=0
    if [ -f /fixture/health-count ]; then count=$(cat /fixture/health-count); fi
    count=$((count + 1)); printf '%s' "$count" > /fixture/health-count
    if [ "$count" -lt 3 ]; then printf 'starting\\n'; else printf 'healthy\\n'; fi;;
  *'ps -q'*) if [ -f /fixture/services-stopped ]; then exit 0; fi; printf 'fixture-container\\n';;
  *'config --services'*)
    if [ -f /fixture/has-web ]; then printf 'serv\\nweb\\n'; else printf 'serv\\n'; fi
    if [ -f /fixture/has-db ]; then printf 'db\\n'; fi
    if [ -f /fixture/has-gateway ]; then printf 'gateway\\n'; fi
    if [ -f /fixture/invalidate-backend-snapshot ]; then printf 'invalid-snapshot\\n' > "$(cat /fixture/invalidate-backend-snapshot)"; fi;;
  *'image inspect --format'*) printf 'amd64\\n';;
esac
case " $* " in *' up -d '*) rm -f /fixture/services-stopped; printf '%s' "$*" > /fixture/active-command;; esac
if [ -f /fixture/volume-to-create ] && [ -f /fixture/has-db ]; then
  case " $* " in *' up -d '*) cp /fixture/volume-to-create /fixture/persistent-volumes;; esac
fi
if [ -f /fixture/manual-health ]; then
  # Podman Compose 按本次服务集清理孤立容器；第二批不能再移除已经就绪的依赖。
  case " $* " in *' up -d '*--remove-orphans*' serv '*) touch /fixture/dependency-removed;; esac
fi
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
    writeFileSync(join(root, 'bin/curl'), '#!/bin/sh\ntest ! -f /fixture/fail-health && test ! -f /fixture/dependency-removed\n')
    const created = execFileSync(runtime, ['run', '-d', '--name', containerName, '--entrypoint', 'node', 'docker.io/library/node:24.22.1-bookworm-slim', '-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (!/^[a-f0-9]{64}$/.test(created))
      throw new Error('Expected an owned deployment fixture container ID')
    container = created
    execFileSync(runtime, ['cp', root, `${container}:/fixture`], { windowsHide: true })
    execute('chmod 700 /fixture/bin/*; command -v flock; mkdir -p /fixture/server/.deploy-lock')
    expect(await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime: 'docker' }, expose: { hostPort: 18080 } } })).toMatchObject({ success: true })
  }, 60_000)

  it.each(['matching', 'missing', 'different', 'symlink'] as const)('真实 shell 在更新前核对自建 Storage 配置摘要：%s', async (scenario) => {
    const installed = await pack()
    declareStorageRouting(installed, 'https://files.example.com')
    expect(apply(installed).status).toBe(0)
    const candidate = await pack(['serv'])
    declareStorageRouting(candidate, scenario === 'missing' ? undefined : scenario === 'different' ? 'https://other.example.com' : 'https://files.example.com')
    if (scenario === 'symlink')
      execute(`cp /fixture/server/releases/${installed.id}/storage-routing /fixture/old-storage-routing; rm /fixture/server/releases/${installed.id}/storage-routing; ln -s /fixture/old-storage-routing /fixture/server/releases/${installed.id}/storage-routing`)
    execute(': > /fixture/commands.log')
    const outcome = apply(candidate)
    if (scenario === 'matching') {
      expect(outcome.status, outcome.stderr).toBe(0)
      expect(execute('cat /fixture/server/current')).toBe(candidate.id)
    }
    else {
      expectPreflightRefusal(candidate, outcome)
      expect(outcome.stderr).toContain(scenario === 'symlink' ? 'metadata must be a regular file' : 'Managed storage configuration changed')
      expect(execute('cat /fixture/server/current')).toBe(installed.id)
    }
  }, 30_000)

  it.each(['web', 'gateway'] as const)('真实 shell 根据 %s 代理身份刷新 DNS，健康失败后恢复旧代理', async (proxy) => {
    execute(`touch /fixture/has-${proxy}`)
    const installed = await pack()
    declareProxyIdentity(installed, proxy)
    expect(apply(installed).status).toBe(0)
    const updated = await pack(['serv'])
    declareProxyIdentity(updated, proxy)
    execute(': > /fixture/commands.log')
    expect(apply(updated).status).toBe(0)
    expect(execute('cat /fixture/commands.log')).toContain(`exec -T ${proxy} nginx -s reload`)
    const failed = await pack(['serv'])
    declareProxyIdentity(failed, proxy)
    const curl = join(root, 'proxy-rollback-curl')
    writeFileSync(curl, `#!/bin/sh\n! grep -q '/releases/${failed.id}/' /fixture/active-command\n`)
    execFileSync(runtime, ['cp', curl, `${container}:/fixture/bin/curl`], { windowsHide: true })
    execute('chmod 700 /fixture/bin/curl; printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; : > /fixture/commands.log')
    const outcome = apply(failed)
    expect(outcome.status, outcome.stderr).toBe(1)
    expect(JSON.parse(execute(`cat /fixture/server/result-${failed.id}.json`))).toMatchObject({ stage: 'health', recoveryStatus: 'passed' })
    expect(execute('cat /fixture/server/current')).toBe(updated.id)
    expect(execute('cat /fixture/commands.log').match(new RegExp(`exec -T ${proxy} nginx -s reload`, 'g'))).toHaveLength(2)
  }, 30_000)

  it.each(['matching', 'missing', 'different', 'symlink'] as const)('真实shell保持Web前缀的增量边界：%s', async (scenario) => {
    const installed = await pack()
    declareWebBase(installed, '/yyy')
    expect(apply(installed).status).toBe(0)
    const candidate = await pack(['serv'])
    if (scenario !== 'missing')
      declareWebBase(candidate, scenario === 'different' ? '/other' : '/yyy')
    if (scenario === 'symlink')
      execute(`printf '%s\\n' '/yyy' > /fixture/old-web-prefix; rm /fixture/server/releases/${installed.id}/web-base-path; ln -s /fixture/old-web-prefix /fixture/server/releases/${installed.id}/web-base-path`)
    execute(': > /fixture/commands.log')
    const outcome = apply(candidate)
    if (scenario === 'matching') {
      expect(outcome.status, outcome.stderr).toBe(0)
      expect(execute('cat /fixture/server/current')).toBe(candidate.id)
    }
    else {
      expectPreflightRefusal(candidate, outcome)
      expect(execute('cat /fixture/server/current')).toBe(installed.id)
      expect(outcome.stderr).toContain(scenario === 'symlink' ? 'metadata must be a regular file' : 'Web base path changed')
    }
  }, 30_000)

  it.each([false, true])('失败回滚验证旧端口与 HTTP，并保留真实恢复状态（恢复失败：%s）', async (recoveryFails) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep')
    const full = await pack()
    expect(apply(full).status).toBe(0)
    const curl = join(root, 'rollback-curl')
    writeFileSync(curl, `#!/bin/sh
printf '%s\\n' "$*" >> /fixture/http-requests
test ! -f /fixture/fail-health && exit 0
${recoveryFails ? 'exit 22' : `grep -q '/releases/${full.id}/' /fixture/active-command`}
`)
    execFileSync(runtime, ['cp', curl, `${container}:/fixture/bin/curl`], { windowsHide: true })
    execute('chmod 700 /fixture/bin/curl; touch /fixture/fail-health')
    await deploy.close()
    expect(await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime: 'docker' }, expose: { hostPort: 18081 } } })).toMatchObject({ success: true })
    const failed = await pack()
    const applied = apply(failed)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(1)
    expect(execute('cat /fixture/server/current')).toBe(full.id)
    expect(JSON.parse(execute(`cat /fixture/server/result-${failed.id}.json`))).toMatchObject({ stage: 'health', exitCode: 1, recoveryStatus: recoveryFails ? 'failed' : 'passed' })
    const requests = execute('cat /fixture/http-requests')
    expect(requests).toContain('http://127.0.0.1:18081/health')
    expect(requests).toContain('http://127.0.0.1:18080/health')
    expect(applied.stderr).toContain(recoveryFails ? 'Recovery failed' : 'Previous release passed recovery health checks')
  }, 60_000)

  it('独立请求策略的真实 Linux 全量、增量、篡改拦截和失败恢复保留对应快照', async () => {
    mkdirSync(join(root, 'config/security'), { recursive: true })
    writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  access: {file: ./config/security/request-access.yml}\n')
    const policy = join(root, 'config/security/request-access.yml')
    const writePolicy = (ip: string) => writeFileSync(policy, `global:\n  allowIps: [${ip}]\n`)
    const artifacts = join(root, '.hai/build/docker/release-1')
    const manifestFile = join(artifacts, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    const webFile = 'web-1.2.3.tar'
    writeFileSync(join(artifacts, webFile), 'prebuilt-web')
    manifest.images.push({ name: 'web', file: webFile, imageRef: 'localhost/policy-web:1', sha256: createHash('sha256').update('prebuilt-web').digest('hex'), containerPort: 8080 })
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, hasWeb: true }))
    execute('touch /fixture/has-web; printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep')
    writePolicy('192.0.2.10')
    const full = await pack()
    expect(apply(full).status).toBe(0)
    const snapshot = (id: string) => execute(`cat /fixture/server/releases/${id}/request-access.yml`)
    expect(snapshot(full.id)).toContain('192.0.2.10')
    expect(execute(`stat -c %a /fixture/server/releases/${full.id}/request-access.yml`)).toBe('444')
    const fullEntry = JSON.parse(execute(`cat /fixture/server/releases/${full.id}/compose.json`))
    expect(fullEntry.services.serv.volumes).toContainEqual(expect.stringContaining(`../${full.id}/request-access.yml:/run/hai/request-access.yml:ro`))

    // 未选后端时不读取本地失效文件，保留旧服务定义中的只读策略挂载。
    writeFileSync(policy, 'invalid-field: private-value\n')
    const web = await pack(['web'])
    expect(apply(web).status).toBe(0)
    expect(execute(`test ! -e /fixture/server/releases/${web.id}/request-access.yml && printf absent`)).toBe('absent')
    expect(execute(`cat /fixture/server/releases/${web.id}/compose-files`)).toContain(`/releases/${full.id}/compose-entry.json`)
    expect(snapshot(full.id)).toContain('192.0.2.10')

    writePolicy('198.51.100.20')
    const incremental = await pack(['serv'])
    expect(apply(incremental).status).toBe(0)
    expect(snapshot(incremental.id)).toContain('198.51.100.20')
    expect(snapshot(full.id)).toContain('192.0.2.10')
    const runtimeSettings = JSON.parse(parseEnv(execute(`cat /fixture/server/releases/${incremental.id}/.env.runtime`)).HAI_SERV!)
    expect(runtimeSettings.http.access).toEqual({ file: '/run/hai/request-access.yml' })

    const tampered = await pack(['serv'])
    execute(`printf 'rules: []\\n' > /fixture/${tampered.directory}/request-access.yml; : > /fixture/commands.log`)
    const refused = apply(tampered)
    expectPreflightRefusal(tampered, refused)
    expect(execute('cat /fixture/server/current')).toBe(incremental.id)

    writePolicy('203.0.113.30')
    const failed = await pack(['serv'])
    const curl = join(root, 'policy-recovery-curl')
    writeFileSync(curl, `#!/bin/sh\ntest ! -f /fixture/fail-health && exit 0\n! grep -q '/releases/${failed.id}/' /fixture/active-command\n`)
    execFileSync(runtime, ['cp', curl, `${container}:/fixture/bin/curl`], { windowsHide: true })
    execute('chmod 700 /fixture/bin/curl; touch /fixture/fail-health')
    const recovered = apply(failed)
    expect(recovered.status, `${recovered.stdout}\n${recovered.stderr}`).toBe(1)
    expect(JSON.parse(execute(`cat /fixture/server/result-${failed.id}.json`))).toMatchObject({ stage: 'health', exitCode: 1, recoveryStatus: 'passed' })
    expect(execute('cat /fixture/server/current')).toBe(incremental.id)
    expect(snapshot(incremental.id)).toContain('198.51.100.20')
    expect(snapshot(failed.id)).toContain('203.0.113.30')
    expect(execute('cat /fixture/active-command')).not.toContain(`/releases/${failed.id}/`)
    if (process.env.HAI_AUTH_EVIDENCE_DIR) {
      mkdirSync(process.env.HAI_AUTH_EVIDENCE_DIR, { recursive: true })
      writeFileSync(join(process.env.HAI_AUTH_EVIDENCE_DIR, 'request-access-policy-recovery.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), fixture: 'Original apply.sh in Linux; deterministic Compose and HTTP failure injection', full: 'passed', frontendOnly: 'backend policy retained', backendIncrement: 'new snapshot selected', fileMode: '444', mount: '/run/hai/request-access.yml:ro', tampered: { stage: 'preflight', startedServices: false }, failedUpdate: { stage: 'health', recoveryStatus: 'passed', current: incremental.id, policyIp: '198.51.100.20' } }, null, 2))
    }
  }, 60_000)

  it('成功发布后使用旧制品重新创建全量交付包，生成新 ID 并验证旧镜像恢复', async () => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep')
    const artifacts = join(root, '.hai/build/docker/release-1')
    const manifestFile = join(artifacts, 'manifest.json')
    const previousManifest = readFileSync(manifestFile, 'utf8')
    const first = await pack()
    expect(apply(first).status).toBe(0)
    const nextManifest = JSON.parse(previousManifest)
    const nextContent = 'next-release-image'
    writeFileSync(join(artifacts, nextManifest.images[0].file), nextContent)
    nextManifest.buildId = 'release-2'
    nextManifest.images[0].imageRef = 'localhost/lock-test:2'
    nextManifest.images[0].sha256 = createHash('sha256').update(nextContent).digest('hex')
    writeFileSync(manifestFile, JSON.stringify(nextManifest))
    const second = await pack()
    expect(apply(second).status).toBe(0)
    writeFileSync(join(artifacts, 'serv-1.2.3.tar'), 'prebuilt-image')
    writeFileSync(manifestFile, previousManifest)
    const rollback = await pack()
    expect(new Set([first.id, second.id, rollback.id]).size).toBe(3)
    expect(apply(rollback).status).toBe(0)
    expect(execute('cat /fixture/server/current')).toBe(rollback.id)
    const restoredCompose = JSON.parse(execute(`cat /fixture/server/releases/${rollback.id}/compose.json`))
    expect(restoredCompose.services.serv.image).toBe('localhost/lock-test:1')
    expect(JSON.parse(execute(`cat /fixture/server/result-${rollback.id}.json`))).toMatchObject({ stage: 'complete', exitCode: 0 })
    expect(execute('cat /fixture/commands.log')).not.toMatch(/\bdown\b|\bpull\s+(?!never)/)
  }, 60_000)

  it.each([false, true])('真实 shell 拒绝复用持久卷切换数据库后端（增量：%s）', async (partial) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const full = await pack()
    expect(apply(full).status).toBe(0)
    execute(`printf 'db postgresql\\n' > /fixture/server/releases/${full.id}/state-backends`)
    const candidate = await pack(partial ? ['serv'] : undefined)
    declareDatabaseBackend(candidate, 'mysql')
    execute(': > /fixture/commands.log')
    const result = apply(candidate)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1)
    expect(result.stderr).toContain('Persistent backend db changed')
    expect(execute('cat /fixture/server/current')).toBe(full.id)
    expect(execute('cat /fixture/commands.log')).not.toMatch(/load -i|rm -f| up -d /)
  }, 60_000)

  it.each(['postgresql', 'mysql'] as const)('全量暂时移除 db 保留卷后，重新加入 %s 仍核对原卷引擎', async (backend) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    const volume = declareDatabaseBackend(first, 'postgresql')
    expect(apply(first).status).toBe(0)
    expect(execute('cat /fixture/persistent-volumes')).toBe(volume)
    execute('rm /fixture/has-db')
    const withoutDatabase = await pack()
    expect(apply(withoutDatabase).status).toBe(0)
    expect(execute(`cat /fixture/server/releases/${withoutDatabase.id}/services`)).not.toMatch(/^db$/m)
    expect(execute('cat /fixture/persistent-volumes')).toBe(volume)
    execute('touch /fixture/has-db')
    const next = await pack()
    expect(declareDatabaseBackend(next, backend)).toBe(volume)
    execute(': > /fixture/commands.log')
    const applied = apply(next)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(backend === 'postgresql' ? 0 : 1)
    if (backend === 'mysql') {
      expect(applied.stderr).toMatch(/backend.*changed|incompatible backend/i)
      expect(execute('cat /fixture/server/current')).toBe(withoutDatabase.id)
      expect(execute('cat /fixture/commands.log')).not.toMatch(/load -i|rm -f| up -d /)
    }
  }, 60_000)

  it.each([true, false])('首次失败后无成功 current 时，按真实卷存在状态保护引擎绑定（卷存在：%s）', async (volumeExists) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db /fixture/fail-health')
    const failed = await pack()
    const volume = declareDatabaseBackend(failed, 'postgresql')
    expect(apply(failed).status).toBe(1)
    expect(execute('test ! -f /fixture/server/current && echo no-current')).toBe('no-current')
    expect(execute('cat /fixture/persistent-volumes')).toBe(volume)
    execute('rm /fixture/fail-health')
    if (!volumeExists)
      execute('rm /fixture/persistent-volumes')
    const retry = await pack()
    expect(declareDatabaseBackend(retry, 'mysql')).toBe(volume)
    execute(': > /fixture/commands.log')
    const applied = apply(retry)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(volumeExists ? 1 : 0)
    if (volumeExists) {
      expect(applied.stderr).toMatch(/backend.*changed|incompatible backend/i)
      expect(execute('cat /fixture/commands.log')).not.toMatch(/load -i|rm -f| up -d /)
    }
  }, 60_000)

  it('重复应用已使用部署 ID 在预检停止，不执行历史记录的镜像恢复', async () => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep')
    const full = await pack()
    expect(apply(full).status).toBe(0)
    const originalResult = execute(`cat /fixture/server/result-${full.id}.json`)
    const originalSteps = execute(`cat /fixture/server/steps-${full.id}.jsonl`)
    execute(`printf 'previous-image localhost/previous-release:1\\n' > /fixture/server/releases/${full.id}/rollback-images; : > /fixture/commands.log`)
    const replay = apply(full)
    expect(replay.status).toBe(1)
    expect(replay.stderr).toContain('already used')
    expect(execute('cat /fixture/server/current')).toBe(full.id)
    expect(execute(`cat /fixture/server/result-${full.id}.json`)).toBe(originalResult)
    expect(execute(`cat /fixture/server/steps-${full.id}.jsonl`)).toBe(originalSteps)
    expect(execute('cat /fixture/commands.log')).not.toMatch(/tag |load -i|rm -f| up -d /)
  }, 60_000)

  it('持久账本拒绝活动基线卷缺失，避免普通发布创建空库', async () => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    expect(apply(first).status).toBe(0)
    execute('rm /fixture/persistent-volumes')
    const next = await pack()
    execute(': > /fixture/commands.log')
    expectPreflightRefusal(next, apply(next))
    expect(execute('cat /fixture/server/current')).toBe(first.id)
  }, 60_000)

  it.each(['runtime', 'daemon'] as const)('持久账本拒绝更换已绑定的 %s', async (identity) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    expect(apply(first).status).toBe(0)
    if (identity === 'runtime') {
      execute('cp /fixture/bin/docker /fixture/bin/podman')
      await deploy.close()
      expect(await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime: 'podman' }, expose: { hostPort: 18080 } } })).toMatchObject({ success: true })
    }
    else {
      execute('printf \'different-daemon|/fixture/docker-store|overlay\\n\' > /fixture/daemon-identity')
    }
    const next = await pack()
    execute(': > /fixture/commands.log')
    expectPreflightRefusal(next, apply(next))
    expect(execute('cat /fixture/server/current')).toBe(first.id)
  }, 60_000)

  it.each(['remote-podman', 'docker-context'] as const)('持久账本在首次发布前拒绝非默认本地引擎：%s', async (endpoint) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    if (endpoint === 'remote-podman') {
      execute('cp /fixture/bin/docker /fixture/bin/podman; touch /fixture/remote-podman')
      await deploy.close()
      expect(await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime: 'podman' }, expose: { hostPort: 18080 } } })).toMatchObject({ success: true })
    }
    else {
      execute('printf \'other-context\\n\' > /fixture/docker-context')
    }
    const first = await pack()
    execute(': > /fixture/commands.log')
    expectPreflightRefusal(first, apply(first))
    expect(execute('test ! -e /fixture/server/current && echo no-current')).toBe('no-current')
  }, 60_000)

  it.each(['matching', 'different-mount', 'different-image', 'removed'] as const)('持久账本处理无账本旧发布时必须证明实际卷与引擎：%s', async (legacy) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    const volume = declareDatabaseBackend(first, 'postgresql')
    expect(apply(first).status).toBe(0)
    if (legacy !== 'removed')
      execute(`printf 'db postgresql\\n' > /fixture/server/releases/${first.id}/state-backends`)
    let previous = first.id
    if (legacy === 'removed') {
      execute('rm /fixture/has-db')
      const withoutDatabase = await pack()
      expect(apply(withoutDatabase).status).toBe(0)
      previous = withoutDatabase.id
      execute('touch /fixture/has-db')
    }
    execute('rm /fixture/server/persistent-backends')
    if (legacy === 'different-mount')
      execute(`printf '${volume}-other\\n' >> /fixture/persistent-volumes; printf '${volume}-other\\n' > /fixture/active-mounts`)
    if (legacy === 'different-image')
      execute('printf \'docker.io/library/mysql:8.4\\n\' > /fixture/active-image')
    const next = await pack()
    execute(': > /fixture/commands.log')
    const applied = apply(next)
    if (legacy === 'matching') {
      expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0)
      expect(execute('cat /fixture/server/current')).toBe(next.id)
      expect(execute('test -f /fixture/server/persistent-backends && echo recorded')).toBe('recorded')
    }
    else {
      expectPreflightRefusal(next, applied)
      expect(execute('cat /fixture/server/current')).toBe(previous)
      expect(execute('test ! -e /fixture/server/persistent-backends && echo untouched')).toBe('untouched')
    }
  }, 60_000)

  it.each(['matching', 'io-only', 'wrong-project', 'wrong-volume', 'wrong-image', 'stopped', 'conflicting-labels'] as const)('受控导入无 current 时用实际运行原容器补证首次全量：%s', async (scenario) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const full = await pack()
    const volume = declareDatabaseBackend(full, 'postgresql')
    execute(`printf '${volume}\\n' > /fixture/persistent-volumes`)
    const project = seedImportedDatabase(full, scenario === 'wrong-volume' ? `${volume}-other` : volume, scenario === 'wrong-project' ? 'hai-other' : undefined)
    if (scenario === 'io-only')
      execute(`printf '<no value>|<no value>|${project}|db\\n' > /fixture/container-labels; touch /fixture/io-only`)
    if (scenario === 'conflicting-labels')
      execute(`printf '${project}|db|hai-other|db\\n' > /fixture/container-labels`)
    if (scenario === 'wrong-image')
      execute('printf \'docker.io/library/mysql:8.4\\n\' > /fixture/active-image')
    if (scenario === 'stopped')
      execute('touch /fixture/services-stopped')
    execute(': > /fixture/commands.log')
    const outcome = apply(full)
    if (scenario === 'matching' || scenario === 'io-only') {
      expect(outcome.status, `${outcome.stdout}\n${outcome.stderr}`).toBe(0)
      expect(execute('cat /fixture/server/current')).toBe(full.id)
      expect(execute('cat /fixture/server/persistent-backends')).toContain(`db postgresql ${volume}`)
      if (scenario === 'io-only') {
        // 后续增量的原容器也必须被定位并移除，不能只让导入预检支持原生标签。
        const incremental = await pack(['serv'])
        execute(': > /fixture/commands.log')
        const updated = apply(incremental)
        expect(updated.status, `${updated.stdout}\n${updated.stderr}`).toBe(0)
        expect(execute('cat /fixture/server/current')).toBe(incremental.id)
        expect(execute('cat /fixture/commands.log')).toContain('rm -f 0123456789ab')
      }
    }
    else {
      expectPreflightRefusal(full, outcome)
      expect(execute('test ! -e /fixture/server/current && test ! -e /fixture/server/persistent-backends && echo untouched')).toBe('untouched')
    }
  }, 60_000)

  it.each(['backend', 'daemon'] as const)('受控导入不能覆盖已存在账本的 %s 冲突', async (conflict) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    const volume = declareDatabaseBackend(first, 'postgresql')
    expect(apply(first).status).toBe(0)
    const ledger = execute('cat /fixture/server/persistent-backends')
    const next = await pack()
    seedImportedDatabase(next, volume)
    if (conflict === 'backend')
      declareDatabaseBackend(next, 'mysql')
    else
      execute('printf \'different-daemon|/fixture/docker-store|overlay\\n\' > /fixture/daemon-identity')
    execute(': > /fixture/commands.log')
    expectPreflightRefusal(next, apply(next))
    expect(execute('cat /fixture/server/current')).toBe(first.id)
    expect(execute('cat /fixture/server/persistent-backends')).toBe(ledger)
  }, 60_000)
  it.each(['symlink', 'duplicate-volume', 'stale-next'] as const)('持久账本拒绝不可信状态文件且不覆盖目标：%s', async (invalid) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    const volume = declareDatabaseBackend(first, 'postgresql')
    expect(apply(first).status).toBe(0)
    execute('printf \'retain-sentinel-data\\n\' > /fixture/sentinel')
    if (invalid === 'symlink')
      execute('rm /fixture/server/persistent-backends; ln -s /fixture/sentinel /fixture/server/persistent-backends')
    else if (invalid === 'duplicate-volume')
      execute(`printf 'db postgresql ${volume}\\n' >> /fixture/server/persistent-backends`)
    else
      execute('ln -s /fixture/sentinel /fixture/server/persistent-backends.next')
    const next = await pack()
    execute(': > /fixture/commands.log')
    expectPreflightRefusal(next, apply(next))
    expect(execute('cat /fixture/server/current')).toBe(first.id)
    expect(execute('cat /fixture/sentinel')).toBe('retain-sentinel-data')
  }, 60_000)

  it.each(['missing-volume', 'invalid-snapshot'] as const)('持久账本在失败恢复时重新校验旧状态并短路容器变更：%s', async (fault) => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    expect(apply(first).status).toBe(0)
    const ledger = execute('cat /fixture/server/persistent-backends')
    const next = await pack()
    const curl = join(root, 'guard-recovery-curl')
    const operation = fault === 'missing-volume'
      ? 'rm /fixture/persistent-volumes'
      : `printf 'invalid-snapshot\\n' > /fixture/server/releases/${next.id}/previous-state-backends`
    writeFileSync(curl, `#!/bin/sh\nif [ ! -f /fixture/backend-fault-applied ]; then\n  touch /fixture/backend-fault-applied\n  : > /fixture/commands.log\n  ${operation}\nfi\nexit 22\n`)
    execFileSync(runtime, ['cp', curl, `${container}:/fixture/bin/curl`], { windowsHide: true })
    execute('chmod 700 /fixture/bin/curl')
    const applied = apply(next)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(1)
    expect(JSON.parse(execute(`cat /fixture/server/result-${next.id}.json`))).toMatchObject({ stage: 'health', exitCode: 1, recoveryStatus: 'failed' })
    expect(execute('cat /fixture/server/current')).toBe(first.id)
    expect(execute('cat /fixture/server/persistent-backends')).toBe(ledger)
    expect(execute('cat /fixture/commands.log')).not.toMatch(/rm -f| up -d /)
  }, 60_000)

  it('持久账本在增量提前恢复旧拓扑时先验证快照，失败不加载或启动服务', async () => {
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/has-db')
    const first = await pack()
    expect(apply(first).status).toBe(0)
    const ledger = execute('cat /fixture/server/persistent-backends')
    const next = await pack(['serv'])
    execute(`touch /fixture/services-stopped; printf '/fixture/server/releases/${next.id}/previous-state-backends' > /fixture/invalidate-backend-snapshot; : > /fixture/commands.log`)
    const applied = apply(next)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(1)
    expect(JSON.parse(execute(`cat /fixture/server/result-${next.id}.json`))).toMatchObject({ stage: 'recover', exitCode: 1, recoveryStatus: 'not-needed' })
    expect(execute('cat /fixture/server/current')).toBe(first.id)
    expect(execute('cat /fixture/server/persistent-backends')).toBe(ledger)
    expect(execute('cat /fixture/commands.log')).not.toMatch(/load -i|rm -f| up -d /)
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

  it('真实 Linux 增量仅继承旧基线的框架变量，不重新注入镜像原生变量', async () => {
    const full = await pack()
    expect(apply(full).status).toBe(0)
    const database = JSON.stringify({ type: 'postgresql', password: 'retained-fixture-password' })
    const legacyContent = `HAI_DB='${database}'\nPOSTGRES_USER=hai\nPOSTGRES_PASSWORD=legacy-native-password\nRUSTFS_ADDRESS=0.0.0.0:9000\n`
    const legacyFile = join(root, 'legacy-middleware.env')
    writeFileSync(legacyFile, legacyContent)
    execFileSync(runtime, ['cp', legacyFile, `${container}:/fixture/server/releases/${full.id}/middleware.env`], { windowsHide: true })
    const incremental = await pack(['serv'])
    const applied = apply(incremental)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0)
    const inherited = parseEnv(execute(`cat /fixture/server/releases/${incremental.id}/middleware.env`))
    expect(inherited).toEqual({ HAI_DB: database })
    expect(execute(`cat /fixture/server/releases/${full.id}/middleware.env`)).toBe(legacyContent.trim())
  }, 60_000)

  it.each([{ selected: ['serv'] }, { selected: ['serv', 'web'] }, { selected: ['web', 'serv'] }])('真实 Linux 执行 $selected 增量容量更新并恢复失败配置', async ({ selected }) => {
    const artifacts = join(root, '.hai/build/docker/release-1')
    mkdirSync(join(root, 'config'))
    writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 1048576\n')
    const images = ['serv', 'web'].map((name) => {
      const file = `${name}-1.2.3.tar`
      const content = `prebuilt-${name}`
      writeFileSync(join(artifacts, file), content)
      return { name, file, imageRef: `localhost/capacity-${name}:1`, sha256: createHash('sha256').update(content).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
    })
    writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'release-1', hasWeb: true, images }))
    execute('touch /fixture/has-web')
    const full = await pack()
    expect(apply(full).status).toBe(0)
    writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 8388608\n')
    const incremental = await pack(selected)
    execute(': > /fixture/commands.log')
    const applied = apply(incremental)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0)
    expect(execute(`cat /fixture/server/releases/${incremental.id}/web.conf`)).toContain('client_max_body_size 16809984;')
    const composeFiles = execute(`cat /fixture/server/releases/${incremental.id}/compose-files`)
    expect(composeFiles.includes('proxy-entry.json')).toBe(!selected.includes('web'))
    expect(execute('cat /fixture/commands.log')).toContain('--no-recreate serv web')
    const commands = execute('cat /fixture/commands.log')
    // 镜像直接从本次解包目录加载；发布快照只保留运行配置，不再复制归档。
    expect(commands.includes(`load -i /fixture/${incremental.directory}/images/web-`)).toBe(selected.includes('web'))
    expect(execute(`test ! -e /fixture/server/releases/${incremental.id}/images && printf absent`)).toBe('absent')
    writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 4194304\n')
    const failed = await pack(['serv'])
    execute('touch /fixture/fail-health; printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep')
    expect(apply(failed).status).toBe(1)
    expect(execute('cat /fixture/server/current')).toBe(incremental.id)
    expect(execute(`cat /fixture/server/releases/${incremental.id}/web.conf`)).toContain('client_max_body_size 16809984;')
    expect(execute('cat /fixture/commands.log')).toContain(`/releases/${incremental.id}/compose-entry.json`)
  }, 60_000)

  it.each(['docker', 'podman'] as const)('真实 shell 在 %s 中等待中间件健康后才启动 serv，不健康时不启动 serv', async (remoteRuntime) => {
    execute('touch /fixture/has-db')
    if (remoteRuntime === 'podman') {
      // 模拟没有 systemd 自动调度的独立 Podman；只有实际执行探测才会更新状态。
      execute('ln -s /fixture/bin/docker /fixture/bin/podman; touch /fixture/manual-health; printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep')
    }
    const password = 'Fixture-administrator-Aa1!'
    writeFileSync(join(root, '.env.test'), `HAI_ADMIN_DEFAULT_PASSWORD=${password}\n`)
    async function readinessBundle(selectedServices?: string[]) {
      const bundle = await pack(selectedServices)
      const file = join(root, 'readiness.sh')
      writeFileSync(file, createApplyScript({ deploymentId: bundle.id, projectName: 'readiness-test', environment: 'test', directory: '/fixture/server', runtime: remoteRuntime, partial: !!selectedServices, selected: selectedServices ?? ['serv', 'db'], hostPort: 18080, healthPaths: ['/health'] }))
      execFileSync(runtime, ['cp', file, `${container}:/fixture/${bundle.directory}/apply.sh`], { windowsHide: true })
      execute(`cd /fixture/${bundle.directory}; sed '/  apply.sh$/d' SHA256SUMS > SHA256SUMS.next; sha256sum apply.sh >> SHA256SUMS.next; mv SHA256SUMS.next SHA256SUMS`)
      return bundle
    }
    const full = await readinessBundle()
    const applied = apply(full)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0)
    expect(applied.stdout).toContain(`/releases/${full.id}/.env.runtime`)
    expect(applied.stdout).toContain('HAI_ADMIN_DEFAULT_PASSWORD')
    expect(applied.stdout).not.toContain(password)
    const commands = execute('cat /fixture/commands.log')
    const applicationStart = / up -d [^\n]* serv(?: |$)/m
    const applicationCommand = commands.match(applicationStart)?.[0] ?? ''
    expect(applicationCommand).toBeTruthy()
    expect(applicationCommand).not.toContain('--remove-orphans')
    if (remoteRuntime === 'podman')
      expect(commands).toContain('healthcheck run fixture-container')
    else
      expect(Number(execute('cat /fixture/health-count'))).toBeGreaterThanOrEqual(3)
    expect(commands.indexOf('--remove-orphans db')).toBeLessThan(commands.lastIndexOf('State.Health'))
    expect(commands.lastIndexOf('State.Health')).toBeLessThan(commands.indexOf(applicationCommand))
    const failed = await readinessBundle()
    execute('touch /fixture/unhealthy; : > /fixture/commands.log')
    expect(apply(failed).status).toBe(1)
    expect(execute('cat /fixture/commands.log')).not.toMatch(applicationStart)
    expect(execute('cat /fixture/server/current')).toBe(full.id)
    if (remoteRuntime === 'podman') {
      // 未选依赖保留旧 healthy 状态，当前探测故障时仍不能更新 serv。
      execute('rm -f /fixture/unhealthy; touch /fixture/probe-error; : > /fixture/commands.log')
      const brokenProbe = await readinessBundle(['serv'])
      expect(apply(brokenProbe).status).toBe(1)
      expect(execute('cat /fixture/commands.log')).not.toMatch(applicationStart)
      expect(execute('cat /fixture/server/current')).toBe(full.id)
    }
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
    const firstPartial = await pack(['serv'])
    expect(apply(firstPartial).status).toBe(1)
    const full = await pack()
    expect(apply(full).status).toBe(0)
    const partial = await pack(['serv'])
    expect(apply(partial).status).toBe(0)
    const failed = await pack(['serv'])
    // 将健康轮询的等待缩短，不替换 flock 或进程行为。
    execute('printf "#!/bin/sh\\nexit 0\\n" > /fixture/bin/sleep; chmod 700 /fixture/bin/sleep; touch /fixture/fail-health')
    expect(apply(failed).status).toBe(1)
    expect(execute('cat /fixture/server/current')).toBe(partial.id)
    expect(JSON.parse(execute(`cat /fixture/server/result-${failed.id}.json`))).toMatchObject({ stage: 'health', exitCode: 1 })
    expect(execute(`test -f /fixture/server/diagnostics-${failed.id}.log && echo retained`)).toBe('retained')
  }, 60_000)

  it('compose down 后增量更新先恢复旧基线，再检查未选服务', async () => {
    const artifacts = join(root, '.hai/build/docker/release-1')
    mkdirSync(join(root, 'config'))
    writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 1048576\n')
    const images = ['serv', 'web'].map((name) => {
      const file = `${name}-1.2.3.tar`
      const content = `prebuilt-${name}`
      writeFileSync(join(artifacts, file), content)
      return { name, file, imageRef: `localhost/recovery-${name}:1`, sha256: createHash('sha256').update(content).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
    })
    writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'release-1', hasWeb: true, images }))
    execute('touch /fixture/has-web')
    const full = await pack()
    expect(apply(full).status).toBe(0)
    execute('touch /fixture/services-stopped; : > /fixture/commands.log')
    const incremental = await pack(['web'])
    const applied = apply(incremental)
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0)
    expect(applied.stdout).toContain('[recover] Starting stopped services')
    expect(applied.stdout.indexOf('[recover]')).toBeLessThan(applied.stdout.indexOf('[dependencies]'))
    expect(execute('cat /fixture/commands.log')).toContain('--no-recreate serv web')
    expect(execute('cat /fixture/server/current')).toBe(incremental.id)
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
