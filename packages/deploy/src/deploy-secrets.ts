/** 旧部署凭据的显式、只读预检与原子导入；不轮换密码、不变更容器和数据卷。 */
import type { HaiResult } from '@h-ai/core'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { err, ok } from '@h-ai/core'
import { z } from 'zod'
import { runCommand } from './container/deploy-command.js'
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

const nameSchema = z.string().regex(/^[a-z0-9][\w.-]{0,127}$/i)
const passwordSchema = z.string().min(1).max(1024).refine(value => Buffer.from(value, 'utf8').toString('utf8') === value && [...value].every(character => character.codePointAt(0)! >= 32 && character.codePointAt(0) !== 127))
const importSchema = z.strictObject({
  version: z.literal(1),
  projectName: nameSchema,
  credentials: z.strictObject({ DB_PASSWORD: passwordSchema.optional(), STORAGE_PASSWORD: passwordSchema.optional(), LDAP_PASSWORD: passwordSchema.optional() }),
  services: z.array(z.strictObject({
    service: z.enum(['db', 'vecdb', 'storage', 'ldap']),
    container: nameSchema,
    kind: z.enum(['postgresql', 'mysql', 's3', 'ldap']),
    volumes: z.array(nameSchema).min(1).max(8),
    username: z.string().min(1).max(128).default('hai'),
    database: z.string().min(1).max(128).default('hai'),
    bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).default('hai'),
    accessKeyId: z.string().min(1).max(128).default('hai-storage'),
    region: z.string().regex(/^[a-z0-9-]+$/).default('us-east-1'),
    bindDn: z.string().min(1).max(512).default('cn=admin,dc=example,dc=org'),
  })).min(1).max(4),
})
const groups = { db: 'DB_PASSWORD', vecdb: 'DB_PASSWORD', storage: 'STORAGE_PASSWORD', ldap: 'LDAP_PASSWORD' } as const

/** 独立持锁进程只接受完整状态，原子发布并同步目录；中断时留下的私有 next 文件不被后续导入信任。 */
const importCommitScript = String.raw`(async()=>{const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const root=process.argv[1];let temporary;
try{process.stdout.write('LOCKED\n');let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>65536)throw Error()}
if(!input)return;const {content}=JSON.parse(input);if(typeof content!=='string'||!content.startsWith('FORMAT_VERSION=2\n'))throw Error();
const state=path.join(root,'managed-secrets.env');try{fs.lstatSync(state);throw Error('exists')}catch(error){if(error.code!=='ENOENT')throw error}
temporary=path.join(root,'.managed-secrets-'+crypto.randomUUID()+'.next');const fd=fs.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
try{fs.writeFileSync(fd,content);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temporary,state);temporary=undefined;
const directory=fs.openSync(root,fs.constants.O_RDONLY);try{fs.fsyncSync(directory)}finally{fs.closeSync(directory)}process.stdout.write('COMMITTED\n');
}catch{process.exitCode=1}finally{if(temporary)try{fs.unlinkSync(temporary)}catch{}}})()`

/** 仅在同项目的现有 Node 应用容器中执行 S3 HEAD；不写配置，不跟随重定向，不输出服务响应。 */
const s3VerificationScript = String.raw`(async()=>{try{
const {createHash,createHmac}=require('node:crypto');let input='';for await(const chunk of process.stdin)input+=chunk;
const {endpoint,bucket,accessKeyId,secret,region}=JSON.parse(input);const url=new URL('/'+encodeURIComponent(bucket),endpoint);
const hash=value=>createHash('sha256').update(value).digest('hex');const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');const day=date.slice(0,8);const payload=hash('');
const headers='host:'+url.host+'\nx-amz-content-sha256:'+payload+'\nx-amz-date:'+date+'\n';const signed='host;x-amz-content-sha256;x-amz-date';
const scope=day+'/'+region+'/s3/aws4_request';const canonical=['HEAD',url.pathname,'',headers,signed,payload].join('\n');
const key=hmac(hmac(hmac(hmac('AWS4'+secret,day),region),'s3'),'aws4_request');const signature=hmac(key,['AWS4-HMAC-SHA256',date,scope,hash(canonical)].join('\n')).toString('hex');
const response=await fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'x-amz-date':date,'x-amz-content-sha256':payload,Authorization:'AWS4-HMAC-SHA256 Credential='+accessKeyId+'/'+scope+', SignedHeaders='+signed+', Signature='+signature}});
await response.body?.cancel();if(response.ok)process.stdout.write('VERIFIED');else process.exitCode=1;
}catch{process.exitCode=1}})()`

