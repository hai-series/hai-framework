/** 在线发布与手工交付共用的服务器执行脚本。远程依赖 Linux flock、基础工具及 Compose。 */
import { deployM } from '../deploy-i18n.js'
import { windowsAskpassSource } from './deploy-ssh-askpass.js'
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
 * @param options.primaryService - 主运行服务角色，用于定位私有运行环境与启动提示。
 * @returns 待在 Linux 远端运行的 apply 脚本文本。
 * @example 模块内部上下文
 * ```ts
 * const script = createApplyScript({ deploymentId: 'shop-prod-001', projectName: 'shop-prod', environment: 'prod', directory: '/opt/hai/apps/shop-prod', runtime: 'auto', partial: false, selected: ['serv'], hostPort: 8080, healthPaths: ['/health'] })
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
  primaryService?: 'serv' | 'web'
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
    PRIMARY: options.primaryService ?? 'serv',
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
wait_services() {
  for waiting_service in "$@"; do
    ready=false
    attempt=0
    while [ "$attempt" -lt 60 ]; do
      containers=$("$runtime" ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$waiting_service") || return 1
      test -n "$containers" || { printf 'Service %s is not running. Inspect its startup diagnostics.\n' "$waiting_service" >&2; return 1; }
      ready=true
      for container in $containers; do
        running=$("$runtime" inspect --format '{{.State.Running}}' "$container") || return 1
        test "$running" = true || { printf 'Service %s stopped during startup.\n' "$waiting_service" >&2; return 1; }
        health=$("$runtime" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container") || return 1
        # 独立 Podman 可能没有 systemd 调度；主动探测后重读状态，失败不能放行业务。
        case "$runtime:$health" in
          podman:starting|podman:unhealthy|podman:healthy)
            probe_ready=false
            if "$runtime" healthcheck run "$container" >/dev/null 2>&1; then probe_ready=true; fi
            health=$("$runtime" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container") || return 1
            # 当前探测失败不能依赖旧 healthy 状态放行。
            if [ "$probe_ready" != true ] && [ "$health" = healthy ]; then health=starting; fi
            ;;
        esac
        case "$health" in
          healthy|none) ;;
          unhealthy) printf 'Service %s is unhealthy. Inspect its startup diagnostics.\n' "$waiting_service" >&2; return 1;;
          *) ready=false;;
        esac
      done
      if [ "$ready" = true ]; then break; fi
      attempt=$((attempt + 1))
      sleep 2
    done
    test "$ready" = true || { printf 'Service %s did not become ready before the startup deadline.\n' "$waiting_service" >&2; return 1; }
  done
}
start_services() {
  middleware_services=''
  application_services=''
  application_orphan_option=$orphan_option
  for service in "$@"; do
    case "$service" in serv|web) ;; *) middleware_services="$middleware_services $service";; esac
  done
  if [ -n "$middleware_services" ]; then
    compose up -d --no-deps --no-build --pull never "$recreate_option" $orphan_option $middleware_services || return 1
    wait_services $middleware_services || return 1
    # Podman Compose 按本批服务清理孤立容器；后批不能删除已经就绪的中间件。
    application_orphan_option=''
  fi
  # --no-deps 保留未选容器；先等本次中间件就绪，再启动应用和依赖它的 Web。
  case " $* " in *' serv '*) application_services=serv;; esac
  case " $* " in *' web '*) application_services="$application_services web";; esac
  if [ -n "$application_services" ]; then
    compose up -d --no-deps --no-build --pull never "$recreate_option" $application_orphan_option $application_services || return 1
  fi
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
      if remove_selected $recover_selected && start_services $recover_selected; then
        case " $selected " in *' serv '*)
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
    test "$(awk -F: '{print $1 ":" $2 ":" $3 ":" $4}' layout)" = "$(awk -F: '{print $1 ":" $2 ":" $3 ":" $4}' "$root/releases/$previous/layout")" || { printf 'Ports or application layout changed. Create a full deployment bundle.\n' >&2; exit 1; }
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
    case " $selected " in *' serv '*) ;; *) printf 'Transport capacity changes require the serv service. Include serv in the partial deployment.\n' >&2; exit 1;; esac
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
  # 旧版本的生成文件混有镜像原生变量；每项单行，只继承框架连接配置。
  awk '/^HAI_[A-Z0-9_]+=/ { print }' "$root/releases/$previous/middleware.env" > "$release/middleware.env"
  for service in $selected; do
    grep -qx "$service" "$root/releases/$previous/services" || { printf 'Service %s has no installed baseline. Use a full deployment.\n' "$service" >&2; exit 1; }
  done
fi
step credentials 'Resolving server-managed middleware credentials'
sh "$release/resolve-managed-secrets.sh" "$root" "$release" "$runtime"
printf '%s\n' "$release/compose-entry.json" >> "$release/compose-files"
if [ "$proxy_update" = true ]; then
  printf '%s\n' "$release/proxy-entry.json" >> "$release/compose-files"
fi
compose config >/dev/null
compose config --services > "$release/services"
# 增量包依赖已安装的完整基线；先恢复 down/stop 后的服务，使用旧配置和本地镜像，不重建运行中的容器。
if [ "$partial" = true ]; then
  recover=false
  while IFS= read -r service; do
    case " $selected " in *" $service "*) continue;; esac
    containers=$("$runtime" ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service")
    if [ -z "$containers" ]; then recover=true; fi
  done < "$release/services"
  if [ "$recover" = true ]; then
    step recover 'Starting stopped services from the installed baseline'
    restore=$previous
    start_services $(cat "$root/releases/$previous/services")
    restore=''
  fi
fi
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
  wait_services "$dependency"
done < "$release/dependencies"
step start 'Updating selected services'
changed=true
remove_selected $selected
start_services $selected
case " $selected " in
  *' serv '*)
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
case " $selected " in *' @@PRIMARY@@ '*)
  if grep -q '^HAI_ADMIN_DEFAULT_PASSWORD=' "$release/.env.runtime"; then
    printf '[INFO] Initial administrator password source: %s/.env.runtime (HAI_ADMIN_DEFAULT_PASSWORD). Existing users keep their passwords.\n' "$release"
  fi
  ;;
esac
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
# 密码缺失时从终端隐藏输入，需要 stty；输入仅用于本次部署。
# 执行：sh deploy.sh [主机 [端口 [用户]]]；可用 HAI_DEPLOY_IDENTITY_FILE 覆盖当前电脑的私钥。
# tar 内 manifest.json 的 partial/selectedServices 说明本次模式；服务器会核验增量基线，上传后自动部署并检查 HTTP。
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
auth=$(read_target auth string key)
password_env=$(read_target passwordEnv string HAI_DEPLOY_PROVIDER_SSH_PASSWORD)
test -z "$(read_target password string '')" || { printf 'Password values are forbidden in deploy-target.json. Use passwordEnv.\n' >&2; exit 1; }
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
temporary=''
temporary_root=''
upload=''
monitor=''
tty_state=''
cleanup() {
  # 中断隐藏输入时也恢复调用者的终端回显。
  if [ -n "$tty_state" ]; then
    (stty "$tty_state" </dev/tty; printf '\n' >/dev/tty) 2>/dev/null || :
  fi
  if [ -n "$monitor" ]; then kill "$monitor" 2>/dev/null || :; wait "$monitor" 2>/dev/null || :; fi
  if [ -n "$upload" ]; then kill "$upload" 2>/dev/null || :; wait "$upload" 2>/dev/null || :; fi
  if [ -n "$temporary" ]; then
    case "$temporary" in "$temporary_root"/hai-ssh-askpass.*) test ! -L "$temporary" && rm -rf -- "$temporary";; *) return 1;; esac
  fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
case "$auth" in key|password) ;; *) invalid_target;; esac
case "$password_env" in HAI_DEPLOY_[A-Z0-9_]*) ;; *) invalid_target;; esac
case "$password_env" in *[!A-Z0-9_]*) invalid_target;; esac
set -- -o "StrictHostKeyChecking=$strict" -o "ConnectTimeout=$timeout"
if [ "$auth" = password ]; then
  for tool in mktemp mkfifo od; do command -v "$tool" >/dev/null || { printf 'Required command missing: %s\n' "$tool" >&2; exit 1; }; done
  # 后缀哨兵保留末尾换行，以便拒绝 readpass 无法安全传递的 CR/LF。
  password=''
  if password=$(printenv "$password_env" && printf '.'); then
    password=@@PASSWORD_TRIM@@
    password=@@PASSWORD_NEWLINE@@
  fi
  if [ -z "$password" ]; then
    if ! command -v stty >/dev/null || ! ( : </dev/tty >/dev/tty ) 2>/dev/null; then
      printf '%s: %s\n' "$password_env" @@PASSWORD_UNAVAILABLE@@ >&2
      exit 1
    fi
    tty_state=$(stty -g </dev/tty)
    stty -echo </dev/tty
    printf '%s (%s): ' @@PASSWORD_PROMPT@@ "$password_env" >/dev/tty
    if IFS= read -r password </dev/tty; then input_code=0; else input_code=$?; fi
    stty "$tty_state" </dev/tty
    tty_state=''
    printf '\n' >/dev/tty
    if [ "$input_code" -ne 0 ]; then printf '%s\n' @@PASSWORD_CANCELLED@@ >&2; exit 1; fi
  fi
  export HAI_DEPLOY_ASKPASS_PASSWORD="$password"
  if ! LC_ALL=C awk 'BEGIN {p=ENVIRON["HAI_DEPLOY_ASKPASS_PASSWORD"]; exit (length(p) == 0 || length(p) > 1023 || p ~ /[\r\n]/) ? 1 : 0}'; then printf '%s: %s\n' "$password_env" @@PASSWORD_INVALID@@ >&2; exit 1; fi
  umask 077
  temporary_root=$(CDPATH= cd -- "@@TEMP_ROOT@@" && pwd -P)
  temporary=$(mktemp -d "$temporary_root/hai-ssh-askpass.XXXXXXXX")
  cat > "$temporary/askpass.sh" <<'HAI_ASKPASS'
#!/bin/sh
test "@@ASKPASS_PROMPT@@" != confirm || exit 1
test -n "$HAI_DEPLOY_ASKPASS_PASSWORD" || exit 1
printf '%s\n' "$HAI_DEPLOY_ASKPASS_PASSWORD"
HAI_ASKPASS
  chmod 700 "$temporary/askpass.sh"
  export SSH_ASKPASS="$temporary/askpass.sh" SSH_ASKPASS_REQUIRE=force SSH_ASKPASS_PROMPT='' DISPLAY=hai-deploy:0
  set -- "$@" -o BatchMode=no -o PreferredAuthentications=password -o PasswordAuthentication=yes -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1
else
  set -- "$@" -o BatchMode=yes
  if [ -n "$identity" ]; then set -- "$@" -i "$identity" -o IdentitiesOnly=yes; fi
fi
# 固定字节流过滤器最多保留一个密码长度，不把值交给 argv、正则或磁盘。
run_native() {
  if [ "$auth" = key ]; then "$@"; return; fi
  # 每次调用独立管道，允许上传与进度查询并行且保持密码脱敏。
  output=$(mktemp "$temporary/output.XXXXXXXX") || return 1
  rm -f "$output"
  mkfifo "$output" || return 1
  (od -An -v -tu1 "$output" | LC_ALL=C awk '
    BEGIN {secret=ENVIRON["HAI_DEPLOY_ASKPASS_PASSWORD"]; n=length(secret); pending=""}
    {for(i=1;i<=NF;i++) {pending=pending sprintf("%c",$i); while(length(pending)>=n) {
      if(substr(pending,1,n)==secret) {printf "***"; pending=substr(pending,n+1)}
      else {printf "%s",substr(pending,1,1); pending=substr(pending,2)}
    }}}
    END {printf "%s",pending}') &
  filter=$!
  if "$@" > "$output" 2>&1; then code=0; else code=$?; fi
  if ! wait "$filter"; then printf 'Cannot filter SSH output.\n' >&2; return 1; fi
  rm -f "$output"
  return "$code"
}
if [ -n "$known_hosts" ]; then
  known_hosts=$(printf '%s' "$known_hosts" | sed 's/[\\"]/\\&/g')
  set -- "$@" -o "UserKnownHostsFile=\"$known_hosts\""
fi
printf '[1/3] Connecting to %s\n' "$host"
run_native ssh "$@" -p "$port" "$user@$host" "mkdir -p '$remote/incoming' && chmod 700 '$remote' '$remote/incoming'"
printf '[2/3] Uploading %s\n' "$bundle"
scp_host=$host
case "$host" in *:*) scp_host="[$host]";; esac
total=$(wc -c < "./$bundle" | tr -d '[:space:]')
printf '[UPLOAD] 0%% (0/%s bytes)\n' "$total"
run_native scp "$@" -P "$port" "./$bundle" "$user@$scp_host:$remote/incoming/$bundle" &
upload=$!
(
  pause=''
  trap 'if [ -n "$pause" ]; then kill "$pause" 2>/dev/null || :; wait "$pause" 2>/dev/null || :; fi; exit 0' HUP INT TERM
  while kill -0 "$upload" 2>/dev/null; do
    sleep 2 &
    pause=$!
    wait "$pause" || exit 1
    pause=''
    kill -0 "$upload" 2>/dev/null || break
    received=$(run_native ssh "$@" -p "$port" "$user@$host" "wc -c < '$remote/incoming/$bundle'" 2>/dev/null) || continue
    received=$(printf '%s' "$received" | tr -d '[:space:]')
    case "$received" in ''|*[!0-9]*) continue;; esac
    LC_ALL=C awk -v done="$received" -v total="$total" 'BEGIN {percent=total>0 ? done*100/total : 0; if(percent>99) percent=99; printf "[UPLOAD] %.0f%% (%s/%s bytes)\n",percent,done,total}'
  done
) &
monitor=$!
if wait "$upload"; then upload_code=0; else upload_code=$?; fi
upload=''
kill "$monitor" 2>/dev/null || :
wait "$monitor" 2>/dev/null || :
monitor=''
if [ "$upload_code" -ne 0 ]; then printf '[FAIL] Upload failed (exit %s). Check SSH output above.\n' "$upload_code" >&2; exit "$upload_code"; fi
printf '[UPLOAD] 100%% (%s/%s bytes)\n' "$total" "$total"
printf '[3/3] Applying package and checking HTTP access\n'
if run_native ssh "$@" -p "$port" "$user@$host" "cd '$remote/incoming' && mkdir -p '$bundle.contents' && tar -xf '$bundle' -C '$bundle.contents' && sh '$bundle.contents/apply.sh' '$remote'"; then
  :
else
  code=$?
  if [ "$code" -lt 128 ]; then
    printf '[FAIL] Remote deployment failed (exit %s). Inspect %s/result-<deploymentId>.json (ID in README.txt) and startup diagnostics.\n' "$code" "$remote" >&2
  else
    printf '[UNKNOWN] Remote execution may continue. Inspect %s/result-<deploymentId>.json (ID in README.txt), current and containers before retrying.\n' "$remote" >&2
  fi
  exit "$code"
fi
`.replace('@@PASSWORD_TRIM@@', '$' + '{password%.}').replace('@@PASSWORD_NEWLINE@@', '$' + '{password%?}').replace('@@TEMP_ROOT@@', '$' + '{TMPDIR:-/tmp}').replace('@@ASKPASS_PROMPT@@', '$' + '{SSH_ASKPASS_PROMPT:-}')
  const ps1 = String.raw`<#
操作机上传入口：复制整个交付目录后，先修改同目录 deploy-target.json 的服务器、用户和密钥路径。
需要 Windows PowerShell 5+/PowerShell 及 OpenSSH 的 ssh/scp；tar 必须与本脚本放在同一目录。
执行：powershell -File .\deploy.ps1 [-IdentityFile 当前电脑的私钥路径]。
tar 内 manifest.json 的 partial/selectedServices 标明全量或增量；服务器会检查基线，上传后自动部署并核验 HTTP。
SSH 中断时先核对远端结果文件和容器状态，再决定是否重试。
#>
param([string]$IdentityFile = $env:HAI_DEPLOY_IDENTITY_FILE)
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5 的重定向错误流默认沿用本机代码页；统一 UTF-8，保留多语言提示。
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$windowsRuntime = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
$previousSystemRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Process')
try {
if ($windowsRuntime) {
  $windowsDirectory = [Environment]::GetFolderPath('Windows')
  if ([string]::IsNullOrEmpty($windowsDirectory)) { throw 'Cannot locate the Windows system directory.' }
  $env:SystemRoot = $windowsDirectory
}
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
$auth = if ($null -eq $target.auth) { 'key' } else { $target.auth }
$passwordEnv = if ($null -eq $target.passwordEnv) { 'HAI_DEPLOY_PROVIDER_SSH_PASSWORD' } else { $target.passwordEnv }
if ($auth -isnot [string] -or $auth -notin @('key', 'password') -or $passwordEnv -isnot [string] -or $passwordEnv -cnotmatch '^HAI_DEPLOY_[A-Z0-9_]+$' -or $null -ne $target.password) { throw 'Invalid SSH authentication configuration. Store only passwordEnv in the target; passwords are read locally or prompted.' }
$options = @('-o', "StrictHostKeyChecking=$strict", '-o', "ConnectTimeout=$timeout")
if (-not $IdentityFile) { $IdentityFile = $target.identityFile }
if ($auth -eq 'password') {
  $options += @('-o', 'BatchMode=no', '-o', 'PreferredAuthentications=password', '-o', 'PasswordAuthentication=yes', '-o', 'PubkeyAuthentication=no', '-o', 'NumberOfPasswordPrompts=1')
} else {
  $options += @('-o', 'BatchMode=yes')
  if ($IdentityFile) { $options += @('-i', $IdentityFile, '-o', 'IdentitiesOnly=yes') }
}
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
  if ($auth -eq 'password' -and $nativeCommand.CommandType -eq 'Application') {
    $Arguments = @('--run', $nativeCommand.Source) + $Arguments
    $nativeCommand = Get-Command $env:SSH_ASKPASS -ErrorAction Stop
  }
  if ($nativeCommand.CommandType -eq 'Application') {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $nativeCommand.Source
    $start.WorkingDirectory = (Get-Location).ProviderPath
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $start.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
    $start.Arguments = ($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
    $child = [System.Diagnostics.Process]::Start($start)
    # 持续转发 SSH/部署诊断；密码模式的输出已由独立 helper 脱敏。
    $streams = @(
      @{ Reader = $child.StandardOutput; Pending = $child.StandardOutput.ReadLineAsync(); Writer = [Console]::Out },
      @{ Reader = $child.StandardError; Pending = $child.StandardError.ReadLineAsync(); Writer = [Console]::Error }
    )
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $nextProgress = 2000
    try {
      while (-not $child.HasExited -or $null -ne $streams[0].Pending -or $null -ne $streams[1].Pending) {
        foreach ($stream in $streams) {
          while ($null -ne $stream.Pending -and $stream.Pending.IsCompleted) {
            $line = $stream.Pending.GetAwaiter().GetResult()
            if ($null -eq $line) { $stream.Pending = $null }
            else { $stream.Writer.WriteLine($line); $stream.Pending = $stream.Reader.ReadLineAsync() }
          }
        }
        if ($Command -eq 'scp' -and -not $child.HasExited -and $clock.ElapsedMilliseconds -ge $nextProgress) {
          $nextProgress = $clock.ElapsedMilliseconds + 2000
          $query = $null
          try {
            $probe = New-Object System.Diagnostics.ProcessStartInfo
            $probe.FileName = (Get-Command ssh -ErrorAction Stop).Source
            $probeArgs = $options + @('-p', [string]$port, $destination, "wc -c < '$remote/incoming/$bundle'")
            if ($auth -eq 'password') { $probeArgs = @('--run', $probe.FileName) + $probeArgs; $probe.FileName = $env:SSH_ASKPASS }
            $probe.UseShellExecute = $false; $probe.CreateNoWindow = $true
            $probe.RedirectStandardOutput = $true; $probe.RedirectStandardError = $true
            $probe.Arguments = ($probeArgs | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
            $query = [System.Diagnostics.Process]::Start($probe)
            try {
              $stdout = $query.StandardOutput.ReadToEndAsync()
              $stderr = $query.StandardError.ReadToEndAsync()
              if (-not $query.WaitForExit(5000)) { $query.Kill(); $query.WaitForExit() }
              $received = $stdout.Result.Trim()
              if ($query.ExitCode -eq 0 -and $received -match '^[0-9]+$') {
                $percent = if ($uploadBytes -gt 0) { [Math]::Min(99, [Math]::Floor([double]$received * 100 / $uploadBytes)) } else { 0 }
                Write-Host "[UPLOAD] $percent% ($received/$uploadBytes bytes)"
                Write-Progress -Activity "Uploading $bundle" -Status "$received/$uploadBytes bytes" -PercentComplete $percent
              }
            } finally { if ($null -ne $query) { $query.Dispose() } }
          } catch { [Console]::Error.WriteLine('[UPLOAD] Progress query unavailable; transfer continues.') }
        }
        Start-Sleep -Milliseconds 50
      }
      $code = $child.ExitCode
    } finally { $child.Dispose(); if ($Command -eq 'scp') { Write-Progress -Activity "Uploading $bundle" -Completed } }
  } else {
    $invokeCommand = if ($nativeCommand.CommandType -eq 'Application') { $nativeCommand.Source } else { $Command }
    & $invokeCommand @Arguments
    $code = $LASTEXITCODE
  }
  $global:LASTEXITCODE = $code
  if ($code -ne 0) { throw "$Name failed (exit $code)." }
}
$applying = $false
$temporary = $null
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$savedEnvironment = @{}
try {
  foreach ($tool in @('ssh', 'scp')) { Get-Command $tool -ErrorAction Stop | Out-Null }
  if ($auth -eq 'password') {
    $password = [Environment]::GetEnvironmentVariable($passwordEnv, 'Process')
    if ($null -eq $password -and $windowsRuntime) { $password = [Environment]::GetEnvironmentVariable($passwordEnv, 'User') }
    if ([string]::IsNullOrEmpty($password)) {
      if ($Host.Name -eq 'ConsoleHost' -and [Console]::IsInputRedirected) { throw ($passwordEnv + ': ' + @@PASSWORD_UNAVAILABLE@@) }
      $secure = $null
      $pointer = [IntPtr]::Zero
      try {
        $secure = Read-Host -Prompt (@@PASSWORD_PROMPT@@ + ' (' + $passwordEnv + ')') -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
      } catch { throw ($passwordEnv + ': ' + @@PASSWORD_UNAVAILABLE@@) }
      finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($null -ne $secure) { $secure.Dispose() }
      }
    }
    if ([string]::IsNullOrEmpty($password) -or $password.IndexOfAny([char[]]@([char]0, [char]10, [char]13)) -ge 0 -or [Text.Encoding]::UTF8.GetByteCount($password) -gt 1023) { throw ($passwordEnv + ': ' + @@PASSWORD_INVALID@@) }
    foreach ($name in @('SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE', 'SSH_ASKPASS_PROMPT', 'DISPLAY', 'HAI_DEPLOY_ASKPASS_PASSWORD', 'HAI_DEPLOY_ASKPASS_SOURCE', 'HAI_DEPLOY_ASKPASS_OUTPUT')) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    $temporary = Join-Path $temporaryRoot ('hai-ssh-askpass-' + [Guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory($temporary) | Out-Null
    $source = Join-Path $temporary 'askpass.cs'
    $helper = Join-Path $temporary 'askpass.exe'
    [System.IO.File]::WriteAllText($source, @'
@@WINDOWS_ASKPASS@@
'@, (New-Object System.Text.UTF8Encoding($false)))
    $env:HAI_DEPLOY_ASKPASS_SOURCE = $source
    $env:HAI_DEPLOY_ASKPASS_OUTPUT = $helper
    # 编译进程不继承专用密码；固定源码及命令均不包含凭据。
    $env:HAI_DEPLOY_ASKPASS_PASSWORD = ''
    if (-not $windowsRuntime) { throw 'Use sh deploy.sh for password authentication on POSIX systems.' }
    $compiler = Join-Path $windowsDirectory 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $compileScript = '$ErrorActionPreference="Stop"; Add-Type -Language CSharp -TypeDefinition ([System.IO.File]::ReadAllText($env:HAI_DEPLOY_ASKPASS_SOURCE, [System.Text.Encoding]::UTF8)) -OutputType ConsoleApplication -OutputAssembly $env:HAI_DEPLOY_ASKPASS_OUTPUT'
    & $compiler -NoProfile -NonInteractive -EncodedCommand ([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($compileScript))) 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw 'Cannot prepare the SSH password helper.' }
    $env:SSH_ASKPASS = $helper
    $env:SSH_ASKPASS_REQUIRE = 'force'
    $env:SSH_ASKPASS_PROMPT = ''
    $env:DISPLAY = 'hai-deploy:0'
    $env:HAI_DEPLOY_ASKPASS_PASSWORD = $password
  }
  Invoke-Step '1/3 Connect' 'ssh' ($options + @('-p', [string]$port, $destination, "mkdir -p '$remote/incoming' && chmod 700 '$remote' '$remote/incoming'"))
  $uploadBytes = (Get-Item -LiteralPath "./$bundle").Length
  Write-Host "[UPLOAD] 0% (0/$uploadBytes bytes)"
  Invoke-Step '2/3 Upload' 'scp' ($options + @('-P', [string]$port, "./$bundle", "$($scpDestination):$remote/incoming/$bundle"))
  Write-Host "[UPLOAD] 100% ($uploadBytes/$uploadBytes bytes)"
  $applying = $true
  Invoke-Step '3/3 Apply and verify HTTP' 'ssh' ($options + @('-p', [string]$port, $destination, "cd '$remote/incoming' && mkdir -p '$bundle.contents' && tar -xf '$bundle' -C '$bundle.contents' && sh '$bundle.contents/apply.sh' '$remote'"))
} catch {
  if ($applying) {
    if ($LASTEXITCODE -gt 0 -and $LASTEXITCODE -lt 128) { [Console]::Error.WriteLine("[FAIL] Remote deployment failed (exit $LASTEXITCODE). Inspect $remote/result-<deploymentId>.json (ID in README.txt) and startup diagnostics.") }
    else { [Console]::Error.WriteLine("[UNKNOWN] Remote execution may continue. Inspect $remote/result-<deploymentId>.json (ID in README.txt), current and containers before retrying.") }
  }
  throw
} finally {
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  if ($null -ne $temporary -and (Test-Path -LiteralPath $temporary)) {
    $item = Get-Item -LiteralPath $temporary -Force
    if ([System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($temporary)) -ne $temporaryRoot -or $item.Name -notlike 'hai-ssh-askpass-*' -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Refusing to clean an unexpected SSH helper directory.' }
    Remove-Item -LiteralPath $temporary -Recurse -Force
  }
}
} finally {
  if ($windowsRuntime) {
    if ($null -eq $previousSystemRoot) { Remove-Item -LiteralPath Env:SystemRoot -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable('SystemRoot', $previousSystemRoot, 'Process') }
  }
}
`.replace('@@WINDOWS_ASKPASS@@', windowsAskpassSource)
  // Windows PowerShell 5 将无 BOM 的 UTF-8 视为 ANSI；中文注释也可能改变脚本的实际解析结果。
  const messages: Record<string, string> = {
    PROMPT: deployM('deploy_uploadPasswordPrompt'),
    UNAVAILABLE: deployM('deploy_uploadPasswordUnavailable'),
    CANCELLED: deployM('deploy_uploadPasswordCancelled'),
    INVALID: deployM('deploy_uploadPasswordInvalid'),
  }
  const pattern = /@@PASSWORD_(PROMPT|UNAVAILABLE|CANCELLED|INVALID)@@/g
  return {
    sh: sh.replace(pattern, (_match, name: string) => shellArgument(messages[name]!)),
    ps1: `\uFEFF${ps1.replace(pattern, (_match, name: string) => `'${messages[name]!.replaceAll('\'', '\'\'')}'`)}`,
    reader: createTargetReader(),
  }
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
