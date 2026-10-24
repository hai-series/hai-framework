/** 在线发布与手工交付共用的服务器执行脚本。远程依赖 Linux flock、基础工具及 Compose。 */
import { createTargetReader } from './deploy-target.js'

/**
 * 将可信配置编码为一个 shell 参数。
 * @param value - 受信值，编码为一个远端 shell 参数。
 * @returns 可作为一个远端 shell 参数的编码文本。
 * @example 模块内部上下文
 * ```ts
 * const encoded = shellArgument("Shop's app") // 整体作为一个远端 shell 参数。
 * ```
 */
export function shellArgument(value: string): string {
  return `'${value.replaceAll('\'', '\'"\'"\'')}'`
}

/**
 * 生成分步执行、增量合并和失败恢复脚本；密钥始终从环境文件读取。
 * 仅生成 Linux 脚本；正常收尾显式释放 FD9 flock，中断时由仍持有描述符的进程树维持。未知旧锁目录不删除，结果仅由取得锁的 owner 发布。
 * @param options - 本次操作选项；字段含义见各子项。
 * @param options.deploymentId - 本次不可变部署标识，用于结果匹配和发布目录。
 * @param options.projectName - 已归一化的项目名称。
 * @param options.environment - 部署环境标识，通常为 prod。
 * @param options.directory - 包含已准备制品或部署文件的目录；具体见函数用途。
 * @param options.runtime - 容器引擎策略；auto 探测可用引擎并优先 Podman。
 * @param options.partial - 是否为增量服务部署；不能据此执行首次全量安装。
 * @param options.selected - 本次选择更新的 Compose 服务。
 * @param options.hostPort - 宿主公开端口。
 * @param options.healthPaths - 允许执行的应用健康检查路径。
 * @returns 待在 Linux 远端运行的 apply 脚本文本。
 * @example 模块内部上下文
 * ```ts
 * const script = createApplyScript({ deploymentId: 'shop-prod-001', projectName: 'shop-prod', environment: 'prod', directory: '/opt/hai/apps/shop-prod', runtime: 'auto', partial: false, selected: ['app'], hostPort: 8080, healthPaths: ['/health'] })
 * ```
 */
