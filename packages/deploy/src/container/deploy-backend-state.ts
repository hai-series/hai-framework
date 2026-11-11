/** 命名卷的后端身份独立于 current 拓扑保存，禁止把旧数据目录交给不兼容引擎。 */
import { deployM } from '../deploy-i18n.js'
import { resolveComposeNamedVolumes } from './deploy-managed-secrets.js'
import { createDeploymentManifestFunctions } from './deploy-manifest.js'

const backendFamilies: Record<string, readonly string[]> = {
  db: ['postgresql', 'mysql'],
  storage: ['rustfs', 'minio'],
  vecdb: ['qdrant', 'pgvector', 'chroma'],
}

/**
 * 为不可变部署包生成实际卷绑定和服务器校验脚本，仅供模块内部打包流程调用。
 * @param projectName - 已归一化、含环境的部署身份。
 * @param compose - 当前实际 Compose 服务与命名卷声明。
 * @param compose.services - 实际服务定义。
 * @param compose.volumes - 命名卷定义。
 * @param selected - 本包更新的服务；未选服务由成功基线补齐。
 * @returns 三列 state-backends 与固定本地引擎的身份校验脚本。
 * @throws Error - 有状态服务的引擎或实际卷绑定不符合生成契约。
 * @example 模块内部上下文
 * ```ts
 * const assets = createBackendStateAssets('shop-prod', { services: { db: { image: 'postgres:16', volumes: ['data:/data'] } }, volumes: { data: null } }, ['db'])
 * ```
 */
export function createBackendStateAssets(projectName: string, compose: {
  services: Record<string, Record<string, unknown>>
  volumes?: Record<string, unknown>
}, selected: readonly string[]): Record<string, string> {
  if (!/^[\w.-]+$/.test(projectName))
    throw new Error(deployM('deploy_artifactInvalid'))
  const tuples: string[] = []
  const volumes = new Set<string>()
  for (const serviceName of selected) {
    const families = backendFamilies[serviceName]
    if (!families)
      continue
    const service = compose.services[serviceName]
    const image = service?.image
    if (typeof image !== 'string')
      throw new TypeError(deployM('deploy_artifactInvalid'))
    const imageFamily = image.slice(image.lastIndexOf('/') + 1).split(':')[0]!
    const family = imageFamily === 'postgres'
      ? 'postgresql'
      : imageFamily
    const namedVolumes = resolveComposeNamedVolumes(projectName, service.volumes, compose.volumes)
    if (!families.includes(family) || namedVolumes.length !== 1 || volumes.has(namedVolumes[0]!))
      throw new Error(deployM('deploy_artifactInvalid'))
    const volume = namedVolumes[0]!
    volumes.add(volume)
    tuples.push(`${serviceName} ${family} ${volume}`)
  }
  return {
    'state-backends': tuples.length
      ? `${tuples.join('\n')}\n`
      : '',
    'resolve-backend-state.sh': createBackendStateScript(projectName),
  }
}

/**
 * 生成持久卷与引擎身份检查代码，由部署入口持锁调用。
 * @param projectName - 已归一化的项目及环境身份。
 * @returns 合入 apply.sh 的 Shell 代码，不执行配置内容或输出凭据。
 * @example 模块内部上下文
 * ```ts
 * const script = createBackendStateScript('shop-prod')
 * void script
 * ```
 */
