/** 在线预检、交付包和只读核对共用的 Linux 引擎连接与存储身份规则。 */
export const deploymentRuntimeFunctions = String.raw`
runtime_error() { printf '%s\n' "$*" >&2; return 1; }

configure_deployment_runtime() {
  runtime=$1
  docker_mode=$2
  if [ "$runtime:$docker_mode" = docker:rootless ]; then
    uid=$(id -u) || return 1
    case "$uid" in ''|0|*[!0-9]*) runtime_error 'Rootless Docker requires the non-root owner of the Docker service.'; return 1;; esac
    socket_directory=$(printenv XDG_RUNTIME_DIR || true)
    if [ -z "$socket_directory" ]; then socket_directory="/run/user/$uid"; fi
    case "$socket_directory" in
      /|/tmp|/tmp/*) runtime_error 'Rootless Docker requires a private user runtime directory.'; return 1;;
      /*) ;;
      *) runtime_error 'Rootless Docker requires an absolute user runtime directory.'; return 1;;
    esac
    socket="$socket_directory/docker.sock"
    if [ "$(realpath -e -- "$socket_directory")" != "$socket_directory" ] ||
      [ "$(stat -c '%u:%a' -- "$socket_directory")" != "$uid:700" ] ||
      [ ! -S "$socket" ] || [ -L "$socket" ] || [ "$(stat -c '%u' -- "$socket")" != "$uid" ]; then
      runtime_error 'Start Rootless Docker for this SSH user and check its private runtime directory and docker.sock.'
      return 1
    fi
    unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
    export DOCKER_HOST="unix://$socket"
    security=$(docker info --format '{{range .SecurityOptions}}{{println .}}{{end}}') || return 1
    printf '%s\n' "$security" | grep -Eq '^name=rootless(,|$)' || runtime_error 'The selected Docker service is not running in rootless mode.'
    return
  fi
  case "$runtime:$docker_mode" in docker:default|podman:default) ;; *) runtime_error 'Invalid deployment runtime selection.'; return 1;; esac
  env | LC_ALL=C awk -F= '$1~/^(DOCKER_HOST|DOCKER_CONTEXT|CONTAINER_HOST|CONTAINER_CONNECTION|CONTAINERS_STORAGE_CONF|CONTAINERS_CONF|STORAGE_DRIVER|STORAGE_OPTS)$/ && length(substr($0,index($0,"=")+1)) {exit 1}' || {
    runtime_error 'Use the local container engine without connection or storage overrides.'
    return 1
  }
  if [ "$runtime" = docker ]; then
    context=$(docker context show) || return 1
    test "$context" = default || { runtime_error 'Select Rootless Docker explicitly or use the default local Docker context.'; return 1; }
    # 防止后续命令受用户切换活动 context 影响。
    export DOCKER_CONTEXT=default
  else
    remote=$(podman info --format '{{.Host.ServiceIsRemote}}') || return 1
    test "$remote" = false || runtime_error 'Use local Podman on the deployment host.'
  fi
}

check_deployment_compose() {
  "$runtime" version >/dev/null &&
    "$runtime" compose version >/dev/null &&
    { "$runtime" compose up --help | grep -q never ||
      runtime_error 'Install Docker Compose v2 or podman-compose 1.6.0 or newer with support for --pull never.'; }
}

select_deployment_runtime() {
  case "$1" in
    auto)
      test "$2" = default || { runtime_error 'Rootless Docker requires an explicit Docker runtime.'; return 1; }
      if (configure_deployment_runtime podman default && check_deployment_compose) >/dev/null 2>&1; then
        configure_deployment_runtime podman default
      else
        configure_deployment_runtime docker default
      fi
      ;;
    *) configure_deployment_runtime "$1" "$2" ;;
  esac
}
`

/** 已选连接的存储账本头；调用方持锁，通过同一连接读引擎数据。 */
export const deploymentStoreHeader = String.raw`
deployment_store_header() (
  owner=$(id -u) || exit 1
  case "$owner" in ''|*[!0-9]*) runtime_error 'Cannot identify the deployment user.'; exit 1;; esac
  if [ "$1" = docker ]; then
    engine=$(docker info --format '{{.ID}}|{{.DockerRootDir}}|{{.Driver}}') || exit 1
  else
    engine=$(podman info --format '{{.Host.Hostname}}|{{.Store.GraphRoot}}|{{.Store.GraphDriverName}}') || exit 1
  fi
  printf '%s\n' "$engine" | LC_ALL=C awk -F'|' 'NR!=1 || NF!=3 || $1=="" || $1=="<no value>" || $2!~/^\// || $3=="" || $3=="<no value>" {exit 1} END {if(NR!=1) exit 1}' ||
    { runtime_error 'Incomplete container store identity.'; exit 1; }
  hash=$(printf '%s\n%s\n%s\n' "$1" "$owner" "$engine" | sha256sum) || exit 1
  identity=$(printf '%s\n' "$hash" | awk '{print $1}')
  printf '%s\n' "$identity" | grep -Eq '^[0-9a-f]{64}$' || exit 1
  printf 'FORMAT_VERSION 1\nRUNTIME %s\nUID %s\nIDENTITY %s\nPROJECT %s\n' "$1" "$owner" "$identity" "$2"
)
`