export function createApplyScript(options: {
  deploymentId: string
  projectName: string
  environment: string
  directory: string
  runtime: 'auto' | 'docker' | 'podman'
  partial: boolean
  selected: string[]
  hostPort: number
  healthPaths: string[]
}): string {
  const values: Record<string, string> = {
    ID: shellArgument(options.deploymentId),
    PROJECT: shellArgument(`hai-${options.projectName}`),
    ENV: shellArgument(options.environment),
    RUNTIME: shellArgument(options.runtime),
    PARTIAL: options.partial ? 'true' : 'false',
    SELECTED: shellArgument(options.selected.join(' ')),
    ROOT: shellArgument(options.directory),
    PORT: String(options.hostPort),
    HEALTH: options.healthPaths.map(shellArgument).join(' '),
  }
  return String.raw`#!/bin/sh
# 服务器部署流程：由 deploy-local.sh 或 SSH 入口自动解包后调用，无需手工解包。
# 需要 Linux、sha256sum、tar、awk、curl、flock 和可用的 Docker/Podman Compose；不会联网拉镜像。
# 本次全量/增量及服务清单由生成时的 manifest.json 和下方 partial/selected 固定。
# 增量要求服务器已有成功的全量基线；校验失败不会开始替换服务，失败恢复保留数据卷。
set -eu
umask 077
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
destination=@@ROOT@@
if [ "$#" -gt 0 ]; then destination=$1; fi
root=$(mkdir -p -- "$destination" && CDPATH= cd -- "$destination" && pwd)
id=@@ID@@
project=@@PROJECT@@
export HAI_DEPLOY_ENVIRONMENT=@@ENV@@
runtime=@@RUNTIME@@
partial=@@PARTIAL@@
orphan_option=''
if [ "$partial" = false ]; then orphan_option=--remove-orphans; fi
recreate_option=--force-recreate
if [ "$partial" = true ]; then recreate_option=--no-recreate; fi
selected=@@SELECTED@@
proxy_update=false
release="$root/releases/$id"
case "$release/" in "$source_dir/"*) printf 'Extract the package outside the deployment directory before applying it.\n' >&2; exit 1;; esac
stage=''
previous=''
restore=''
changed=false
locked=false
interrupted=false
started=$(date +%s)
step_started=$started
step() {
  if [ -n "$stage" ]; then
    duration=$(( $(date +%s) - step_started ))
    printf '[PASS] %s (%ss)\n' "$stage" "$duration"
    printf '{"stage":"%s","status":"passed","durationSeconds":%s}\n' "$stage" "$duration" >> "$root/steps-$id.jsonl"
  fi
  stage="$1"
  step_started=$(date +%s)
  printf '\n[%s] %s\n' "$stage" "$2"
}
compose() {
  arguments_file="$release/compose-files"
  if [ -n "$restore" ]; then arguments_file="$root/releases/$restore/compose-files"; fi
  # -f 按顺序合并，由 Compose 保留未选服务、卷和环境文件，不自行拼装配置。
  command_args="$release/.compose-command"
  # 文件列表先反向读取，再向参数头部加入，保留原始合并顺序。
  awk '{lines[NR]=$0} END {for(i=NR;i>0;i--) print lines[i]}' "$arguments_file" > "$command_args"
  while IFS= read -r file; do set -- -f "$file" "$@"; done < "$command_args"
  "$runtime" compose -p "$project" "$@"
}
remove_selected() {
  test "$partial" = true || return 0
  # 直接替换选中容器，避免 Compose Provider 连带重建依赖它的未选服务；不删除卷。
  for service in "$@"; do
    containers=$("$runtime" ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service") || return 1
    for container in $containers; do
      "$runtime" rm -f "$container" || return 1
    done
  done
}
finish() {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$code" -ne 0 ]; then
    printf '[FAIL] %s (exit %s)\n' "$stage" "$code" >&2
    if [ "$changed" = true ]; then
      diagnostics="$root/diagnostics-$id.log"
      : > "$diagnostics"
      for service in $selected; do
        containers=$("$runtime" ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service" || true)
        for container in $containers; do
          "$runtime" inspect --format '{{.Name}} {{.State.Status}} exit={{.State.ExitCode}}' "$container" >> "$diagnostics" 2>&1 || true
          "$runtime" logs --tail 80 "$container" >> "$diagnostics" 2>&1 || true
        done
      done
      printf 'Startup diagnostics saved to %s (private server file).\n' "$diagnostics" >&2
    fi
    if [ -f "$release/rollback-images" ]; then
      while IFS=' ' read -r image reference; do
        test -n "$reference" || continue
        "$runtime" tag "$image" "$reference" || printf '[FAIL] Cannot restore image %s\n' "$reference" >&2
      done < "$release/rollback-images"
    fi
    if [ "$changed" = true ] && [ -n "$previous" ]; then
      printf '[RECOVER] Restoring previous selected services\n' >&2
      recover_selected=$selected
      if [ "$partial" = false ]; then recover_selected=$(cat "$root/releases/$previous/services"); fi
      restore="$previous"
      if remove_selected $recover_selected && compose up -d --no-deps --no-build --pull never "$recreate_option" $orphan_option $recover_selected; then
        case " $selected " in *' app '*)
          if grep -qx web "$root/releases/$previous/services"; then compose exec -T web nginx -s reload || true; fi
          ;;
        esac
        printf '[RECOVER] Previous containers restored; verify application health\n' >&2
      else
        printf '[FAIL] Recovery failed. Use the previous release and inspect container logs.\n' >&2
      fi
    elif [ "$changed" = true ]; then
      compose stop $selected || true
      printf '[RECOVER] Failed first installation stopped; data volumes retained\n' >&2
    fi
  fi
  if [ "$locked" = true ]; then
    elapsed=$(( $(date +%s) - started ))
    outcome=passed
    if [ "$code" -ne 0 ]; then outcome=failed; fi
    printf '{"stage":"%s","status":"%s","durationSeconds":%s}\n' "$stage" "$outcome" "$(( $(date +%s) - step_started ))" >> "$root/steps-$id.jsonl"
    # 先完整写入再同目录原子发布，SSH 重连核对不能读取到半份终态结果。
    printf '{"deploymentId":"%s","stage":"%s","exitCode":%s,"durationSeconds":%s}\n' "$id" "$stage" "$code" "$elapsed" > "$root/result-$id.json.next"
    mv "$root/result-$id.json.next" "$root/result-$id.json"
    # 前台命令及同步恢复已结束；后台服务可继续运行，但不能使成功终态永久占锁。
    # 中断时仍可能有活跃子命令，必须由全部描述符持有者退出后释放。
    if [ "$interrupted" = false ]; then
      flock -u 9
      exec 9>&-
    fi
  fi
  exit "$code"
}
trap finish EXIT
trap 'interrupted=true; exit 130' HUP INT TERM
step preflight 'Checking deployment tools and package'
for tool in sha256sum tar awk curl flock; do command -v "$tool" >/dev/null || { printf 'Required command missing: %s\n' "$tool" >&2; exit 1; }; done
if [ "$runtime" = auto ]; then
  if command -v podman >/dev/null 2>&1 && podman version >/dev/null 2>&1; then runtime=podman; else runtime=docker; fi
fi
case "$runtime" in docker|podman) ;; *) printf 'Runtime must be docker or podman\n' >&2; exit 1;; esac
"$runtime" version >/dev/null
"$runtime" compose version >/dev/null
"$runtime" compose up --help | grep -q never || { printf 'Compose is too old. Install Docker Compose v2 or podman-compose 1.6.0 or newer (supports --pull never).\n' >&2; exit 1; }
# 内核锁绑定同一文件描述符；绝不删除/替换锁文件，避免新 inode 绕过活跃部署。
# 子命令继承 FD 9：即使父 shell 被强杀，仍执行的命令继续持锁；全部退出或重启后自动释放。
exec 9>"$root/.deploy.lock"
if flock -n 9; then
  :
else
  lock_code=$?
  if [ "$lock_code" -eq 1 ]; then
    printf 'Another deployment is running. Wait for its commands to finish; do not remove %s/.deploy.lock.\n' "$root" >&2
  else
    printf 'Cannot acquire deployment lock (exit %s). Check filesystem flock support and permissions.\n' "$lock_code" >&2
  fi
  exit "$lock_code"
fi
locked=true
cd "$source_dir"
sha256sum -c SHA256SUMS
if [ -f "$root/current" ]; then
  previous=$(cat "$root/current")
  case "$previous" in ''|*[!a-zA-Z0-9._-]*) printf 'Invalid deployment state\n' >&2; exit 1;; esac
  test -f "$root/releases/$previous/compose-files"
fi
if [ "$partial" = true ]; then
  test -n "$previous" || { printf 'Partial deployment requires a successful full installation. Deploy a complete bundle first.\n' >&2; exit 1; }
  if ! cmp -s layout "$root/releases/$previous/layout"; then
    # 容量调整允许复用已部署 Web 镜像；端口、路由及其余代理策略仍要求全量部署。
    test "$(awk -F: '{print $1 ":" $2 ":" $3}' layout)" = "$(awk -F: '{print $1 ":" $2 ":" $3}' "$root/releases/$previous/layout")" || { printf 'Ports or application layout changed. Create a full deployment bundle.\n' >&2; exit 1; }
    test -f web.conf && test -f proxy-entry.json || { printf 'Proxy configuration missing. Create a full deployment bundle.\n' >&2; exit 1; }
    previous_proxy=
    while IFS= read -r compose_file; do
      candidate_proxy="$(dirname -- "$compose_file")/web.conf"
      if [ -f "$candidate_proxy" ]; then previous_proxy=$candidate_proxy; fi
    done < "$root/releases/$previous/compose-files"
    test -n "$previous_proxy" || { printf 'Proxy baseline missing. Create a full deployment bundle.\n' >&2; exit 1; }
    previous_shape=$(sed 's/client_max_body_size [0-9][0-9]*;/client_max_body_size TRANSPORT;/' "$previous_proxy" | sha256sum)
    current_shape=$(sed 's/client_max_body_size [0-9][0-9]*;/client_max_body_size TRANSPORT;/' web.conf | sha256sum)
    test "$previous_shape" = "$current_shape" || { printf 'API routes or proxy policy changed. Create a full deployment bundle.\n' >&2; exit 1; }
    case " $selected " in *' app ') ;; *) printf 'Transport capacity changes require the app service. Include app in the partial deployment.\n' >&2; exit 1;; esac
    case " $selected " in *' web '*) ;; *) selected="$selected web"; proxy_update=true;; esac
  fi
fi
test ! -e "$release" || { printf 'This deployment ID was already used. Create a new deployment bundle.\n' >&2; exit 1; }
mkdir -p "$release"
cp -R "$source_dir/." "$release/"
# Nginx 以非 root 用户运行；只开放不含凭据的代理配置读取权限。
if [ -f "$release/web.conf" ]; then chmod 644 "$release/web.conf"; fi
: > "$release/compose-files"
if [ "$partial" = true ]; then
  cp "$root/releases/$previous/compose-files" "$release/compose-files"
  cp "$root/releases/$previous/middleware.env" "$release/middleware.env"
  for service in $selected; do
    grep -qx "$service" "$root/releases/$previous/services" || { printf 'Service %s has no installed baseline. Use a full deployment.\n' "$service" >&2; exit 1; }
  done
fi
printf '%s\n' "$release/compose-entry.json" >> "$release/compose-files"
if [ "$proxy_update" = true ]; then
  printf '%s\n' "$release/proxy-entry.json" >> "$release/compose-files"
fi
compose config >/dev/null
compose config --services > "$release/services"
: > "$release/rollback-images"
if [ -n "$previous" ]; then
  for service in $selected; do
    containers=$("$runtime" ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service")
    for container in $containers; do
      "$runtime" inspect --format '{{.Image}} {{.Config.Image}}' "$container" >> "$release/rollback-images"
    done
  done
fi
step images 'Loading packaged images (no registry access)'
while IFS=' ' read -r archive reference; do
  test -n "$archive" || continue
  "$runtime" load -i "$release/images/$archive"
  "$runtime" image inspect "$reference" >/dev/null
  architecture=$("$runtime" image inspect --format '{{.Architecture}}' "$reference")
  host_arch=$(uname -m)
  case "$host_arch:$architecture" in x86_64:amd64|aarch64:arm64) ;; *) printf 'Image architecture %s does not match server %s\n' "$architecture" "$host_arch" >&2; exit 1;; esac
done < "$release/image-list"
step dependencies 'Checking dependencies of selected services'
if [ "$partial" = true ]; then cat "$release/services" >> "$release/dependencies"; fi
while IFS= read -r dependency; do
  test -n "$dependency" || continue
  case " $selected " in *" $dependency "*) continue;; esac
  running=$("$runtime" ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$dependency")
  test -n "$running" || { printf 'Dependency %s is not running. Include it in a full deployment.\n' "$dependency" >&2; exit 1; }
  for container in $running; do
    test "$("$runtime" inspect --format '{{.State.Running}}' "$container")" = true || { printf 'Dependency %s is stopped. Start it before retrying.\n' "$dependency" >&2; exit 1; }
  done
done < "$release/dependencies"
step start 'Updating selected services'
changed=true
remove_selected $selected
compose up -d --no-deps --no-build --pull never "$recreate_option" $orphan_option $selected
case " $selected " in
  *' app '*)
    case " $selected " in *' web '*) ;; *)
      if grep -qx web "$release/services"; then compose exec -T web nginx -s reload; fi
    esac
    ;;
esac
step health 'Checking HTTP access'
for path in @@HEALTH@@; do
  ready=false
  attempt=0
  while [ "$attempt" -lt 40 ]; do
    if curl --noproxy '*' -fsS --max-time 5 "http://127.0.0.1:@@PORT@@$path" >/dev/null 2>&1; then ready=true; break; fi
    attempt=$((attempt + 1))
    sleep 3
  done
  test "$ready" = true || { printf 'HTTP check failed: %s. Inspect compose logs for selected services.\n' "$path" >&2; exit 1; }
done
step complete 'Deployment passed all checks'
printf '%s\n' "$id" > "$root/current.next"
mv "$root/current.next" "$root/current"
printf '[PASS] %s\n' "$id"
`.replace(/@@([A-Z]+)@@/g, (_match, name: string) => values[name]!)
}