/**
 * 在目标服务器导入前核验旧凭据；dryRun 默认 true，apply 需要 Linux flock 与运行中的原服务。
 * 输入文件必须由操作者明确指定，权限 0600；API 不读取旧部署包猜测密码。
 * @param options - 服务器项目目录、受保护的导入 JSON、容器引擎和只读开关。
 * @param options.directory - 目标 Linux 服务器上已存在的项目部署目录。
 * @param options.inputFile - 操作者提供的版本化私有 JSON 文件路径。
 * @param options.runtime - 实际使用的 Docker 或 Podman 引擎。
 * @param options.dryRun - 默认 true；只有显式 false 才在部署锁内保存状态。
 * @returns 仅包含项目、凭据组和卷名的回执，不包含密码；失败不推进 current 或改变服务。
 * @example
 * ```ts
 * import { importDeploymentSecrets } from '@h-ai/deploy'
 * const plan = await importDeploymentSecrets({ directory: '/opt/hai/apps/shop-test', inputFile: '/private/shop-import.json', runtime: 'docker' })
 * if (!plan.success) throw new Error(plan.error.message)
 * // 停止业务写入、备份数据后，用相同输入显式传 dryRun: false 导入。
 * ```
 */
export async function importDeploymentSecrets(options: {
  directory: string
  inputFile: string
  runtime: 'docker' | 'podman'
  dryRun?: boolean
}): Promise<HaiResult<{ projectName: string, stateVersion: 2, groups: string[], volumes: string[], changed: boolean }>> {
  let lock: Awaited<ReturnType<typeof acquireImportLock>> | undefined
  let commitAttempted = false
  let phase: 'input' | 'identity' | 'verification' | 'lock' | 'state' = 'input'
  try {
    if (!['docker', 'podman'].includes(options.runtime))
      throw new Error('input')
    const root = resolve(options.directory)
    if (realpathSync(root) !== root || !lstatSync(root).isDirectory() || (process.platform !== 'win32' && (lstatSync(root).mode & 0o022)))
      throw new Error('input')
    const input = privateFile(resolve(options.inputFile))
    const parsed = importSchema.safeParse(JSON.parse(input))
    if (!parsed.success)
      return err({ ...HaiDeployError.CONFIG_ERROR, message: deployM('deploy_secretImportFailed', { params: { phase } }), ext: { phase, state: 'unchanged', fields: parsed.error.issues.map(issue => issue.path.join('.')) } })
    const config = parsed.data
    const project = `hai-${config.projectName}`
    const selectedGroups = [...new Set(config.services.map(service => groups[service.service]))].sort()
    if (new Set(config.services.map(service => service.service)).size !== config.services.length
      || Object.keys(config.credentials).some(group => !selectedGroups.includes(group as typeof selectedGroups[number]))
      || selectedGroups.some(group => !config.credentials[group])) {
      throw new Error('input')
    }
    const secrets = Object.values(config.credentials).filter((value): value is string => typeof value === 'string')
    const stateFile = join(root, 'managed-secrets.env')
    const lockFile = join(root, '.deploy.lock')
    phase = 'lock'
    if (options.dryRun === false) {
      if (process.platform !== 'linux')
        throw new Error('lock')
      if (existsSync(lockFile) && (lstatSync(lockFile).isSymbolicLink() || !lstatSync(lockFile).isFile() || lstatSync(lockFile).nlink !== 1))
        throw new Error('lock')
      lock = await acquireImportLock(lockFile, root)
    }
    phase = 'identity'
    const volumes: Array<{ group: string, name: string }> = []
    for (const service of config.services) {
      const kindValid = service.service === 'storage' ? service.kind === 's3' : service.service === 'ldap' ? service.kind === 'ldap' : ['postgresql', 'mysql'].includes(service.kind)
      if (!kindValid)
        throw new Error('identity')
      // 受管 sidecar 固定账户/库/桶身份；不能只导入密码后让后续部署悄悄切换身份。
      if ((['postgresql', 'mysql'].includes(service.kind) && (service.username !== 'hai' || service.database !== 'hai'))
        || (service.kind === 's3' && (service.accessKeyId !== 'hai-storage' || service.bucket !== 'hai' || service.region !== 'us-east-1'))
        || (service.kind === 'ldap' && service.bindDn !== 'cn=admin,dc=example,dc=org')) {
        throw new Error('identity')
      }
      const identity = await inspectContainer(options.runtime, service.container, secrets)
      if (identity.project !== project || identity.service !== service.service || !identity.running)
        throw new Error('identity')
      for (const volume of service.volumes) {
        if (!identity.volumes.includes(volume))
          throw new Error('identity')
        volumes.push({ group: groups[service.service], name: volume })
      }
      phase = 'verification'
      const password = config.credentials[groups[service.service]]!
      let verified = false
      if (service.kind === 's3') {
        const helper = `hai-${config.projectName}-app`
        const application = await inspectContainer(options.runtime, helper, secrets)
        if (application.project !== project || application.service !== 'app' || !application.running || !application.networks.some(network => identity.networks.includes(network)))
          throw new Error('identity')
        const result = await runCommand(options.runtime, ['exec', '-i', helper, 'node', '-e', s3VerificationScript], { input: JSON.stringify({ endpoint: `http://${service.container}:9000`, bucket: service.bucket, accessKeyId: service.accessKeyId, secret: password, region: service.region }), secrets, timeoutMs: 15000, maxCaptureChars: 1024 })
        verified = result.success && result.data.stdout.trim() === 'VERIFIED'
      }
      else {
        const args = service.kind === 'ldap'
          ? ['exec', '-i', service.container, 'ldapwhoami', '-x', '-H', 'ldap://127.0.0.1:389', '-D', service.bindDn, '-y', '/dev/stdin']
          : ['exec', '-i', service.container, 'sh', '-c', service.kind === 'postgresql'
              ? 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql --no-psqlrc -h "$3" -U "$1" -d "dbname=$2 require_auth=scram-sha-256,md5,password" -Atc "SELECT 1"'
              : 'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql -h 127.0.0.1 -u "$1" "$2" -Nse "SELECT 1"', 'hai-secret-check', service.username, service.database, service.container]
        // LDAP -y 按文件字节读取密码，不能附加 shell read 使用的行尾。
        const result = await runCommand(options.runtime, args, { input: service.kind === 'ldap' ? password : `${password}\n`, secrets, timeoutMs: 15000, maxCaptureChars: 1024 })
        verified = result.success && !result.data.stdoutTruncated && (service.kind === 'ldap' ? result.data.stdout.trim().startsWith('dn:') : result.data.stdout.trim() === '1')
        if (verified && service.kind === 'mysql') {
          const rootCheck = await runCommand(options.runtime, [...args.slice(0, -3), 'root', service.database, service.container], { input: `${password}\n`, secrets, timeoutMs: 15000, maxCaptureChars: 1024 })
          verified = rootCheck.success && !rootCheck.data.stdoutTruncated && rootCheck.data.stdout.trim() === '1'
          // MySQL 的各版本不统一暴露 skip_grant_tables；实际错误密码必须收到认证拒绝。
          const invalidPassword = `hai-import-invalid-${randomUUID()}`
          for (const username of [service.username, 'root']) {
            if (!verified)
              break
            const negative = await runCommand(options.runtime, [...args.slice(0, -3), username, service.database, service.container], { input: `${invalidPassword}\n`, secrets: [...secrets, invalidPassword], timeoutMs: 15000, maxCaptureChars: 1024 })
            verified = !negative.success && /ERROR 1045 \(28000\)/.test(negative.error.message)
          }
        }
      }
      if (!verified)
        throw new Error('verification')
      phase = 'identity'
    }
    phase = 'state'
    const uniqueVolumes = [...new Map(volumes.map(volume => [`${volume.group}:${volume.name}`, volume])).values()].sort((a, b) => `${a.group}:${a.name}`.localeCompare(`${b.group}:${b.name}`))
    const lines = ['FORMAT_VERSION=2', `PROJECT=${project}`, ...selectedGroups.map(group => `${group}=${Buffer.from(config.credentials[group]!, 'utf8').toString('hex')}`), ...uniqueVolumes.map((volume, index) => `VOLUME_${index + 1}=${volume.group}:${volume.name}`)]
    let changed = false
    if (existsSync(stateFile) || isSymbolicLink(stateFile)) {
      const existing = readImportedState(privateFile(stateFile))
      if (existing.FORMAT_VERSION !== '2' || existing.PROJECT !== project || selectedGroups.some(group => existing[group] !== Buffer.from(config.credentials[group]!, 'utf8').toString('hex')) || uniqueVolumes.some(volume => !Object.entries(existing).some(([key, value]) => /^VOLUME_\d+$/.test(key) && value === `${volume.group}:${volume.name}`)))
        throw new Error('state')
    }
    else if (options.dryRun === false) {
      commitAttempted = true
      if (!lock || !await lock.commit(`${lines.join('\n')}\n`))
        throw new Error('lock')
      changed = true
    }
    return ok({ projectName: config.projectName, stateVersion: 2, groups: selectedGroups, volumes: uniqueVolumes.map(volume => volume.name), changed })
  }
  catch {
    return err({ ...HaiDeployError.CONFIG_ERROR, message: deployM('deploy_secretImportFailed', { params: { phase } }), ext: { phase, state: commitAttempted ? 'unknown' : 'unchanged' } })
  }
  finally {
    await lock?.release()
  }
}

