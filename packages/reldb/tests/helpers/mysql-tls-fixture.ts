import type { StartedTestContainer } from 'testcontainers'
/** 仅本轮持有 CA/私钥的真实 TLS MySQL fixture；不依赖 container.exec 或提交证书。 */
import type { MysqlConfig, ReldbConfigInput } from '../../src/index.js'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { GenericContainer, Wait } from 'testcontainers'

const execute = promisify(execFile)
const mysql = createRequire(import.meta.url)('mysql2/promise') as typeof import('mysql2/promise')
type MysqlInput = Extract<ReldbConfigInput, { type: 'mysql' }>

/** 本轮 TLS 凭据仅供内存使用；close 必须停止容器并删除所有临时私钥文件。 */
interface MysqlTlsFixture {
  config: MysqlInput
  clientConfig: MysqlInput
  wrongCa: string
  close: () => Promise<void>
}

/** 只删除直接位于系统临时目录、且由本 helper 创建的目录。 */
async function removeFixture(directory: string): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hai-mysql-tls-'))
    throw new Error('Unexpected MySQL TLS cleanup target')
  await rm(target, { recursive: true, force: true })
}

/** 使用系统 OpenSSL，Windows 额外发现 Git 附带版本；缺失即为前置失败，不跳过 TLS 验收。 */
async function findOpenSsl(): Promise<string> {
  const candidates = ['openssl']
  if (process.platform === 'win32')
    candidates.push(join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git', 'usr', 'bin', 'openssl.exe'))
  for (const executable of candidates) {
    try {
      await execute(executable, ['version'], { windowsHide: true, timeout: 10_000 })
      return executable
    }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw new Error('OpenSSL prerequisite failed')
    }
  }
  throw new Error('OpenSSL prerequisite is missing; install OpenSSL or Git for Windows')
}

/**
 * 生成短期 CA、服务端 SAN 证书和客户端证书，通过真实网络启动 MySQL TLS。
 *
 * 证书仅复制到本轮容器；密钥不写日志或仓库。fixture 使用本机容器端口转发和 localhost DNS。
 * @param serverName - 证书中的 DNS SAN；错误名称用于验证主机身份拒绝。
 * @example const fixture = await createMysqlTlsFixture('localhost'); try { await reldb.init(fixture.config) } finally { await fixture.close() }
 */
export async function createMysqlTlsFixture(serverName: string): Promise<MysqlTlsFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'hai-mysql-tls-'))
  let container: StartedTestContainer | undefined
  const close = async () => {
    try {
      await container?.stop({ timeout: 10_000, remove: true, removeVolumes: true })
    }
    finally { await removeFixture(directory) }
  }
  try {
    const executable = await findOpenSsl()
    const openssl = (args: string[]) => execute(executable, args, { cwd: directory, windowsHide: true, timeout: 30_000 })
    for (const authority of ['ca', 'wrong-ca']) {
      await openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-subj', `/CN=hai-${authority}`, '-keyout', `${authority}.key`, '-out', `${authority}.crt`, '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'])
    }
    for (const name of ['server', 'client']) {
      await openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', `/CN=${name === 'server' ? serverName : 'hai-client'}`, '-keyout', `${name}.key`, '-out', `${name}.csr`])
      await writeFile(join(directory, `${name}.ext`), [
        'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        `extendedKeyUsage=${name === 'server' ? 'serverAuth' : 'clientAuth'}`,
        ...(name === 'server' ? [`subjectAltName=DNS:${serverName}`] : []),
      ].join('\n'))
      await openssl(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-sha256', '-days', '1', '-extfile', `${name}.ext`, '-out', `${name}.crt`])
    }
    const password = randomBytes(24).toString('hex')
    container = await new GenericContainer('docker.io/library/mysql:8.4.11')
      .withExposedPorts(3306)
      .withEnvironment({ MYSQL_DATABASE: 'db_test', MYSQL_ROOT_PASSWORD: password })
      .withCopyFilesToContainer(['ca.crt', 'server.crt', 'server.key'].map(name => ({ source: join(directory, name), target: `/tmp/hai-${name}`, mode: 0o644 })))
      .withCommand(['--ssl-ca=/tmp/hai-ca.crt', '--ssl-cert=/tmp/hai-server.crt', '--ssl-key=/tmp/hai-server.key'])
      .withWaitStrategy(Wait.forLogMessage(/ready for connections\..*port: 3306/))
      .withStartupTimeout(120_000)
      .start()
    const connection = { host: 'localhost', port: container.getMappedPort(3306), database: 'db_test', user: 'root', password }
    const ca = await readFile(join(directory, 'ca.crt'), 'utf8')
    const client = mysql.createPool(connection)
    try {
      await client.query('CREATE USER \'hai_tls_client\'@\'%\' IDENTIFIED BY ? REQUIRE X509', [password])
      await client.query('GRANT SELECT ON db_test.* TO \'hai_tls_client\'@\'%\'')
    }
    catch {
      // 驱动错误可能携带 CREATE USER 原文，不能把临时凭据写入测试输出。
      throw new Error('MySQL TLS fixture user setup failed')
    }
    finally { await client.end() }
    const ssl: Exclude<MysqlConfig['ssl'], false | undefined> = { ca, rejectUnauthorized: true, verifyIdentity: true }
    return {
      config: { type: 'mysql', ...connection, ssl, pool: { max: 2, acquireTimeout: 5000 } },
      clientConfig: { type: 'mysql', ...connection, user: 'hai_tls_client', ssl: { ...ssl, cert: await readFile(join(directory, 'client.crt'), 'utf8'), key: await readFile(join(directory, 'client.key'), 'utf8') } },
      wrongCa: await readFile(join(directory, 'wrong-ca.crt'), 'utf8'),
      close,
    }
  }
  catch (error) {
    await close()
    throw error
  }
}
