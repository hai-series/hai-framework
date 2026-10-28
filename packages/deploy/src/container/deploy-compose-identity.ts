/**
 * 生成两个内部部署流程共用的 Compose 容器身份查询函数，不改变容器状态。
 * @returns POSIX Shell 函数 compose_container_ids(runtime, project, service, selector)。
 * @example 模块内部上下文
 * ```ts
 * const lookup = createComposeContainerLookupScript()
 * const apply = [lookup, 'compose_container_ids docker hai-demo-prod db -aq'].join('\n')
 * // apply 供部署包内部执行，应用调用公开部署 API，不直接执行这段 Shell。
 * void apply
 * ```
 */
export function createComposeContainerLookupScript(): string {
  const labelFormat = ['com.docker.compose.project', 'com.docker.compose.service', 'io.podman.compose.project', 'io.podman.compose.service']
    .map(key => `{{index .Config.Labels \`${key}\`}}`)
    .join('|')
  return String.raw`compose_container_ids() (
  if [ "$#" -ne 4 ]; then printf 'Compose container lookup requires runtime, project, service and selector.\n' >&2; exit 1; fi
  lookup_runtime=$1
  lookup_project=$2
  lookup_service=$3
  lookup_selector=$4
  case "$lookup_runtime" in docker|podman) ;; *) printf 'Invalid Compose lookup runtime.\n' >&2; exit 1;; esac
  case "$lookup_project" in ''|*[!A-Za-z0-9_.-]*) printf 'Invalid Compose project identity.\n' >&2; exit 1;; esac
  case "$lookup_service" in ''|*[!A-Za-z0-9_.-]*) printf 'Invalid Compose service identity.\n' >&2; exit 1;; esac
  case "$lookup_selector" in -q|-aq) ;; *) printf 'Invalid Compose container selector.\n' >&2; exit 1;; esac
  lookup_ids=''
  for lookup_namespace in com.docker.compose io.podman.compose; do
    lookup_found=$("$lookup_runtime" ps "$lookup_selector" --filter "label=$lookup_namespace.project=$lookup_project" --filter "label=$lookup_namespace.service=$lookup_service") || { printf 'Cannot query Compose containers.\n' >&2; exit 1; }
    printf '%s\n' "$lookup_found" | LC_ALL=C awk 'NF {if(NF!=1 || $0!~/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/) exit 1}' || { printf 'Invalid Compose container identifiers.\n' >&2; exit 1; }
    lookup_ids=$(printf '%s\n%s\n' "$lookup_ids" "$lookup_found" | LC_ALL=C awk 'NF && !seen[$0]++ {print}') || exit 1
  done
  for lookup_id in $lookup_ids; do
    lookup_labels=$("$lookup_runtime" inspect --format '${labelFormat}' "$lookup_id") || { printf 'Cannot inspect Compose container labels.\n' >&2; exit 1; }
    printf '%s\n' "$lookup_labels" | LC_ALL=C awk -F'|' -v project="$lookup_project" -v service="$lookup_service" '
      NR!=1 || NF!=4 {exit 1}
      {
        docker=($1!="" && $1!="<no value>") || ($2!="" && $2!="<no value>")
        podman=($3!="" && $3!="<no value>") || ($4!="" && $4!="<no value>")
        if((!docker && !podman) || (docker && ($1!=project || $2!=service)) || (podman && ($3!=project || $4!=service))) exit 1
      }
      END {if(NR!=1) exit 1}
    ' || { printf 'Container labels do not confirm the requested Compose project and service.\n' >&2; exit 1; }
  done
  if [ -n "$lookup_ids" ]; then printf '%s\n' "$lookup_ids"; fi
)
`
}
