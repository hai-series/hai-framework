/** HTTPS 的证书交付、Nginx 入口和 Certbot 生命周期；所有应用类型共用。 */
import type { DockerSshProviderConfig } from '../deploy-config.js'
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { deployM } from '../deploy-i18n.js'
import { shellArgument } from './deploy-shell.js'

/**
 * 官方 Certbot 客户端的固定版本，随离线包导出，目标服务器不拉取镜像。
 * @example 模块内部上下文
 * ```ts
 * const certbotImage = CERTBOT_IMAGE
 * ```
 */
export const CERTBOT_IMAGE = 'docker.io/certbot/certbot:v5.9.0'
/**
 * Docker SSH 入口已校验的 HTTPS 配置。
 * @example 模块内部上下文
 * ```ts
 * const https: HttpsConfig = { type: 'files', domain: 'app.example.com', port: 443, redirectHttp: true, certificateFile: './tls/fullchain.pem', privateKeyFile: './tls/privkey.pem' }
 * ```
 */
type HttpsConfig = NonNullable<DockerSshProviderConfig['expose']['https']>

/**
 * 校验本地 PEM 并生成受保护的部署附件；异常不包含证书或私钥原文。
 * @param config - 已解析的 HTTPS 设置。
 * @param projectDirectory - 相对证书路径的工程根。
 * @returns 包内附件；私钥只能保存到私密交付目录，不能复制到构建上下文。
 * @example 模块内部上下文
 * ```ts
 * // 申请脚本由实际 HTTPS 配置生成，不在示例中请求证书。
 * const assets = createHttpsAssets({ type: 'letsencrypt', domain: 'app.example.com', port: 443, redirectHttp: true, email: 'ops@example.com', acceptTerms: true }, '.')
 * ```
 */
export function createHttpsAssets(config: HttpsConfig, projectDirectory: string): Record<string, string> {
  const assets: Record<string, string> = {
    https: `${config.domain} ${config.port} ${config.type}\n`,
  }
  if (config.type === 'files') {
    try {
      const readPem = (file: string): string => {
        const path = resolve(projectDirectory, file)
        if (!statSync(path).isFile() || statSync(path).size > 1048576)
          throw new Error('Invalid PEM file')
        return readFileSync(path, 'utf8')
      }
      const certificate = readPem(config.certificateFile)
      const key = readPem(config.privateKeyFile)
      const parsed = new X509Certificate(certificate)
      const publicKey = createPublicKey(createPrivateKey(key)).export({ type: 'spki', format: 'der' })
      const now = Date.now()
      if (!publicKey.equals(parsed.publicKey.export({ type: 'spki', format: 'der' }))
        || now < Date.parse(parsed.validFrom) || now >= Date.parse(parsed.validTo)
        || !(isIP(config.domain) ? parsed.checkIP(config.domain) : parsed.checkHost(config.domain))) {
        throw new Error('Certificate validation failed')
      }
      assets['tls/fullchain.pem'] = certificate
      assets['tls/privkey.pem'] = key
    }
    catch {
      throw new Error(deployM('deploy_httpsCertificateInvalid'))
    }
  }
  else {
    assets['renew-https.sh'] = createRenewScript(config)
  }
  assets['prepare-https.sh'] = createPrepareScript(config)
  assets['https-start.sh'] = String.raw`#!/bin/sh
set -eu
# 目录挂载允许原子替换证书；只有新证书通过 nginx -t 才重载。
watch_certificate() {
  previous=$(sha256sum /etc/nginx/tls/fullchain.pem)
  while sleep 60; do
    current=$(sha256sum /etc/nginx/tls/fullchain.pem) || continue
    if [ "$previous" != "$current" ]; then
      if nginx -t && nginx -s reload; then previous=$current; else printf '[ERROR] HTTPS certificate reload failed\n' >&2; fi
    fi
  done
}
watch_certificate &
exec /docker-entrypoint.sh nginx -g 'daemon off;'
`
  return assets
}

/**
 * 为已有静态/反向代理配置添加 TLS；健康检查和 ACME 挑战仍可通过内部 HTTP 入口访问。
 * @param source - 已校验的、仅含一个入口 server 的 Nginx 配置。
 * @param config - HTTPS 设置。
 * @param httpPort - Nginx 容器内原有监听端口。
 * @returns TLS 入口与 HTTP 跳转/挑战配置。
 * @example 模块内部上下文
 * ```ts
 * const https: HttpsConfig = { type: 'files', domain: 'app.example.com', port: 443, redirectHttp: true, certificateFile: './tls/fullchain.pem', privateKeyFile: './tls/privkey.pem' }
 * const nginx = renderHttpsProxy('server { listen 8080; server_name _; }', https, 8080)
 * ```
 */
export function renderHttpsProxy(source: string, config: HttpsConfig, httpPort: number): string {
  const publicPort = config.port === 443 ? '' : `:${config.port}`
  const challenge = '  location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }\n'
  const tls = source
    .replace(`listen ${httpPort};`, `listen ${httpPort === 8443 ? 8444 : 8443} ssl;\n  ssl_certificate /etc/nginx/tls/fullchain.pem;\n  ssl_certificate_key /etc/nginx/tls/privkey.pem;`)
    .replace('server_name _;', `server_name ${config.domain};`)
    .replaceAll('proxy_set_header X-Forwarded-Proto $scheme;', 'proxy_set_header X-Forwarded-Proto https;')
  const http = config.redirectHttp
    ? `server {\n  listen ${httpPort};\n  server_name ${config.domain};\n${challenge}  location ~ ^/_hai/(web-health|gateway-health)$ { access_log off; return 200 'ok'; }\n  location / { return 308 https://${config.domain}${publicPort}$request_uri; }\n}\n`
    : source.slice(source.indexOf('server {')).replace('server_name _;', `server_name ${config.domain};\n${challenge}`)
  return `${tls}\n${http}`
}

