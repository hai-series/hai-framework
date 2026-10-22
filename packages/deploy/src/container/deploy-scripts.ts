/** 在线发布与手工交付共用的服务器执行脚本。远程依赖 Linux flock、基础工具及 Compose。 */
import type { DockerSshProviderConfig } from '../deploy-config.js'

/** 将可信配置编码为一个 shell 参数。 */
export function shellArgument(value: string): string {
  return `'${value.replaceAll('\'', '\'"\'"\'')}'`
}

/** 生成分步执行、增量合并和失败恢复脚本；密钥始终从环境文件读取。 */
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
release="$root/releases/$id"
case "$release/" in "$source_dir/"*) printf 'Extract the package outside the deployment directory before applying it.\n' >&2; exit 1;; esac
stage=''
previous=''
restore=''
changed=false
locked=false
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
      if [ "$partial" = false ]; then recover_selected=$(grep -v -- '-init$' "$root/releases/$previous/services"); fi
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
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' HUP INT TERM
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
  cmp -s layout "$root/releases/$previous/layout" || { printf 'Ports, API routes or application layout changed. Create a full deployment bundle.\n' >&2; exit 1; }
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
  case "$dependency" in *-init) continue;; esac
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
if [ -f "$release/initialize-storage" ]; then
  remove_selected storage-init
  compose up -d --no-deps --no-build --pull never storage
  compose up --no-deps --no-build --pull never "$recreate_option" --exit-code-from storage-init storage-init
fi
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

/** 生成无 Node/pnpm 依赖的上传脚本；换电脑时可覆盖 SSH 私钥路径。 */
export function createUploadScripts(config: DockerSshProviderConfig, bundle: string, projectName: string): { sh: string, ps1: string } {
  const ssh = config.ssh
  const host = ssh?.host ?? 'SERVER_HOST'
  const user = ssh?.username ?? 'deploy'
  const remote = `${config.remote.baseDir}/${projectName}`
  const port = ssh?.port ?? 22
  const sh = String.raw`#!/bin/sh
set -eu
cd "$(dirname "$0")"
host=@@HOST@@
user=@@USER@@
port=@@PORT@@
remote=@@REMOTE@@
bundle=@@BUNDLE@@
if [ "$#" -ge 1 ]; then host=$1; fi
if [ "$#" -ge 2 ]; then port=$2; fi
if [ "$#" -ge 3 ]; then user=$3; fi
identity=$(printenv HAI_DEPLOY_IDENTITY_FILE || true)
if [ -z "$identity" ]; then identity=@@IDENTITY@@; fi
test "$host" != SERVER_HOST || { printf 'Specify the server: sh deploy.sh SERVER [PORT] [USER].\n' >&2; exit 1; }
for tool in ssh scp; do command -v "$tool" >/dev/null || { printf 'Install OpenSSH (%s).\n' "$tool" >&2; exit 1; }; done
set -- -o BatchMode=yes -o StrictHostKeyChecking=@@STRICT@@ -o ConnectTimeout=10
if [ -n "$identity" ]; then set -- "$@" -i "$identity"; fi
known_hosts=@@KNOWN@@
if value=$(printenv HAI_DEPLOY_KNOWN_HOSTS_FILE); then known_hosts=$value; fi
if [ -n "$known_hosts" ]; then set -- "$@" -o "UserKnownHostsFile=$known_hosts"; fi
printf '[1/3] Connecting to %s\n' "$host"
ssh "$@" -p "$port" "$user@$host" "mkdir -p '$remote/incoming' && chmod 700 '$remote' '$remote/incoming'"
printf '[2/3] Uploading %s\n' "$bundle"
scp_host=$host
case "$host" in *:*) scp_host="[$host]";; esac
scp "$@" -P "$port" "$bundle" "$user@$scp_host:$remote/incoming/$bundle"
printf '[3/3] Applying package and checking HTTP access\n'
if ssh "$@" -p "$port" "$user@$host" "cd '$remote/incoming' && mkdir -p '$bundle.contents' && tar -xf '$bundle' -C '$bundle.contents' && sh '$bundle.contents/apply.sh' '$remote'"; then
  :
else
  code=$?
  printf '[UNKNOWN] Remote execution may continue. Inspect %s/result-<deploymentId>.json (ID in manifest.json), current and containers before retrying.\n' "$remote" >&2
  exit "$code"
fi
`
  const ps1 = String.raw`param([string]$IdentityFile = $env:HAI_DEPLOY_IDENTITY_FILE)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$target = Get-Content -LiteralPath './deploy-target.json' -Raw | ConvertFrom-Json
if ($target.host -eq 'SERVER_HOST') { throw 'Set the server host in deploy-target.json.' }
if ($target.host -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.:-]*$' -or $target.username -notmatch '^[a-zA-Z_][a-zA-Z0-9_-]*$' -or $target.directory -notmatch '^/[a-zA-Z0-9/_. -]+$' -or $target.directory -match '(^|/)\.\.(/|$)' -or $target.bundle -notmatch '^[a-zA-Z0-9_.+-]+\.tar$') { throw 'Invalid deployment target.' }
$options = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10')
if ($target.strictHostKeyChecking -eq $false) { $options[3] = 'StrictHostKeyChecking=no' }
if (-not $IdentityFile) { $IdentityFile = $target.identityFile }
if ($IdentityFile) { $options += @('-i', $IdentityFile) }
if ($target.knownHostsFile) { $options += @('-o', "UserKnownHostsFile=$($target.knownHostsFile)") }
$destination = "$($target.username)@$($target.host)"
$scpDestination = if ($target.host.Contains(':')) { "$($target.username)@[$($target.host)]" } else { $destination }
$remote = $target.directory
$bundle = $target.bundle
function Invoke-Step([string]$Name, [string]$Command, [string[]]$Arguments) {
  Write-Host "[$Name]"
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)." }
}
$applying = $false
try {
  foreach ($tool in @('ssh', 'scp')) { Get-Command $tool -ErrorAction Stop | Out-Null }
  Invoke-Step '1/3 Connect' 'ssh' ($options + @('-p', [string]$target.port, $destination, "mkdir -p '$remote/incoming' && chmod 700 '$remote' '$remote/incoming'"))
  Invoke-Step '2/3 Upload' 'scp' ($options + @('-P', [string]$target.port, $bundle, "$($scpDestination):$remote/incoming/$bundle"))
  $applying = $true
  Invoke-Step '3/3 Apply and verify HTTP' 'ssh' ($options + @('-p', [string]$target.port, $destination, "cd '$remote/incoming' && mkdir -p '$bundle.contents' && tar -xf '$bundle' -C '$bundle.contents' && sh '$bundle.contents/apply.sh' '$remote'"))
} catch {
  if ($applying) { [Console]::Error.WriteLine("[UNKNOWN] Remote execution may continue. Inspect $remote/result-<deploymentId>.json (ID in manifest.json), current and containers before retrying.") }
  Write-Error $_
  exit 1
}
`
  const values: Record<string, string> = { HOST: shellArgument(host), USER: shellArgument(user), PORT: String(port), REMOTE: shellArgument(remote), BUNDLE: shellArgument(bundle), IDENTITY: shellArgument(ssh?.identityFile ?? ''), KNOWN: shellArgument(ssh?.knownHostsFile ?? ''), STRICT: ssh?.strictHostKeyChecking === false ? 'no' : 'accept-new' }
  return { sh: sh.replace(/@@([A-Z]+)@@/g, (_match, name: string) => values[name]!), ps1 }
}
