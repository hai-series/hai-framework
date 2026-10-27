// 仅仓库端到端测试复用同一拥有权原语；发布包不导入 CLI 测试文件。
import type { DeployFixtureCleanupFailure, DeployTestFixture } from '../../cli/tests/helpers/deploy-container-fixture.js'
/** 真实 Linux 进程组、OpenSSH 断线继续执行与终态核对；公开 deploy API 消费真实包。 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDeployFixtureCleanupReport, createDeployTestFixture, ensureDeployTestBaseImage, executeDeployTestFixture, removeDeployTestFixture } from '../../cli/tests/helpers/deploy-container-fixture.js'
import { createUploadScripts } from '../src/container/deploy-scripts.js'
import * as sshModule from '../src/container/deploy-ssh.js'
import { createDeploymentPlan, deploy, getDeployCommandState } from '../src/index.js'

const enabled = process.env.HAI_DEPLOY_E2E === '1'
let runtime: 'podman' | 'docker'
let root: string
let container: string
let fixtureContext: DeployTestFixture | undefined
const runId = randomUUID().replaceAll('-', '')
const sshPassword = ` 0019 中 "$value" ${runId} `
let sshPort: number
let releaseOutput: () => void = () => {}
const repository = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))

/** 测试只操作自己创建的 Linux 容器。 */
function execute(script: string): string {
  return execFileSync(runtime, ['exec', container, 'sh', '-c', script], { encoding: 'utf8', timeout: 20_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** 复制 core 的真实可移植运行依赖，不使用 Windows 二进制或另写进程控制替身。 */
function copyDependency(name: string, from: string, copied: Set<string>): void {
  if (copied.has(name))
    return
  const require = createRequire(path.join(from, 'package.json'))
  let directory = path.dirname(require.resolve(name))
  while (true) {
    const file = path.join(directory, 'package.json')
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).name === name)
      break
    const parent = path.dirname(directory)
    if (parent === directory)
      throw new Error(`Cannot find runtime package ${name}`)
    directory = parent
  }
  copied.add(name)
  const manifest: { dependencies?: Record<string, string>, optionalDependencies?: Record<string, string> } = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
  cpSync(directory, path.join(root, 'node_modules', name), { recursive: true, dereference: true, filter: file => !['node_modules', 'src', 'tests', 'tmp', '.turbo'].includes(path.basename(file)) })
  for (const dependency of Object.keys(manifest.dependencies ?? {}))
    copyDependency(dependency, directory, copied)
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    try {
      copyDependency(dependency, directory, copied)
    }
    catch {
      // 真正可选的 logger adapter 未安装时沿用 core 的可选加载契约。
    }
  }
}

