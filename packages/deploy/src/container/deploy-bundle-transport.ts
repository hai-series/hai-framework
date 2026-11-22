import type { CommandOptions } from './deploy-command.js'
import type { SshExecutor } from './deploy-ssh.js'
import { basename } from 'node:path'
import { shellArgument } from './deploy-scripts.js'

/**
 * 将已验证的私有部署包上传并执行其固定入口；回执和远端运行状态由调用方核验。
 * @example 模块内部上下文
 * ```ts
 * async function launch(ssh: SshExecutor) {
 *   return await uploadAndApplyBundle(ssh, '/workspace/shop.tar', '/opt/hai/apps/shop', 'apply.sh')
 * }
 * ```
 */
export async function uploadAndApplyBundle(
  ssh: SshExecutor,
  bundlePath: string,
  remoteDir: string,
  startName: string,
  options: Pick<CommandOptions, 'signal' | 'onOutput' | 'secrets' | 'discardOutput'> & { bundleSha256?: string } = {},
) {
  const incoming = `${remoteDir}/incoming`
  const archive = `${incoming}/${basename(bundlePath)}`
  const contents = `${archive}.contents`
  const quote = shellArgument
  const prepared = await ssh.exec(`mkdir -p -- ${quote(incoming)} && chmod 700 -- ${quote(remoteDir)} ${quote(incoming)}`, { signal: options.signal })
  if (!prepared.success)
    return { started: false as const, result: prepared }
  const uploaded = await ssh.upload(bundlePath, archive, { signal: options.signal })
  if (!uploaded.success)
    return { started: false as const, result: uploaded }
  const checksum = options.bundleSha256
    ? ` && printf '%s  %s\\n' ${quote(options.bundleSha256)} ${quote(archive)} | sha256sum --check --status -`
    : ''
  const result = await ssh.exec(
    `mkdir -p ${quote(contents)} && chmod 600 ${quote(archive)}${checksum} && tar -xf ${quote(archive)} -C ${quote(contents)} && sh ${quote(`${contents}/${startName}`)} ${quote(remoteDir)} && { rm -rf -- ${quote(contents)} && rm -f -- ${quote(archive)} || printf '[WARN] Deployment passed; incoming archive cleanup failed\\n' >&2; }`,
    { timeoutMs: 600_000, ...options },
  )
  return { started: true as const, result }
}
