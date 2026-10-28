/** 命名卷的后端身份独立于 current 拓扑保存，禁止把旧数据目录交给不兼容引擎。 */
import { deployM } from '../deploy-i18n.js'
import { createComposeContainerLookupScript } from './deploy-compose-identity.js'
import { createManagedSecretValidationScript, resolveComposeNamedVolumes } from './deploy-managed-secrets.js'

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
      throw new Error(deployM('deploy_artifactInvalid'))
    const imageFamily = image.slice(image.lastIndexOf('/') + 1).split(':')[0]!
    const family = imageFamily === 'postgres' ? 'postgresql' : imageFamily
    const namedVolumes = resolveComposeNamedVolumes(projectName, service.volumes, compose.volumes)
    if (!families.includes(family) || namedVolumes.length !== 1 || volumes.has(namedVolumes[0]!))
      throw new Error(deployM('deploy_artifactInvalid'))
    const volume = namedVolumes[0]!
    volumes.add(volume)
    tuples.push(`${serviceName} ${family} ${volume}`)
  }
  return {
    'state-backends': tuples.length ? `${tuples.join('\n')}\n` : '',
    'resolve-backend-state.sh': createBackendStateScript()
      .replace('@@PROJECT@@', projectName)
      .replace('@@MANAGED_VALUES_VALIDATOR@@', createManagedSecretValidationScript())
      .replace('@@COMPOSE_CONTAINER_LOOKUP@@', createComposeContainerLookupScript()),
  }
}