/** 签发成功后才覆盖公开目录；目录上层为 0700，Nginx 只读挂载证书子目录。 */
const publishCertificate = String.raw`publish_certificate() {
  certificate="/etc/letsencrypt/live/$domain"
  test -s "$certificate/fullchain.pem" && test -s "$certificate/privkey.pem"
  cp "$certificate/fullchain.pem" /output/fullchain.pem.next
  cp "$certificate/privkey.pem" /output/privkey.pem.next
  chmod 444 /output/fullchain.pem.next /output/privkey.pem.next
  mv /output/privkey.pem.next /output/privkey.pem
  mv /output/fullchain.pem.next /output/fullchain.pem
}
`

function createRenewScript(config: Extract<HttpsConfig, { type: 'letsencrypt' }>): string {
  return `#!/bin/sh\nset -eu\ndomain=${shellArgument(config.domain)}\n${publishCertificate}${String.raw`
trap 'exit 0' TERM INT
# Certbot 自己判断到期时间；同一官方客户端同时负责申请与续期，不实现 ACME 协议。
while :; do
  if certbot renew --cert-name "$domain" --non-interactive; then
    if [ -s "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
      current=$(sha256sum "/etc/letsencrypt/live/$domain/fullchain.pem" | awk '{print $1}')
      installed=$(sha256sum /output/fullchain.pem | awk '{print $1}')
      if [ "$current" != "$installed" ]; then publish_certificate; fi
    fi
  else
    printf '[ERROR] Certbot renewal failed; the existing certificate remains installed\n' >&2
  fi
  sleep 43200 & wait $! || exit 0
done
`}`
}

function createPrepareScript(config: HttpsConfig): string {
  const header = `#!/bin/sh\nset -eu\numask 077\nroot=$1\nrelease=$2\nruntime=$3\nmode=$4\ndomain=${shellArgument(config.domain)}\n`
  if (config.type === 'files') {
    return header + String.raw`
test "$mode" != prepare || {
  # 宿主 root/release 保持私密；容器仅可读取独立挂载的证书目录。
  chmod 700 "$root" "$release"
  chmod 755 "$release/.hai/tls"
  chmod 444 "$release/.hai/tls/fullchain.pem" "$release/.hai/tls/privkey.pem"
}
`
  }
  const python = [
    'from cryptography import x509',
    'from cryptography.x509.oid import NameOID',
    'from cryptography.hazmat.primitives import hashes, serialization',
    'from cryptography.hazmat.primitives.asymmetric import ec',
    'from datetime import datetime, timedelta, timezone',
    'from pathlib import Path',
    'import sys',
    'name=sys.argv[1]',
    'key=ec.generate_private_key(ec.SECP256R1())',
    'subject=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,name)])',
    'now=datetime.now(timezone.utc)',
    'cert=x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(days=1)).add_extension(x509.SubjectAlternativeName([x509.DNSName(name)]),False).sign(key,hashes.SHA256())',
    'Path("/output/privkey.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))',
    'Path("/output/fullchain.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))',
  ].join('\n')
  const publish = `set -eu\ndomain=${shellArgument(config.domain)}\n${publishCertificate}\npublish_certificate\n`
  return `${header}image=${shellArgument(CERTBOT_IMAGE)}\nemail=${shellArgument(config.email)}\nbootstrap=${shellArgument(python)}\n${String.raw`
state="$root/https"
certificates="$state/certificates/$domain"
mkdir -p "$state/acme" "$state/webroot" "$certificates"
chmod 700 "$root" "$state" "$state/acme"
chmod 755 "$state/webroot" "$certificates"
if [ "$mode" = prepare ]; then
  if [ ! -s "$certificates/fullchain.pem" ] || [ ! -s "$certificates/privkey.pem" ]; then
    if [ "$5" = true ]; then printf 'HTTPS certificate state missing; create a full deployment.\n' >&2; exit 1; fi
    # 临时证书只用于启动挑战入口；签发失败不得提交 current。
    "$runtime" run --rm --pull never --entrypoint python -v "$certificates:/output" "$image" -c "$bootstrap" "$domain"
    chmod 444 "$certificates/fullchain.pem" "$certificates/privkey.pem"
  fi
elif [ "$mode" = issue ]; then
  "$runtime" run --rm --pull never -v "$state/acme:/etc/letsencrypt" -v "$state/webroot:/var/www/certbot" "$image" certonly --webroot --webroot-path /var/www/certbot --cert-name "$domain" --domain "$domain" --email "$email" --agree-tos --non-interactive --keep-until-expiring
  "$runtime" run --rm --pull never --entrypoint sh -v "$state/acme:/etc/letsencrypt:ro" -v "$certificates:/output" "$image" -c `}${shellArgument(publish)}\nfi\n`
}