function readImportedState(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.trimEnd().split('\n')) {
    const match = /^(FORMAT_VERSION|PROJECT|DB_PASSWORD|STORAGE_PASSWORD|LDAP_PASSWORD|VOLUME_[1-9]\d*)=([^=]+)$/.exec(line)
    if (!match || Object.hasOwn(result, match[1]!))
      throw new Error('state')
    const key = match[1]!
    const value = match[2]!
    if (key.endsWith('_PASSWORD')) {
      if (!/^(?:[a-f0-9]{2})+$/.test(value))
        throw new Error('state')
      const decoded = Buffer.from(value, 'hex').toString('utf8')
      if (!passwordSchema.safeParse(decoded).success || Buffer.from(decoded, 'utf8').toString('hex') !== value)
        throw new Error('state')
    }
    else if (key.startsWith('VOLUME_') && !/^(?:DB_PASSWORD|STORAGE_PASSWORD|LDAP_PASSWORD):[a-zA-Z0-9][\w.-]*$/.test(value)) {
      throw new Error('state')
    }
    result[key] = value
  }
  if (result.FORMAT_VERSION !== '2' || !nameSchema.safeParse(result.PROJECT).success)
    throw new Error('state')
  return result
}

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  }
  catch {
    return false
  }
}

function privateFile(path: string): string {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536 || (process.platform !== 'win32' && ((stat.mode & 0o077) || (process.getuid?.() !== 0 && stat.uid !== process.getuid?.()))))
    throw new Error('private-file')
  return readFileSync(path, 'utf8')
}