/**
 * 生成无 Node/pnpm 依赖的上传脚本；换电脑时可覆盖 SSH 私钥路径。
 * Windows PowerShell 5 会丢弃原生参数内部引号，须直接按 Win32 规则构造命令行。
 * 两个入口执行时读取旁边的 deploy-target.json；apply 阶段 SSH 失败仍须核对远端状态。
 * @returns Linux shell、Windows PowerShell 上传入口及 POSIX awk 配置读取器文本。
 * @example 模块内部上下文
 * ```ts
 * const scripts = createUploadScripts()
 * const files = { 'deploy.sh': scripts.sh, 'deploy.ps1': scripts.ps1, 'read-target.awk': scripts.reader }
 * // 将三个文件与 deploy-target.json 放在操作目录；生成文本不代表已部署。
 * ```
 */
export function createUploadScripts(): { sh: string, ps1: string, reader: string } {
  const sh = String.raw`#!/bin/sh
# 操作机上传入口：整个交付目录可直接复制；tar、deploy-target.json 与本脚本须放在同一目录。
# 先修改 deploy-target.json 的服务器、用户、密钥路径；需要 sh、awk 及 OpenSSH 的 ssh/scp。
# 执行：sh deploy.sh [主机 [端口 [用户]]]；可用 HAI_DEPLOY_IDENTITY_FILE 覆盖当前电脑的私钥。
# manifest.json 的 partial/selectedServices 说明本次模式；服务器会核验增量基线，上传后自动部署并检查 HTTP。
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$source_dir"
command -v awk >/dev/null || { printf 'Install POSIX awk to read deploy-target.json.\n' >&2; exit 1; }
read_target() {
  LC_ALL=C awk -v field="$1" -v expected="$2" -v fallback="$3" -f "$source_dir/read-target.awk" "$source_dir/deploy-target.json"
}
host=$(read_target host string SERVER_HOST)
user=$(read_target username string deploy)
port=$(read_target port number 22)
remote=$(read_target directory string '')
bundle=$(read_target bundle string '')
identity=$(read_target identityFile string '')
known_hosts=$(read_target knownHostsFile string '')
strict=$(read_target strictHostKeyChecking boolean true)
timeout=$(read_target connectTimeoutSeconds number 10)
if [ "$#" -ge 1 ]; then host=$1; fi
if [ "$#" -ge 2 ]; then port=$2; fi
if [ "$#" -ge 3 ]; then user=$3; fi
if value=$(printenv HAI_DEPLOY_IDENTITY_FILE) && [ -n "$value" ]; then identity=$value; fi
if value=$(printenv HAI_DEPLOY_KNOWN_HOSTS_FILE) && [ -n "$value" ]; then known_hosts=$value; fi
invalid_target() { printf 'Invalid deployment target. Edit deploy-target.json before running this script.\n' >&2; exit 1; }
test "$host" != SERVER_HOST || { printf 'Specify the server: sh deploy.sh SERVER [PORT] [USER].\n' >&2; exit 1; }
case "$host" in ''|*[!a-zA-Z0-9.:-]*|[!a-zA-Z0-9]*) invalid_target;; esac
case "$user" in ''|*[!a-zA-Z0-9_-]*|[!a-zA-Z_]*) invalid_target;; esac
case "$port" in ''|*[!0-9]*|???????????*) invalid_target;; esac
test "$port" -ge 1 && test "$port" -le 65535 || invalid_target
case "$timeout" in ''|*[!0-9]*|???????????*) invalid_target;; esac
test "$timeout" -ge 1 && test "$timeout" -le 2147483647 || invalid_target
case "$remote" in /*) ;; *) invalid_target;; esac
case "$remote" in *[!a-zA-Z0-9/_.\ -]*|*/../*|*/..|/..) invalid_target;; esac
case "$bundle" in *.tar) ;; *) invalid_target;; esac
case "$bundle" in ''|*[!a-zA-Z0-9_.+-]*) invalid_target;; esac
case "$strict" in true) strict=accept-new;; false) strict=no;; *) invalid_target;; esac
test -f "./$bundle" || { printf 'Bundle missing: %s\n' "$bundle" >&2; exit 1; }
for tool in ssh scp; do command -v "$tool" >/dev/null || { printf 'Install OpenSSH (%s).\n' "$tool" >&2; exit 1; }; done
set -- -o BatchMode=yes -o "StrictHostKeyChecking=$strict" -o "ConnectTimeout=$timeout"
if [ -n "$identity" ]; then set -- "$@" -i "$identity" -o IdentitiesOnly=yes; fi
if [ -n "$known_hosts" ]; then
  known_hosts=$(printf '%s' "$known_hosts" | sed 's/[\\"]/\\&/g')
  set -- "$@" -o "UserKnownHostsFile=\"$known_hosts\""
fi
printf '[1/3] Connecting to %s\n' "$host"
ssh "$@" -p "$port" "$user@$host" "mkdir -p '$remote/incoming' && chmod 700 '$remote' '$remote/incoming'"
printf '[2/3] Uploading %s\n' "$bundle"
scp_host=$host
case "$host" in *:*) scp_host="[$host]";; esac
scp "$@" -P "$port" "./$bundle" "$user@$scp_host:$remote/incoming/$bundle"
printf '[3/3] Applying package and checking HTTP access\n'
if ssh "$@" -p "$port" "$user@$host" "cd '$remote/incoming' && mkdir -p '$bundle.contents' && tar -xf '$bundle' -C '$bundle.contents' && sh '$bundle.contents/apply.sh' '$remote'"; then
  :
else
  code=$?
  printf '[UNKNOWN] Remote execution may continue. Inspect %s/result-<deploymentId>.json (ID in manifest.json), current and containers before retrying.\n' "$remote" >&2
  exit "$code"
fi
`
  const ps1 = String.raw`<#
操作机上传入口：复制整个交付目录后，先修改同目录 deploy-target.json 的服务器、用户和密钥路径。
需要 Windows PowerShell 5+/PowerShell 及 OpenSSH 的 ssh/scp；tar 必须与本脚本放在同一目录。
执行：powershell -File .\deploy.ps1 [-IdentityFile 当前电脑的私钥路径]。
manifest.json 的 partial/selectedServices 标明全量或增量；服务器会检查基线，上传后自动部署并核验 HTTP。
SSH 中断时先核对远端结果文件和容器状态，再决定是否重试。
#>
param([string]$IdentityFile = $env:HAI_DEPLOY_IDENTITY_FILE)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$target = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'deploy-target.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($target.host -eq 'SERVER_HOST') { throw 'Set the server host in deploy-target.json.' }
if ($target.host -isnot [string] -or $target.host -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.:-]*$' -or $target.username -isnot [string] -or $target.username -notmatch '^[a-zA-Z_][a-zA-Z0-9_-]*$' -or $target.directory -isnot [string] -or $target.directory -notmatch '^/[a-zA-Z0-9/_. -]*$' -or $target.directory -match '(^|/)\.\.(/|$)' -or $target.bundle -isnot [string] -or $target.bundle -notmatch '^[a-zA-Z0-9_.+-]+\.tar$') { throw 'Invalid deployment target.' }
$port = if ($null -eq $target.port) { 22 } else { $target.port }
$timeout = if ($null -eq $target.connectTimeoutSeconds) { 10 } else { $target.connectTimeoutSeconds }
if ($port -is [string] -or [string]$port -notmatch '^[0-9]+$' -or $port -lt 1 -or $port -gt 65535 -or $timeout -is [string] -or [string]$timeout -notmatch '^[0-9]+$' -or $timeout -lt 1 -or $timeout -gt 2147483647) { throw 'Invalid deployment port or timeout.' }
if ($null -ne $target.strictHostKeyChecking -and $target.strictHostKeyChecking -isnot [bool]) { throw 'Invalid host key policy.' }
if (($null -ne $target.identityFile -and $target.identityFile -isnot [string]) -or ($null -ne $target.knownHostsFile -and $target.knownHostsFile -isnot [string])) { throw 'Invalid SSH file path.' }
$strict = if ($target.strictHostKeyChecking -eq $false) { 'no' } else { 'accept-new' }
$options = @('-o', 'BatchMode=yes', '-o', "StrictHostKeyChecking=$strict", '-o', "ConnectTimeout=$timeout")
if (-not $IdentityFile) { $IdentityFile = $target.identityFile }
if ($IdentityFile) { $options += @('-i', $IdentityFile, '-o', 'IdentitiesOnly=yes') }
$knownHosts = if ($env:HAI_DEPLOY_KNOWN_HOSTS_FILE) { $env:HAI_DEPLOY_KNOWN_HOSTS_FILE } else { $target.knownHostsFile }
if ($knownHosts) {
  $knownHosts = $knownHosts.Replace('\', '\\').Replace('"', '\"')
  $options += @('-o', ('UserKnownHostsFile="' + $knownHosts + '"'))
}
$destination = "$($target.username)@$($target.host)"
$scpDestination = if ($target.host.Contains(':')) { "$($target.username)@[$($target.host)]" } else { $destination }
$remote = $target.directory
$bundle = $target.bundle
if (-not (Test-Path -LiteralPath "./$bundle" -PathType Leaf)) { throw "Bundle missing: $bundle" }
function ConvertTo-NativeArgument([string]$Value) {
  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}
function Invoke-Step([string]$Name, [string]$Command, [string[]]$Arguments) {
  Write-Host "[$Name]"
  $nativeCommand = Get-Command $Command -ErrorAction Stop
  if ($PSVersionTable.PSVersion.Major -lt 6 -and $nativeCommand.CommandType -eq 'Application') {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $nativeCommand.Source
    $start.WorkingDirectory = (Get-Location).ProviderPath
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.Arguments = ($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
    $child = [System.Diagnostics.Process]::Start($start)
    try { $child.WaitForExit(); $code = $child.ExitCode } finally { $child.Dispose() }
  } else {
    & $Command @Arguments
    $code = $LASTEXITCODE
  }
  $global:LASTEXITCODE = $code
  if ($code -ne 0) { throw "$Name failed (exit $code)." }
}
$applying = $false
try {
  foreach ($tool in @('ssh', 'scp')) { Get-Command $tool -ErrorAction Stop | Out-Null }
  Invoke-Step '1/3 Connect' 'ssh' ($options + @('-p', [string]$port, $destination, "mkdir -p '$remote/incoming' && chmod 700 '$remote' '$remote/incoming'"))
  Invoke-Step '2/3 Upload' 'scp' ($options + @('-P', [string]$port, "./$bundle", "$($scpDestination):$remote/incoming/$bundle"))
  $applying = $true
  Invoke-Step '3/3 Apply and verify HTTP' 'ssh' ($options + @('-p', [string]$port, $destination, "cd '$remote/incoming' && mkdir -p '$bundle.contents' && tar -xf '$bundle' -C '$bundle.contents' && sh '$bundle.contents/apply.sh' '$remote'"))
} catch {
  if ($applying) { [Console]::Error.WriteLine("[UNKNOWN] Remote execution may continue. Inspect $remote/result-<deploymentId>.json (ID in manifest.json), current and containers before retrying.") }
  Write-Error $_
  exit 1
}
`
  return { sh, ps1, reader: createTargetReader() }
}