/** 最小预构建制品由公开 deploy API 校验、打包和上传，不提供构建器替身。 */
function application(name: string, projectName = name): string {
  const app = path.join(root, name)
  const artifacts = path.join(app, '.hai/build/docker/release-1')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: projectName }))
  writeFileSync(path.join(app, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  .: {}\n')
  writeFileSync(path.join(app, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(path.join(app, '.hai/build/docker/latest'), 'release-1\n')
  writeFileSync(path.join(artifacts, 'serv-1.2.3.tar'), 'prebuilt-image')
  writeFileSync(path.join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'release-1', images: [{ name: 'serv', file: 'serv-1.2.3.tar', imageRef: 'localhost/command-test:1', sha256: createHash('sha256').update('prebuilt-image').digest('hex'), containerPort: 3000 }] }))
  return app
}

describe.skipIf(!enabled)('linux process groups and real ssh execution', () => {
  beforeAll(async () => {
    // 全部准备在 180s deadline 内，给 300s hook 保留回收和核验余量。
    const deadline = Date.now() + 180_000
    const setupSignal = AbortSignal.timeout(180_000)
    const remaining = (limit: number): number => {
      const budget = deadline - Date.now()
      if (budget <= 0)
        throw new Error('Command runtime setup deadline exceeded')
      return Math.min(limit, budget)
    }
    const selected = (['podman', 'docker'] as const).find(command => spawnSync(command, ['version'], { windowsHide: true, stdio: 'ignore', timeout: 15_000 }).status === 0)
    if (!selected)
      throw new Error('Command runtime gate requires a reachable Podman or Docker engine')
    runtime = selected
    root = mkdtempSync(path.join(tmpdir(), 'hai-command-runtime-'))
    const key = path.join(root, 'key')
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], { windowsHide: true, timeout: remaining(10_000), stdio: 'ignore' })
    ensureDeployTestBaseImage(runtime, 'docker.io/library/node:24.22.1-bookworm-slim', remaining(180_000), process.env.HAI_DEPLOY_E2E_MIRROR)
    const mirror = process.env.HAI_DEPLOY_E2E_APT_MIRROR
    if (mirror && !/^[a-z0-9.-]+$/i.test(mirror))
      throw new Error('Expected an APT mirror hostname')
    const mirrorCommand = mirror ? `sed -i 's#deb.debian.org#${mirror}#g' /etc/apt/sources.list.d/debian.sources && ` : ''
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
    copyDependency('@h-ai/core', path.join(repository, 'packages/deploy'), new Set())
    const source = path.join(repository, 'packages/deploy/src/container/deploy-command.ts').replaceAll('\\', '/')
    const recovery = path.join(repository, 'packages/deploy/src/deploy-recovery.ts').replaceAll('\\', '/')
    const sshSource = path.join(repository, 'packages/deploy/src/container/deploy-ssh.ts').replaceAll('\\', '/')
    writeFileSync(path.join(root, 'linux-password.ts'), `import {createSshExecutor} from ${JSON.stringify(sshSource)}; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os';
const password=JSON.parse(fs.readFileSync(0,'utf8')).password;
const before=fs.readdirSync(os.tmpdir()).filter(file=>file.startsWith('hai-ssh-askpass-')).sort();
const config={host:'127.0.0.1',port:22,username:'root',auth:'password',password,knownHostsFile:'/fixture/linux-sdk-known-hosts',strictHostKeyChecking:true,connectTimeoutSeconds:5};
const ssh=createSshExecutor(config); const connected=await ssh.exec('printf linux-password-connected',{timeoutMs:10000}); assert.equal(connected.success,true); assert.equal(connected.data.stdout,'linux-password-connected');
fs.writeFileSync('/fixture/linux-sdk-upload.txt','sdk-upload'); assert.equal((await ssh.upload('/fixture/linux-sdk-upload.txt','/fixture/linux-sdk-uploaded.txt')).success,true); assert.equal(fs.readFileSync('/fixture/linux-sdk-uploaded.txt','utf8'),'sdk-upload');
const wrong=await createSshExecutor({...config,password:password+'wrong'}).exec('true',{timeoutMs:10000}); assert.equal(wrong.success,false); assert.ok(!JSON.stringify(wrong).includes(password));
assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(file=>file.startsWith('hai-ssh-askpass-')).sort(),before); process.stdout.write('LINUX_PASSWORD:accepted\\n');
`)
    writeFileSync(path.join(root, 'linux-runner.ts'), `import {runCommand} from ${JSON.stringify(source)}; import {getDeployCommandState} from ${JSON.stringify(recovery)}; import assert from 'node:assert/strict'; import fs from 'node:fs'; import {setTimeout as delay} from 'node:timers/promises';
const evidence={platform:process.platform,trees:[],races:0};
function alive(pid){try{process.kill(pid,0);const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');return !['Z','X'].includes(stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]);}catch(error){if(error.code==='ESRCH'||error.code==='ENOENT')return false;throw error;}}
for(const early of [false,true]){const prefix='/fixture/tree-'+early;const child="const fs=require('node:fs');fs.writeFileSync('"+prefix+".pids',JSON.stringify([process.ppid,process.pid]));setInterval(()=>fs.appendFileSync('"+prefix+".beat','x'),20)";const parent="const {spawn}=require('node:child_process');spawn(process.execPath,['-e',"+JSON.stringify(child)+"],{stdio:'ignore'});"+(early?"setInterval(()=>{if(require('node:fs').existsSync('"+prefix+".pids'))process.exit(0)},5)":"setInterval(()=>{},1000)");const result=await runCommand(process.execPath,['-e',parent],{timeoutMs:1000});assert.equal(result.success,false);assert.equal(getDeployCommandState(result.error).localTermination,'confirmed');const pids=JSON.parse(fs.readFileSync(prefix+'.pids'));assert.ok(pids.every(pid=>!alive(pid)));const before=fs.existsSync(prefix+'.beat')?fs.readFileSync(prefix+'.beat','utf8'):'';await delay(100);assert.equal(fs.existsSync(prefix+'.beat')?fs.readFileSync(prefix+'.beat','utf8'):'',before);evidence.trees.push({early,pids,stopped:true});}
for(let i=0;i<5;i++){const result=await runCommand(process.execPath,['-e','setTimeout(()=>process.stdout.write("complete"),100)'],{timeoutMs:150});if(result.success)assert.equal(result.data.stdout,'complete');else assert.equal(getDeployCommandState(result.error).localTermination,'confirmed');evidence.races++;}
const output=await runCommand(process.execPath,['-e','process.stdout.write("x".repeat(2000000));process.stderr.write("y".repeat(2000000))'],{maxCaptureChars:1024});assert.equal(output.success,true);assert.equal(output.data.stdout.length,1024);assert.equal(output.data.stderr.length,1024);assert.ok(output.data.stdoutTruncated&&output.data.stderrTruncated);process.stdout.write('EVIDENCE:'+JSON.stringify(evidence)+'\\n');
`)
    const tsupManifest = fileURLToPath(import.meta.resolve('tsup/package.json'))
    const tsup: { bin: Record<string, string> } = JSON.parse(readFileSync(tsupManifest, 'utf8'))
    execFileSync(process.execPath, [path.join(path.dirname(tsupManifest), tsup.bin.tsup!), path.join(root, 'linux-runner.ts'), path.join(root, 'linux-password.ts'), '--format', 'esm', '--platform', 'node', '--out-dir', path.join(root, 'runner'), '--external', '@h-ai/core', '--external', 'zod'], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: remaining(60_000), stdio: ['ignore', 'pipe', 'pipe'] })
    fixtureContext = await createDeployTestFixture(runtime, 'docker.io/library/node:24.22.1-bookworm-slim', '', root, runId, {
      command: ['sleep', 'infinity'],
      timeoutMs: remaining(180_000),
      signal: setupSignal,
      prepare: async (fixture, signal) => {
        // 网络安装在已登记 ID 的私有 PID namespace 内执行；失败不会留下 host builder。
        await executeDeployTestFixture(runtime, fixture, ['sh', '-ec', `node -e "require('node:fs').writeFileSync('/tmp/node-ca.crt',require('node:tls').rootCertificates.join(String.fromCharCode(10)))" && ${mirrorCommand}sed -i 's#http://#https://#g' /etc/apt/sources.list.d/debian.sources && apt-get -o Acquire::ForceIPv4=true -o Acquire::https::CaInfo=/tmp/node-ca.crt -o Acquire::https::Timeout=20 -o Acquire::Retries=3 -o APT::Update::Error-Mode=any update && apt-get -o Acquire::ForceIPv4=true -o Acquire::https::CaInfo=/tmp/node-ca.crt -o Acquire::https::Timeout=20 install -y --no-install-recommends ca-certificates openssh-server util-linux && rm -rf /var/lib/apt/lists/* /tmp/node-ca.crt && ssh-keygen -A && mkdir -p /run/sshd /root/.ssh && chmod 700 /root/.ssh`], { timeoutMs: remaining(180_000), signal, stage: 'apt-install' })
        execFileSync(runtime, ['cp', `${key}.pub`, `${fixture.containerId}:/root/.ssh/authorized_keys`], { windowsHide: true, timeout: remaining(20_000), stdio: 'ignore' })
        // 合成密码仅从标准输入交给本夹具 chpasswd，不进入 runtime 参数或镜像层。
        execFileSync(runtime, ['exec', '-i', fixture.containerId, 'chpasswd'], { input: `root:${sshPassword}\n`, windowsHide: true, timeout: remaining(10_000), stdio: ['pipe', 'pipe', 'pipe'] })
        await executeDeployTestFixture(runtime, fixture, ['sh', '-ec', `chmod 600 /root/.ssh/authorized_keys; printf '\\nPermitRootLogin yes\\nPasswordAuthentication yes\\nUsePAM no\\n' >> /etc/ssh/sshd_config; /usr/sbin/sshd`], { timeoutMs: remaining(10_000), signal, stage: 'sshd' })
      },
    })
    container = fixtureContext.containerId
    sshPort = fixtureContext.sshHostPort
    await executeDeployTestFixture(runtime, fixtureContext, ['mkdir', '/fixture'], { timeoutMs: remaining(10_000), signal: setupSignal })
    for (const folder of ['node_modules', 'runner'])
      execFileSync(runtime, ['cp', path.join(root, folder), `${container}:/fixture/${folder}`], { windowsHide: true, timeout: remaining(180_000) })
    await executeDeployTestFixture(runtime, fixtureContext, ['sh', '-ec', `printf '#!/bin/sh\\nexit 0\\n' >/usr/local/bin/curl; chmod 700 /usr/local/bin/curl`], { timeoutMs: remaining(10_000), signal: setupSignal })
    const ssh = sshModule.createSshExecutor({ host: '127.0.0.1', port: sshPort, username: 'root', identityFile: key, knownHostsFile: path.join(root, 'known-hosts'), strictHostKeyChecking: false, connectTimeoutSeconds: 5 })
    expect((await ssh.exec('true', { timeoutMs: remaining(20_000) })).success).toBe(true)
  }, 300_000)

  afterEach(async () => {
    releaseOutput()
    vi.restoreAllMocks()
    await deploy.close()
  })

  afterAll(() => {
    const failures: DeployFixtureCleanupFailure[] = []
    const report = createDeployFixtureCleanupReport(runId, fixtureContext ? [fixtureContext] : [], [])
    try {
      if (fixtureContext)
        removeDeployTestFixture(runtime, fixtureContext)
    }
    catch (error) { failures.push({ stage: 'container-remove', error }) }
    try {
      report(failures)
    }
    catch (error) { failures.push({ stage: 'report-write', error }) }
    try {
      if (root) {
        if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('hai-command-runtime-'))
          throw new Error('Unexpected command runtime cleanup path')
        rmSync(root, { recursive: true, force: true })
      }
    }
    catch (error) { failures.push({ stage: 'temporary-directory-remove', error }) }
    try {
      report(failures)
    }
    catch (error) { failures.push({ stage: 'report-write', error }) }
    if (failures.length)
      throw new AggregateError(failures.map(failure => failure.error), 'Command runtime fixture cleanup failed')
  }, 90_000)

  it('真实 Linux 进程组收回长运行父子/早退父命令，并保留有界输出与 deadline race', () => {
    const output = execFileSync(runtime, ['exec', container, 'node', '/fixture/runner/linux-runner.js'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    const evidence = JSON.parse(output.split('\n').find(line => line.startsWith('EVIDENCE:'))!.slice(9))
    expect(evidence).toMatchObject({ platform: 'linux', races: 5 })
    expect(evidence.trees).toHaveLength(2)
  }, 60_000)

  it('真实sshd密码登录、错误密码、SCP与主机键不匹配边界', async () => {
    const knownHostsFile = path.join(root, 'password-known-hosts')
    const config = { host: '127.0.0.1', port: sshPort, username: 'root', password: sshPassword, auth: 'password' as const, strictHostKeyChecking: true, knownHostsFile, connectTimeoutSeconds: 5 }
    const ssh = sshModule.createSshExecutor(config)
    const connected = await ssh.exec('printf password-connected', { timeoutMs: 20_000 })
    expect(connected).toMatchObject({ success: true, data: { stdout: 'password-connected' } })
    const payload = path.join(root, 'password-upload 中文.txt')
    const content = `upload-${runId}`
    writeFileSync(payload, content)
    expect(await ssh.upload(payload, '/fixture/password-upload.txt')).toMatchObject({ success: true })
    expect(execute('cat /fixture/password-upload.txt')).toBe(content)
    const wrong = await sshModule.createSshExecutor({ ...config, password: `${sshPassword}wrong` }).exec('true', { timeoutMs: 20_000 })
    expect(wrong.success).toBe(false)
    expect(JSON.stringify(wrong)).not.toContain(sshPassword)
    // 向同一受控地址信任另一把真实生成的 key；服务器仍为本夹具，不连接外部服务器。
    const otherKey = path.join(root, 'untrusted-host')
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', otherKey], { windowsHide: true, timeout: 10_000, stdio: 'ignore' })
    const publicKey = readFileSync(`${otherKey}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ')
    const mismatched = path.join(root, 'mismatched-known-hosts')
    writeFileSync(mismatched, `[127.0.0.1]:${sshPort} ${publicKey}\n`)
    const refused = await sshModule.createSshExecutor({ ...config, knownHostsFile: mismatched }).exec('true', { timeoutMs: 20_000 })
    expect(refused.success).toBe(false)
    expect(JSON.stringify(refused)).not.toContain(sshPassword)
  }, 90_000)

  it('真实Linux SDK使用POSIX askpass，覆盖密码SCP和helper回收', () => {
    const result = spawnSync(runtime, ['exec', '-i', container, 'node', '/fixture/runner/linux-password.js'], { input: JSON.stringify({ password: sshPassword }), encoding: 'utf8', windowsHide: true, timeout: 45_000 })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('LINUX_PASSWORD:accepted')
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(sshPassword)
  }, 60_000)

  it('真实密码SSH超时确认本地进程退出，保留远端未知并回收helper', async () => {
    const ssh = sshModule.createSshExecutor({ host: '127.0.0.1', port: sshPort, username: 'root', auth: 'password', password: sshPassword, knownHostsFile: path.join(root, 'password-timeout-known-hosts'), strictHostKeyChecking: true, connectTimeoutSeconds: 5 })
    const result = await ssh.exec('echo $$ > /fixture/password-timeout.pid; exec sleep 30', { timeoutMs: 10_000 })
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Expected the real SSH deadline to fail')
    expect(getDeployCommandState(result.error)).toMatchObject({ reason: 'timeout', localTermination: 'confirmed', remoteExecution: 'unknown' })
    expect(execute('test -f /fixture/password-timeout.pid && echo started')).toBe('started')
    expect(JSON.stringify(result)).not.toContain(sshPassword)
    // 仅停止本用例在私有容器内记录的 PID；远端停止不由 SSH 超时推断。
    execute('if test -f /fixture/password-timeout.pid; then kill "$(cat /fixture/password-timeout.pid)" 2>/dev/null || true; fi')
  }, 45_000)

  it.each(['sh', 'ps1', 'pwsh'] as const)('真实%s离线上传入口经本地sshd复用密码完成三步', (script) => {
    if (script !== 'sh' && process.platform !== 'win32')
      return
    const local = path.join(root, `real-password-${script}`)
    mkdirSync(local)
    const apply = path.join(local, 'apply.sh')
    writeFileSync(apply, '#!/bin/sh\nset -eu\nprintf applied > "$1/password-accepted"\n')
    execFileSync('tar', ['-cf', path.join(local, 'password.tar'), '-C', local, 'apply.sh'], { windowsHide: true, timeout: 10_000 })
    const upload = createUploadScripts()
    writeFileSync(path.join(local, 'deploy.sh'), upload.sh)
    writeFileSync(path.join(local, 'deploy.ps1'), upload.ps1)
    writeFileSync(path.join(local, 'read-target.awk'), upload.reader)
    const remote = `/fixture/offline-password-${script}`
    writeFileSync(path.join(local, 'deploy-target.json'), JSON.stringify({ host: '127.0.0.1', port: script === 'sh' ? 22 : sshPort, username: 'root', auth: 'password', passwordEnv: 'HAI_DEPLOY_PROVIDER_SSH_PASSWORD', knownHostsFile: script === 'sh' ? `/fixture/known-password-${script}` : path.join(root, 'known-password-ps1'), directory: remote, bundle: 'password.tar' }))
    if (script === 'sh') {
      execFileSync(runtime, ['cp', local, `${container}:/fixture/real-password-sh`], { windowsHide: true, timeout: 20_000 })
      const result = spawnSync(runtime, ['exec', '-i', container, 'sh', '-ec', 'IFS= read -r HAI_DEPLOY_PROVIDER_SSH_PASSWORD; export HAI_DEPLOY_PROVIDER_SSH_PASSWORD; sh /fixture/real-password-sh/deploy.sh'], { input: `${sshPassword}\n`, encoding: 'utf8', windowsHide: true, timeout: 60_000 })
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(sshPassword)
    }
    else {
      const result = spawnSync(script === 'pwsh' ? 'pwsh' : 'powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(local, 'deploy.ps1')], { env: { ...process.env, HAI_DEPLOY_PROVIDER_SSH_PASSWORD: sshPassword }, encoding: 'utf8', windowsHide: true, timeout: 60_000 })
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(sshPassword)
    }
    expect(execute(`cat ${remote}/password-accepted`)).toBe('applied')
  }, 90_000)

  it.each(['continuing', 'completed'])('真实 SSH 中断后区分远端仍在执行与匹配终态 (%s)', async (mode) => {
    execute('rm -f /fixture/block-load /fixture/release-load /fixture/remote-heartbeat /fixture/remote-worker.pid')
    const docker = path.join(root, 'docker-fixture')
    writeFileSync(docker, `#!/bin/sh
case "$*" in
  *'up --help'*) printf 'never\\n';;
  *'config --services'*) printf 'serv\\n';;
  *'image inspect --format'*) printf 'amd64\\n';;
esac
if [ "$1" = load ] && [ -f /fixture/block-load ]; then
  trap '' HUP
  echo $$ > /fixture/remote-worker.pid
  while [ ! -f /fixture/release-load ]; do printf x >> /fixture/remote-heartbeat; sleep 0.05; done
fi
`)
    execFileSync(runtime, ['cp', docker, `${container}:/usr/local/bin/docker`], { windowsHide: true })
    execute(`chmod 700 /usr/local/bin/docker; ${mode === 'continuing' ? 'touch /fixture/block-load' : ':'}`)
    const original = sshModule.createSshExecutor
    const paused = new Promise<void>((resolve) => {
      releaseOutput = resolve
    })
    vi.spyOn(sshModule, 'createSshExecutor').mockImplementation((config) => {
      const ssh = original(config)
      return { ...ssh, exec: (command, options) => ssh.exec(command, command.includes('apply.sh')
        ? { ...options, timeoutMs: 2500, onOutput: async (chunk) => {
            await options?.onOutput?.(chunk)
            // 故障注入仅缩短 10 分钟 deadline，并在已完成场景暂停消费，制造真实丢失回执。
            if (mode === 'completed')
              await paused
          } }
        : options) }
    })
    const provider = { type: 'docker-ssh' as const, ssh: { host: '127.0.0.1', port: sshPort, username: 'root', identityFile: path.join(root, 'key'), knownHostsFile: path.join(root, 'known-hosts'), strictHostKeyChecking: false }, remote: { runtime: 'docker' as const, baseDir: '/fixture/deploy' }, expose: { hostPort: 18080 } }
    expect(await deploy.init({ provider })).toMatchObject({ success: true })
    const app = application(`ssh-${mode}`)
    const result = await deploy.deployApp(app, { environment: 'test', skipMiddleware: true })
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Injected deadline must remain visible')
    const state = getDeployCommandState(result.error)
    expect(state).toMatchObject({ reason: 'timeout', localTermination: 'confirmed', remoteExecution: mode === 'continuing' ? 'unknown' : 'finished' })
    expect(state?.resultFile).toContain(`result-${state?.deploymentId}.json`)
    if (mode === 'continuing') {
      expect(execute('kill -0 "$(cat /fixture/remote-worker.pid)" && echo alive')).toBe('alive')
      const before = execute('wc -c </fixture/remote-heartbeat')
      await setTimeout(200)
      expect(Number(execute('wc -c </fixture/remote-heartbeat'))).toBeGreaterThan(Number(before))
      execute('touch /fixture/release-load')
      const lock = `${path.posix.dirname(state!.resultFile!)}/.deploy.lock`
      await vi.waitFor(() => expect(execute(`flock -n '${lock}' -c 'echo released'`)).toBe('released'), { timeout: 10_000 })
    }
    else {
      expect(state?.remoteExitCode).toBe(0)
      expect(execute(`cat '/fixture/deploy/ssh-completed-test/current'`)).toBe(state?.deploymentId)
      const snapshot = () => execute('find /fixture/deploy/ssh-completed-test -type f -exec sha256sum {} \\; | sort')
      const before = snapshot()
      const plan = await createDeploymentPlan(app, { provider }, { environment: 'test', skipMiddleware: true, inspectRemote: true })
      expect(plan).toMatchObject({ success: true, data: { baseline: { state: 'verified', release: state?.deploymentId }, artifact: { buildId: 'release-1', verified: true } } })
      expect(snapshot()).toBe(before)
    }
  }, 60_000)

  it('从实际 dist 公开入口打包，内嵌 Windows helper 无需源码或 ps1 资源', () => {
    const app = application('发布 空格', 'dist-consumer')
    const entry = path.join(root, 'dist-consumer.mjs')
    const published = pathToFileURL(path.join(repository, 'packages/deploy/dist/index.js')).href
    writeFileSync(entry, `import {deploy,getDeployCommandState} from ${JSON.stringify(published)};try{const init=await deploy.init({provider:{type:'docker-ssh',expose:{hostPort:18080}}});if(!init.success)throw new Error(init.error.message);const result=await deploy.deployApp(process.argv[2],{environment:'test',bundleOnly:true});if(!result.success)throw new Error(result.error.message);process.stdout.write('DIST:'+JSON.stringify({bundle:result.data.bundlePath,stateReader:typeof getDeployCommandState})+'\\n');}finally{await deploy.close()}`)
    const output = execFileSync(process.execPath, [entry, app], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    const evidence = JSON.parse(output.split('\n').find(line => line.startsWith('DIST:'))!.slice(5))
    expect(evidence.stateReader).toBe('function')
    expect(existsSync(evidence.bundle)).toBe(true)
    const scripts = path.dirname(evidence.bundle)
    execFileSync(runtime, ['cp', path.join(scripts, 'deploy.sh'), `${container}:/fixture/operator.sh`], { windowsHide: true })
    execute('sh -n /fixture/operator.sh')
    if (process.platform === 'win32') {
      const file = path.join(scripts, 'deploy.ps1').replaceAll('\'', '\'\'')
      execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 1}`], { windowsHide: true, stdio: 'ignore' })
    }
  }, 60_000)
})