/** 只在 apply.sh 持有项目部署锁时执行，不执行配置文件中的代码，不输出凭据。 */
function createBackendStateScript(): string {
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
snapshot="$release/previous-state-backends"
case "$mode" in check|commit|recover) ;; *) fail 'Invalid backend state mode.';; esac
case "$runtime" in docker|podman) ;; *) fail 'Backend state requires a resolved container runtime.';; esac
case "$previous" in .|..|*[!A-Za-z0-9_.-]*) fail 'Invalid previous deployment identity.';; esac
test -d "$root" && test ! -L "$root" && test -d "$release" && test ! -L "$release" || fail 'Invalid backend state directory.'
regular() { test -f "$1" && test ! -L "$1" || fail "Backend state must be a regular file: $1"; }
absent_or_regular() { if [ -e "$1" ] || [ -L "$1" ]; then regular "$1"; fi; }
valid_tuples() {
  LC_ALL=C awk -v legacy="$2" '
    NF {
      if((NF!=3 && !(legacy==1 && NF==2)) || roles[$1]++) exit 1
      if(!(($1=="db" && $2~/^(postgresql|mysql)$/) || ($1=="storage" && $2~/^(rustfs|minio)$/) || ($1=="vecdb" && $2~/^(qdrant|pgvector|chroma)$/))) exit 1
      if(NF==3 && ($3!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ || volumes[$3]++)) exit 1
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
@@MANAGED_VALUES_VALIDATOR@@
@@COMPOSE_CONTAINER_LOOKUP@@
# 仅供旧状态补证：卷挂载和镜像均取自同项目、同角色的唯一实际容器。
container_binding() {
  binding_service=$1
  binding_family=$2
  binding_expected=$3
  binding_running=$4
  binding_flags=-aq
  if [ "$binding_running" = true ]; then binding_flags=-q; fi
  binding_containers=$(compose_container_ids "$runtime" "$project" "$binding_service" "$binding_flags") || fail 'Cannot inspect successful deployment containers.'
  printf '%s\n' "$binding_containers" | LC_ALL=C awk 'NR!=1 || NF!=1 || $1!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ {exit 1} END {if(NR!=1) exit 1}' || fail "Cannot prove the previous volume binding for $binding_service. Restore verified backend state."
  if [ "$binding_running" = true ]; then
    binding_status=$("$runtime" inspect --format '{{.State.Running}}' "$binding_containers") || fail 'Cannot verify the imported service is running.'
    test "$binding_status" = true || fail "Imported backend requires its verified original container to be running: $binding_service."
  fi
  binding_mounted=$("$runtime" inspect --format '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}' "$binding_containers") || fail 'Cannot inspect previous named volume mounts.'
  printf '%s\n' "$binding_mounted" | LC_ALL=C awk 'NR!=1 || NF!=1 || $1!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ {exit 1} END {if(NR!=1) exit 1}' || fail "Ambiguous previous volume binding for $binding_service."
  binding_image=$("$runtime" inspect --format '{{.Config.Image}}' "$binding_containers") || fail 'Cannot identify the previous container image.'
  binding_actual_family=$(printf '%s\n' "$binding_image" | LC_ALL=C awk 'NR!=1 || NF!=1 {exit 1} {image=$0; sub(/^.*\//,"",image); sub(/[:@].*$/,"",image); if(image=="postgres") image="postgresql"; print image}') || fail 'Invalid previous container image identity.'
  test "$binding_actual_family" = "$binding_family" || fail "Actual previous container image does not confirm its backend family: $binding_service."
  if [ -n "$binding_expected" ] && [ "$binding_expected" != "$binding_mounted" ]; then fail "Actual previous volume differs from its backend manifest: $binding_service."; fi
  printf '%s\n' "$binding_mounted"
}
confirmed_import() {
  import_service=$1
  import_family=$2
  import_volume=$3
  import_state="$root/managed-secrets.env"
  test -f "$import_state" && test ! -L "$import_state" || return 1
  valid_values "$import_state" || return 1
  test "$(awk -F= '$1=="FORMAT_VERSION" {print $2}' "$import_state")" = 2 || return 1
  test "$(awk -F= '$1=="PROJECT" {print $2}' "$import_state")" = "$project" || return 1
  case "$import_service" in db|vecdb) import_group=DB_PASSWORD;; storage) import_group=STORAGE_PASSWORD;; *) return 1;; esac
  awk -F= -v group="$import_group" -v binding="$import_group:$import_volume" '$1==group && $2!="" {credential=1} $1~/^VOLUME_[0-9]+$/ && $2==binding {volume=1} END {exit !(credential && volume)}' "$import_state" || return 1
  # 密码不证明目录格式；受控导入还须与唯一运行原容器的实际卷及镜像家族共同吻合。
  import_actual=$(container_binding "$import_service" "$import_family" "$import_volume" true) || return 1
  test "$import_actual" = "$import_volume"
}
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
regular "$release/state-backends"
valid_tuples "$release/state-backends" 0 || fail 'Invalid backend manifest; rebuild the deployment bundle.'
active=''
if [ -n "$previous" ]; then
  baseline="$root/releases/$previous"
  test -d "$root/releases" && test ! -L "$root/releases" && test -d "$baseline" && test ! -L "$baseline" || fail 'Invalid successful deployment directory.'
  regular "$baseline/services"
  regular "$baseline/compose-files"
  LC_ALL=C awk 'NF {if(NF!=1 || $1!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ || seen[$1]++) exit 1}' "$baseline/services" || fail 'Invalid successful deployment services.'
  for active_service in db storage vecdb; do
    if ! grep -Fxq "$active_service" "$baseline/services"; then continue; fi
    active_family=''
    active_volume=''
    while IFS= read -r compose_file; do
      compose_directory=$(dirname -- "$compose_file")
      compose_id=$(basename -- "$compose_directory")
      case "$compose_id" in ''|.|..|*[!A-Za-z0-9_.-]*) fail 'Invalid successful Compose identity.';; esac
      test "$compose_directory" = "$root/releases/$compose_id" && test ! -L "$compose_directory" || fail 'Successful Compose file escapes the deployment directory.'
      regular "$compose_file"
      previous_manifest="$compose_directory/state-backends"
      absent_or_regular "$previous_manifest"
      if [ -f "$previous_manifest" ]; then
        valid_tuples "$previous_manifest" 1 || fail 'Invalid successful backend manifest.'
        recorded=$(awk -v service="$active_service" '$1==service {print}' "$previous_manifest")
        if [ -n "$recorded" ]; then
          active_family=$(printf '%s\n' "$recorded" | awk '{print $2}')
          active_volume=$(printf '%s\n' "$recorded" | awk '{print $3}')
        fi
      fi
    done < "$baseline/compose-files"
    if [ -z "$active_family" ]; then
      # 兼容旧包只读取已知字段，不 source dotenv；凭据本身不是后端身份的证据。
      case "$active_service" in
        db|vecdb)
          regular "$baseline/middleware.env"
          state_key=HAI_DB
          if [ "$active_service" = vecdb ]; then state_key=HAI_VECDB; fi
          active_family=$(awk -F= -v key="$state_key" '$1==key {if($0~/"type"[[:space:]]*:[[:space:]]*"postgresql"/) print "postgresql"; else if($0~/"type"[[:space:]]*:[[:space:]]*"mysql"/) print "mysql"; else if($0~/"type"[[:space:]]*:[[:space:]]*"qdrant"/) print "qdrant"; else if($0~/"type"[[:space:]]*:[[:space:]]*"pgvector"/) print "pgvector"; else if($0~/"type"[[:space:]]*:[[:space:]]*"chroma"/) print "chroma"}' "$baseline/middleware.env")
          ;;
        storage)
          regular "$baseline/middleware-runtime.env"
          active_family=$(awk -F= '$1=="RUSTFS_SECRET_KEY" {print "rustfs"} $1=="MINIO_ROOT_PASSWORD" {print "minio"}' "$baseline/middleware-runtime.env")
          ;;
      esac
    fi
    # 旧两列清单或丢失账本只能以当前真实容器的命名卷挂载补证，不猜默认卷名。
    if [ -z "$active_volume" ] || [ -z "$(ledger_tuple "$active_volume")" ]; then
      active_volume=$(container_binding "$active_service" "$active_family" "$active_volume" false) || fail "Cannot confirm the active persistent backend: $active_service."
    fi
    printf '%s %s %s\n' "$active_service" "$active_family" "$active_volume" | LC_ALL=C awk 'NF!=3 || !(($1=="db" && $2~/^(postgresql|mysql)$/) || ($1=="storage" && $2~/^(rustfs|minio)$/) || ($1=="vecdb" && $2~/^(qdrant|pgvector|chroma)$/)) {exit 1}' || fail "Unknown previous backend for $active_service; explicit migration is required."
    exists_volume "$active_volume" || fail "Active persistent volume is missing: $active_volume. Restore its backup instead of creating an empty replacement."
    confirmed=$(ledger_tuple "$active_volume")
    test -z "$confirmed" || test "$confirmed" = "$active_service $active_family $active_volume" || fail "Active persistent backend conflicts with the protected ledger: $active_service."
    active=$(printf '%s\n%s %s %s\n' "$active" "$active_service" "$active_family" "$active_volume" | sed '/^$/d')
  done
