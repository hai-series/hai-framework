/** Nginx 镜像入口钩子：准备当前容器 DNS，HTTPS 时同时监视原子替换的证书。 */

/**
 * 启动前从容器 resolv.conf 生成动态上游的解析器配置，不假定 Docker 或 Podman 的 DNS 地址。
 * @param https - 是否启动证书变更监视。
 * @returns 只依赖 POSIX Shell、awk 和 Nginx 的入口钩子，由镜像原入口执行后继续启动应用。
 * @example 模块内部上下文
 * ```ts
 * const script = createProxyStartupScript(false)
 * void script
 * ```
 */
export function createProxyStartupScript(https: boolean): string {
  return String.raw`#!/bin/sh
set -eu
# 容器引擎提供实际 DNS；IPv6 地址使用 Nginx 需要的方括号形式。
awk '
  $1 == "nameserver" {
    if ($2 !~ /^[0-9A-Fa-f:.]+$/) exit 1
    address = $2
    if (index(address, ":")) address = "[" address "]"
    addresses = addresses " " address
    count++
  }
  END {
    if (!count) exit 1
    print "resolver" addresses " valid=5s;"
    print "resolver_timeout 5s;"
  }
' /etc/resolv.conf > /tmp/hai-dns.conf
${https
  ? String.raw`# 目录挂载允许原子替换证书；只有新证书通过 nginx -t 才重载。
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
`
  : ''}
`
}
