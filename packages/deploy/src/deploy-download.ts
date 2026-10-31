/** 构建与交付共用的下载源解析；不修改系统或容器引擎配置。 */
import type { DownloadProxyConfig, ImageSourceConfig } from './deploy-types.js'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { deployM } from './deploy-i18n.js'

/**
 * 将镜像引用映射到所选下载源，保留命名空间、版本与摘要。
 * @param reference - Docker/OCI 镜像引用。
 * @param source - 官方、大陆或按原仓库配置的自定义源。
 * @returns 下载引用；官方源保留输入引用。
 * @throws Error - 源、仓库映射或镜像引用不合法。
 * @example
 * ```ts
 * import { resolveImageReference } from '@h-ai/deploy'
 * const image = resolveImageReference('node:24.22.1-bookworm-slim', { type: 'cn' })
 * // docker.1ms.run/library/node:24.22.1-bookworm-slim
 * ```
 */
export function resolveImageReference(reference: string, source?: ImageSourceConfig): string {
  if (!reference || /[\s\\?#]/.test(reference) || reference.includes('://') || reference.split('/').some(part => part === '.' || part === '..'))
    throw new Error(deployM('deploy_downloadInvalid'))
  if (!source || source.type === 'official')
    return reference
  if (!['cn', 'custom'].includes(source.type))
    throw new Error(deployM('deploy_downloadInvalid'))
  const parts = reference.split('/')
  const explicit = parts.length > 1 && /[.:]|^localhost$/.test(parts[0])
  const registry = explicit ? parts.shift()! : 'docker.io'
  if (registry === 'docker.io' && parts.length === 1)
    parts.unshift('library')
  const mappings: Record<string, string> | undefined = source.type === 'cn' ? { 'docker.io': 'docker.1ms.run', 'ghcr.io': 'ghcr.1ms.run' } : source.registries
  const replacement = mappings?.[registry]
  if (!replacement || typeof replacement !== 'string')
    throw new Error(deployM('deploy_imageSourceMissing', { params: { registry } }))
  if (replacement.split('/').some(part => part === '.' || part === '..'))
    throw new Error(deployM('deploy_downloadInvalid'))
  let url: URL
  try {
    url = new URL(replacement.includes('://') ? replacement : `https://${replacement}`)
  }
  catch { throw new Error(deployM('deploy_downloadInvalid')) }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /%|\/\//.test(url.pathname)
    || !/^[\w./-]*$/.test(url.pathname) || url.pathname.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(deployM('deploy_downloadInvalid'))
  }
  return `${url.host}${url.pathname.replace(/\/$/, '')}/${parts.join('/')}`
}

/** 系统代理只读取静态设置；PAC 不在打包进程中执行。 */
function systemProxy(): { http?: string, https?: string, bypass?: string } {
  if (process.platform === 'win32') {
    const script = '$p=Get-ItemProperty -LiteralPath \'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\'; @{enabled=($p.ProxyEnable -eq 1);server=$p.ProxyServer;bypass=$p.ProxyOverride;pac=$p.AutoConfigURL}|ConvertTo-Json -Compress'
    const value: { enabled?: boolean, server?: string, bypass?: string, pac?: string } = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5000 }))
    if (value.pac)
      throw new Error(deployM('deploy_proxySystemUnsupported'))
    if (!value.enabled || !value.server)
      return {}
    const entries = Object.fromEntries(value.server.split(';').map(item => item.includes('=') ? item.split('=', 2) : ['all', item]))
    return { http: entries.http ?? entries.all, https: entries.https ?? entries.http ?? entries.all, bypass: value.bypass?.split(';').filter(item => item !== '<local>').join(',') }
  }
  if (process.platform === 'darwin') {
    const output = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8', timeout: 5000 })
    const get = (key: string): string | undefined => output.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'm'))?.[1]?.trim()
    if (get('ProxyAutoConfigEnable') === '1' || get('ProxyAutoDiscoveryEnable') === '1')
      throw new Error(deployM('deploy_proxySystemUnsupported'))
    return { http: get('HTTPEnable') === '1' ? `http://${get('HTTPProxy')}:${get('HTTPPort')}` : undefined, https: get('HTTPSEnable') === '1' ? `http://${get('HTTPSProxy')}:${get('HTTPSPort')}` : undefined }
  }
  throw new Error(deployM('deploy_proxySystemUnsupported'))
}

/**
 * 解析本次下载使用的代理环境，不写配置、不重启引擎。
 * @param config - 继承进程、读取系统、自定义或禁用代理。
 * @returns 显式覆盖大小写代理变量的环境；远程引擎仍需自身配置代理。
 * @throws Error - 配置非法、系统仅提供 PAC 或平台不支持读取系统代理。
 * @example
 * ```ts
 * import { resolveDownloadProxy } from '@h-ai/deploy'
 * const environment = resolveDownloadProxy({ mode: 'custom', url: 'http://127.0.0.1:10808' })
 * // environment.HTTPS_PROXY 供本次子进程使用，不写进运行镜像。
 * ```
 */
export function resolveDownloadProxy(config?: DownloadProxyConfig): Record<string, string> {
  const mode = config?.mode ?? 'inherit'
  if (!['inherit', 'system', 'custom', 'none'].includes(mode) || (config?.url !== undefined && mode !== 'custom'))
    throw new Error(deployM('deploy_downloadInvalid'))
  const values = mode === 'system'
    ? systemProxy()
    : mode === 'custom'
      ? { http: config?.url, https: config?.url }
      : mode === 'inherit'
        ? { http: process.env.HTTP_PROXY ?? process.env.http_proxy, https: process.env.HTTPS_PROXY ?? process.env.https_proxy, bypass: process.env.NO_PROXY ?? process.env.no_proxy }
        : {}
  if (mode === 'custom' && !config?.url)
    throw new Error(deployM('deploy_downloadInvalid'))
  const normalize = (value?: string): string => {
    if (!value)
      return ''
    try {
      const url = new URL(value.includes('://') ? value : `http://${value}`)
      if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.pathname !== '/' || (mode === 'custom' && (url.username || url.password)))
        throw new Error('Invalid proxy URL')
      return url.toString().replace(/\/$/, '')
    }
    catch { throw new Error(deployM('deploy_downloadInvalid')) }
  }
  const http = normalize(values.http)
  const https = normalize(values.https ?? values.http)
  const bypass = mode === 'none' ? '' : config?.bypass ?? values.bypass ?? ''
  if (/[\r\n\0]/.test(bypass))
    throw new Error(deployM('deploy_downloadInvalid'))
  return { HTTP_PROXY: http, http_proxy: http, HTTPS_PROXY: https, https_proxy: https, NO_PROXY: bypass, no_proxy: bypass, ALL_PROXY: mode === 'inherit' ? process.env.ALL_PROXY ?? process.env.all_proxy ?? '' : '', all_proxy: mode === 'inherit' ? process.env.ALL_PROXY ?? process.env.all_proxy ?? '' : '', FTP_PROXY: mode === 'inherit' ? process.env.FTP_PROXY ?? process.env.ftp_proxy ?? '' : '', ftp_proxy: mode === 'inherit' ? process.env.FTP_PROXY ?? process.env.ftp_proxy ?? '' : '' }
}