fi
# 各个旧 Compose 片段不能把同一实际卷重复绑定给不同有状态角色。
printf '%s\n' "$active" | valid_tuples /dev/stdin 0 || fail 'Conflicting successful persistent volume bindings.'
# 合并时只替换同一卷的无数据预认领，不能按本次拓扑裁剪历史绑定。
merged=$ledger
merge_tuple() {
  merged=$(printf '%s\n' "$merged" | awk -v volume="$3" 'NF && $3!=volume {print}')
  merged=$(printf '%s\n%s %s %s\n' "$merged" "$1" "$2" "$3" | sed '/^$/d')
}
while IFS=' ' read -r active_service active_family active_volume; do
  test -n "$active_service" || continue
  merge_tuple "$active_service" "$active_family" "$active_volume"
done <<ACTIVE_TUPLES
$active
ACTIVE_TUPLES
while IFS=' ' read -r candidate_service candidate_family candidate_volume; do
  test -n "$candidate_service" || continue
  prior_active=$(printf '%s\n' "$active" | awk -v service="$candidate_service" '$1==service {print}')
  tuple="$candidate_service $candidate_family $candidate_volume"
  test -z "$prior_active" || test "$prior_active" = "$tuple" || fail "Persistent backend $candidate_service changed or its active volume binding changed. Use a separate deployment identity and migrate or restore data explicitly."
  if exists_volume "$candidate_volume"; then
    confirmed=$(ledger_tuple "$candidate_volume")
    if [ -z "$confirmed" ]; then confirmed=$(printf '%s\n' "$active" | awk -v volume="$candidate_volume" '$3==volume {print}'); fi
    if [ -z "$confirmed" ] && confirmed_import "$candidate_service" "$candidate_family" "$candidate_volume"; then confirmed=$tuple; fi
    test "$confirmed" = "$tuple" || fail "Existing persistent volume has an unknown or incompatible backend: $candidate_service. Restore verified backend state; in-place reuse is refused."
  else
    users=$("$runtime" ps -aq --filter "volume=$candidate_volume") || fail 'Cannot check persistent volume users.'
    test -z "$users" || fail "A container still references missing persistent volume $candidate_volume. Restore or migrate explicitly."
  fi
  merge_tuple "$candidate_service" "$candidate_family" "$candidate_volume"
done < "$release/state-backends"
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
`
}