export function createBackendStateScript(projectName: string): string {
  return String.raw`#!/bin/sh
set -eu
umask 077
fail() { printf '%s\n' "$*" >&2; exit 1; }
test "$#" -eq 5 || fail 'Backend state requires root, release, runtime, previous ID and mode.'
root=$1
release=$2
runtime=$3
previous=$4
mode=$5
project='hai-@@PROJECT@@'
state="$root/persistent-backends"
snapshot="$release/.hai/previous-state-backends"
case "$mode" in check|commit|recover) ;; *) fail 'Invalid backend state mode.';; esac
case "$runtime" in docker|podman) ;; *) fail 'Backend state requires a resolved container runtime.';; esac
case "$previous" in .|..|*[!A-Za-z0-9_.-]*) fail 'Invalid previous deployment identity.';; esac
test -d "$root" && test ! -L "$root" && test -d "$release" && test ! -L "$release" || fail 'Invalid backend state directory.'
test -d "$release/.hai" && test ! -L "$release/.hai" || fail 'Invalid backend state assets directory.'
@@MANIFEST_FUNCTIONS@@
deployment_metadata_init
trap deployment_metadata_cleanup EXIT
backend_manifest=$(deployment_metadata_file "$release" state-backends)
regular() { test -f "$1" && test ! -L "$1" || fail "Backend state must be a regular file: $1"; }
absent_or_regular() { if [ -e "$1" ] || [ -L "$1" ]; then regular "$1"; fi; }
valid_tuples() {
  LC_ALL=C awk '
    NF {
      if(NF!=3 || roles[$1]++) exit 1
      if(!(($1=="db" && $2~/^(postgresql|mysql)$/) || ($1=="storage" && $2~/^(rustfs|minio)$/) || ($1=="vecdb" && $2~/^(qdrant|pgvector|chroma)$/))) exit 1
      if($3!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ || volumes[$3]++) exit 1
    }
  ' "$1"
}
valid_state() {
  LC_ALL=C awk -v snapshot="$2" '
    NR==1 {if($0!="FORMAT_VERSION 1") exit 1; next}
    NR==2 {if(NF!=2 || $1!="RUNTIME" || $2!~/^(docker|podman)$/) exit 1; next}
    NR==3 {if(NF!=2 || $1!="UID" || $2!~/^[0-9]+$/) exit 1; next}
    NR==4 {if(NF!=2 || $1!="IDENTITY" || $2!~/^[0-9a-f]+$/ || length($2)!=64) exit 1; next}
    NR==5 {if(NF!=2 || $1!="PROJECT" || $2!~/^hai-[A-Za-z0-9_.-]+$/) exit 1; next}
    NR==6 && snapshot==1 {if(NF!=2 || $1!="PREVIOUS" || $2!~/^[A-Za-z0-9_.-]+$/) exit 1; next}
    {
      if(NF!=3 || volumes[$3]++ || (snapshot==1 && roles[$1]++)) exit 1
      if(!(($1=="db" && $2~/^(postgresql|mysql)$/) || ($1=="storage" && $2~/^(rustfs|minio)$/) || ($1=="vecdb" && $2~/^(qdrant|pgvector|chroma)$/))) exit 1
      if($3!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/) exit 1
    }
    END {if(NR<5+snapshot) exit 1}
  ' "$1"
}
# 本机制只支持固定用户的本地默认引擎。连接名称或路径不证明数据格式，更换存储需独立迁移。
env | LC_ALL=C awk -F= '$1~/^(DOCKER_HOST|DOCKER_CONTEXT|CONTAINER_HOST|CONTAINER_CONNECTION|CONTAINERS_STORAGE_CONF|CONTAINERS_CONF|STORAGE_DRIVER|STORAGE_OPTS)$/ && length(substr($0,index($0,"=")+1)) {exit 1}' || fail 'Remote or overridden container storage is unsupported for persistent backend state. Use a fixed local default engine.'
owner=$(id -u) || fail 'Cannot identify the deployment user.'
case "$owner" in ''|*[!0-9]*) fail 'Invalid deployment user identity.';; esac
if [ "$runtime" = docker ]; then
  context=$(docker context show) || fail 'Cannot check the Docker context.'
  test "$context" = default || fail 'Persistent backend state requires the default local Docker context.'
  engine=$(docker info --format '{{.ID}}|{{.DockerRootDir}}|{{.Driver}}') || fail 'Cannot identify the local Docker daemon.'
else
  remote=$(podman info --format '{{.Host.ServiceIsRemote}}') || fail 'Cannot check whether Podman is local.'
  test "$remote" = false || fail 'Persistent backend state requires local Podman; remote connections are unsupported.'
  engine=$(podman info --format '{{.Host.Hostname}}|{{.Store.GraphRoot}}|{{.Store.GraphDriverName}}') || fail 'Cannot identify the local Podman store.'
fi
printf '%s\n' "$engine" | LC_ALL=C awk -F'|' 'NR!=1 || NF!=3 || $1=="" || $1=="<no value>" || $2!~/^\// || $3=="" || $3=="<no value>" {exit 1}' || fail 'Incomplete container store identity; no services were started.'
identity=$(printf '%s\n%s\n%s\n' "$runtime" "$owner" "$engine" | sha256sum | awk '{print $1}')
printf '%s\n' "$identity" | LC_ALL=C awk 'NR!=1 || $0!~/^[0-9a-f]+$/ || length($0)!=64 {exit 1}' || fail 'Cannot calculate the container store identity.'
header=$(printf 'FORMAT_VERSION 1\nRUNTIME %s\nUID %s\nIDENTITY %s\nPROJECT %s' "$runtime" "$owner" "$identity" "$project")
same_identity() {
  test "$(sed -n '1,5p' "$1")" = "$header" || fail 'Deployment project, container runtime, user or daemon/store identity changed. Use a separate deployment identity and migrate or restore data explicitly.'
}
absent_or_regular "$state"
ledger=''
if [ -f "$state" ]; then
  valid_state "$state" 0 || fail 'Invalid persistent backend ledger. Restore its protected backup.'
  same_identity "$state"
  ledger=$(sed -n '6,$p' "$state")
fi
known=$("$runtime" volume ls -q) || fail 'Cannot list persistent volumes; no backend state was changed.'
printf '%s\n' "$known" | LC_ALL=C awk 'NF {if(NF!=1 || $1!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ || seen[$1]++) exit 1}' || fail 'Invalid persistent volume listing.'
exists_volume() { printf '%s\n' "$known" | grep -Fxq "$1"; }
ledger_tuple() { printf '%s\n' "$ledger" | awk -v volume="$1" '$3==volume {print}'; }
snapshot_previous=$previous
if [ -z "$snapshot_previous" ]; then snapshot_previous=-; fi
if [ "$mode" = recover ]; then
  regular "$snapshot"
  valid_state "$snapshot" 1 || fail 'Invalid previous backend snapshot; automatic recovery is refused.'
  same_identity "$snapshot"
  test "$(sed -n '6p' "$snapshot")" = "PREVIOUS $snapshot_previous" || fail 'Previous backend snapshot does not match the recovery release.'
  while IFS=' ' read -r recover_service recover_family recover_volume; do
    test -n "$recover_service" || continue
    exists_volume "$recover_volume" || fail "Previous persistent volume is missing: $recover_volume. Restore its backup before recovery."
    test "$(ledger_tuple "$recover_volume")" = "$recover_service $recover_family $recover_volume" || fail "Previous persistent backend identity is unconfirmed: $recover_service. Automatic recovery is refused."
  done <<RECOVERY_TUPLES
$(sed -n '7,$p' "$snapshot")
RECOVERY_TUPLES
  exit 0
fi
regular "$backend_manifest"
valid_tuples "$backend_manifest" || fail 'Invalid backend manifest; rebuild the deployment bundle.'
active=''
if [ -n "$previous" ]; then
  baseline="$root/releases/$previous"
  test -d "$root/releases" && test ! -L "$root/releases" && test -d "$baseline" && test ! -L "$baseline" || fail 'Invalid successful deployment directory.'
  regular "$baseline/.hai/compose.json"
  baseline_services=$(deployment_services_file "$baseline")
  previous_manifest=$(deployment_metadata_file "$baseline" state-backends)
  regular "$previous_manifest"
  valid_tuples "$previous_manifest" || fail 'Invalid successful backend manifest.'
  LC_ALL=C awk 'NF {if(NF!=1 || $1!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ || seen[$1]++) exit 1}' "$baseline_services" || fail 'Invalid successful deployment services.'
  for active_service in db storage vecdb; do
    if ! grep -Fxq "$active_service" "$baseline_services"; then continue; fi
    active_family=''
    active_volume=''
    recorded=$(awk -v service="$active_service" '$1==service {print}' "$previous_manifest")
    test -n "$recorded" || fail "Installed backend identity is missing: $active_service."
    active_family=$(printf '%s\n' "$recorded" | awk '{print $2}')
    active_volume=$(printf '%s\n' "$recorded" | awk '{print $3}')
    printf '%s %s %s\n' "$active_service" "$active_family" "$active_volume" | LC_ALL=C awk 'NF!=3 || !(($1=="db" && $2~/^(postgresql|mysql)$/) || ($1=="storage" && $2~/^(rustfs|minio)$/) || ($1=="vecdb" && $2~/^(qdrant|pgvector|chroma)$/)) {exit 1}' || fail "Unknown installed backend for $active_service."
    exists_volume "$active_volume" || fail "Active persistent volume is missing: $active_volume. Restore its backup instead of creating an empty replacement."
    confirmed=$(ledger_tuple "$active_volume")
    test "$confirmed" = "$active_service $active_family $active_volume" || fail "Active persistent backend is missing from or conflicts with the protected ledger: $active_service. Restore verified backend state."
    active=$(printf '%s\n%s %s %s\n' "$active" "$active_service" "$active_family" "$active_volume" | sed '/^$/d')
  done
fi
# 同一实际卷不能绑定给多个有状态服务。
printf '%s\n' "$active" | valid_tuples /dev/stdin || fail 'Conflicting successful persistent volume bindings.'
# 合并时只替换同一卷的无数据预认领，不能按本次拓扑裁剪历史绑定。
merged=$ledger
merge_tuple() {
  merged=$(printf '%s\n' "$merged" | awk -v volume="$3" 'NF && $3!=volume {print}')
  merged=$(printf '%s\n%s %s %s\n' "$merged" "$1" "$2" "$3" | sed '/^$/d')
}
while IFS=' ' read -r candidate_service candidate_family candidate_volume; do
  test -n "$candidate_service" || continue
  prior_active=$(printf '%s\n' "$active" | awk -v service="$candidate_service" '$1==service {print}')
  tuple="$candidate_service $candidate_family $candidate_volume"
  test -z "$prior_active" || test "$prior_active" = "$tuple" || fail "Persistent backend $candidate_service changed or its active volume binding changed. Use a separate deployment identity and migrate or restore data explicitly."
  if exists_volume "$candidate_volume"; then
    confirmed=$(ledger_tuple "$candidate_volume")
    test "$confirmed" = "$tuple" || fail "Existing persistent volume has an unknown or incompatible backend: $candidate_service. Restore verified backend state; in-place reuse is refused."
  else
    users=$("$runtime" ps -aq --filter "volume=$candidate_volume") || fail 'Cannot check persistent volume users.'
    test -z "$users" || fail "A container still references missing persistent volume $candidate_volume. Restore or migrate explicitly."
  fi
  merge_tuple "$candidate_service" "$candidate_family" "$candidate_volume"
done < "$backend_manifest"
absent_or_regular "$snapshot"
if [ -e "$snapshot.next" ] || [ -L "$snapshot.next" ] || [ -e "$state.next" ] || [ -L "$state.next" ]; then fail 'Backend state staging file already exists; inspect the interrupted deployment before retrying.'; fi
if [ "$mode" = check ]; then exit 0; fi
snapshot_content=$(printf '%s\nPREVIOUS %s\n' "$header" "$snapshot_previous"; if [ -n "$active" ]; then printf '%s\n' "$active"; fi)
state_content=$(printf '%s\n' "$header"; if [ -n "$merged" ]; then printf '%s\n' "$merged"; fi)
# 独占创建同目录临时文件；只有完整快照与账本均落盘后，主流程才可启动或恢复服务。
(set -C; printf '%s\n' "$snapshot_content" > "$snapshot.next") || fail 'Cannot stage the previous backend snapshot.'
chmod 600 "$snapshot.next"
mv -f -- "$snapshot.next" "$snapshot"
(set -C; printf '%s\n' "$state_content" > "$state.next") || fail 'Cannot stage the persistent backend ledger.'
chmod 600 "$state.next"
mv -f -- "$state.next" "$state"
`.replace('@@PROJECT@@', () => projectName).replace('@@MANIFEST_FUNCTIONS@@', () => createDeploymentManifestFunctions())
}