/**
 * 生成服务器本地入口，自动解包后调用同一 apply 流程。
 * @param options - 同目录 tar 名称和默认服务器部署目录；都由已校验的部署配置生成。
 * @param options.bundle - 不含目录的 tar 文件名。
 * @param options.directory - 服务器部署目录，执行时可用第一个参数覆盖。
 * @returns 不依赖 Node、pnpm、SSH 或手工解包的 POSIX shell 脚本。
 * @example 模块内部上下文
 * ```ts
 * const script = createLocalInstallScript({ bundle: 'bundle-shop-1.0.0.tar', directory: '/opt/hai/apps/shop-prod' })
 * // 保存为与 tar 同目录的 deploy-local.sh，目标 Linux 直接执行 sh deploy-local.sh。
 * ```
 */
export function createLocalInstallScript(options: { bundle: string, directory: string }): string {
  return String.raw`#!/bin/sh
# 目标服务器本地入口：把整个交付目录复制到 Linux，直接执行 sh deploy-local.sh [服务器部署目录]。
# 自动解包到本次独立临时目录并调用 apply.sh；不需要手工解包，也不需要 SSH、Node 或 pnpm。
# 需要 tar、mktemp 和 apply.sh 所列的容器运行环境；全量/增量由 manifest.json 固定，增量要求已有成功基线。
# 执行日志保留在本交付目录，退出时只清理本次临时解包目录，业务数据由 apply.sh 保留。
set -eu
umask 077
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bundle=@@BUNDLE@@
destination=@@DIRECTORY@@
if [ "$#" -gt 0 ]; then destination=$1; fi
for tool in tar mktemp date; do command -v "$tool" >/dev/null || { printf 'Required command missing: %s\n' "$tool" >&2; exit 1; }; done
test -f "$source_dir/$bundle" || { printf 'Bundle missing: %s\n' "$bundle" >&2; exit 1; }
log="$source_dir/deploy-local-$(date +%Y%m%d-%H%M%S)-$$.log"
temporary=$(mktemp -d /tmp/hai-deploy.XXXXXX)
cleanup() { rm -rf -- "$temporary"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
printf 'Deployment log: %s\n' "$log"
if (tar -xf "$source_dir/$bundle" -C "$temporary" && sh "$temporary/apply.sh" "$destination") > "$log" 2>&1; then
  cat "$log"
else
  code=$?
  cat "$log" >&2
  exit "$code"
fi
`.replace('@@BUNDLE@@', shellArgument(options.bundle)).replace('@@DIRECTORY@@', shellArgument(options.directory))
}