async function inspectContainer(runtime: string, container: string, secrets: string[]) {
  const result = await runCommand(runtime, ['inspect', '--format', '{{json .Config.Labels}}\n{{json .Mounts}}\n{{json .State.Running}}\n{{json .NetworkSettings.Networks}}', container], { secrets, timeoutMs: 10000, maxCaptureChars: 32768 })
  if (!result.success || result.data.stdoutTruncated)
    throw new Error('identity')
  const [labelsText, mountsText, runningText, networksText] = result.data.stdout.trim().split('\n')
  const labels = z.record(z.string(), z.string()).parse(JSON.parse(labelsText!))
  const mounts = z.array(z.object({ Type: z.string(), Name: z.string().optional() })).parse(JSON.parse(mountsText!))
  // Podman 的默认 pasta/slirp 网络可返回 null；原生 DB/LDAP 验证不要求命名网络。
  const networks = z.record(z.string(), z.object({ NetworkID: z.string() })).parse(JSON.parse(networksText!) ?? {})
  // 每种已声明的标准标签必须完整，两个命名空间同时声明时保持一致，禁止混拼身份。
  const dockerProject = labels['com.docker.compose.project'] || undefined
  const podmanProject = labels['io.podman.compose.project'] || undefined
  const dockerService = labels['com.docker.compose.service'] || undefined
  const podmanService = labels['io.podman.compose.service'] || undefined
  if (Boolean(dockerProject) !== Boolean(dockerService) || Boolean(podmanProject) !== Boolean(podmanService)
    || (dockerProject && podmanProject && dockerProject !== podmanProject) || (dockerService && podmanService && dockerService !== podmanService)) {
    throw new Error('identity')
  }
  return { project: dockerProject ?? podmanProject, service: dockerService ?? podmanService, running: runningText === 'true', volumes: mounts.flatMap(mount => mount.Type === 'volume' && mount.Name ? [mount.Name] : []), networks: Object.values(networks).map(network => network.NetworkID) }
}

/** flock 子进程持有同一个固定锁文件；父进程消失后 stdin 关闭，自然释放锁。 */
async function acquireImportLock(path: string, root: string): Promise<{ commit: (content: string) => Promise<boolean>, release: () => Promise<void> }> {
  return new Promise((resolveLock, reject) => {
    // 最终写入也由持锁进程完成；锁 helper 意外退出时父进程无法越过锁提交。
    const child = spawn('flock', ['-n', path, process.execPath, '-e', importCommitScript, root], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    let acquired = false
    let exited = false
    let output = ''
    const finished = new Promise<void>(done => child.once('close', () => {
      exited = true
      done()
    }))
    child.stdin.on('error', () => { /* 由提交回执判断失败，不泄漏输入。 */ })
    const timer = setTimeout(() => {
      child.stdin.end()
      child.kill()
      reject(new Error('lock'))
    }, 5000)
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('lock'))
    })
    child.once('exit', () => {
      if (!acquired) {
        clearTimeout(timer)
        reject(new Error('lock'))
      }
    })
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString()
      if (acquired || !output.includes('\n'))
        return
      if (!output.startsWith('LOCKED\n') || exited) {
        child.stdin.end()
        reject(new Error('lock'))
        return
      }
      acquired = true
      clearTimeout(timer)
      resolveLock({
        commit: async (content) => {
          if (exited)
            return false
          child.stdin.end(JSON.stringify({ content }))
          await finished
          return child.exitCode === 0 && output === 'LOCKED\nCOMMITTED\n'
        },
        release: async () => {
          child.stdin.end()
          await finished
        },
      })
    })
  })
}
