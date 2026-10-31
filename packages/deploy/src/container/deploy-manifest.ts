import { createDeploymentJsonTool } from './deploy-json.js'
import { shellArgument } from './deploy-shell.js'

/**
 * 生成清单与完整 Compose 快照的 Shell 读取函数；临时文件只属于本次部署。
 * @returns 供部署入口和独立内部检查使用的 POSIX Shell 函数。
 * @example 模块内部上下文
 * ```ts
 * const functions = createDeploymentManifestFunctions()
 * // 初始化 metadata_work 后读取 manifest.json，不再生成大量永久元数据文件。
 * void functions
 * ```
 */
export function createDeploymentManifestFunctions(): string {
  return String.raw`deployment_json() {
  json_action=$1
  json_field=$2
  json_expected=$3
  shift 3
  for json_input in "$@"; do
    test -f "$json_input" && test ! -L "$json_input" || { printf 'Deployment metadata must be a regular file.\n' >&2; return 1; }
  done
  LC_ALL=C awk -v action="$json_action" -v field="$json_field" -v expected="$json_expected" -v multiline=1 -v required=1 -v service="\${json_proxy_service:-}" -v mount="\${json_proxy_mount:-}" @@JSON@@ "$@"
}
deployment_metadata_cleanup() {
  test "\${metadata_work_owned:-false}" = true || return 0
  test "$(dirname -- "$metadata_work")" = "$root" || return 1
  case "$(basename -- "$metadata_work")" in .deployment-metadata.*) ;; *) printf 'Unexpected deployment metadata cleanup path.\n' >&2; return 1;; esac
  test -d "$metadata_work" && test ! -L "$metadata_work" || return 1
  rm -rf -- "$metadata_work"
  metadata_work_owned=false
}
deployment_metadata_init() {
  if [ -n "\${metadata_work:-}" ]; then
    test "$(dirname -- "$metadata_work")" = "$root" && test -d "$metadata_work" && test ! -L "$metadata_work" || return 1
    case "$(basename -- "$metadata_work")" in .deployment-metadata.*) ;; *) return 1;; esac
    metadata_work_owned=false
    return 0
  fi
  metadata_work=$(mktemp -d "$root/.deployment-metadata.XXXXXX")
  metadata_work_owned=true
}
deployment_metadata_file() {
  metadata_directory=$1
  metadata_name=$2
  case "$metadata_name" in layout|health-paths|image-list|dependencies|managed-project|managed-bindings|managed-volumes|managed-app-keys|state-backends|storage-routing|web-base-path|node-runtime|proxy-service|https) ;; *) printf 'Unknown deployment metadata field.\n' >&2; return 1;; esac
  test -f "$metadata_directory/manifest.json" && test ! -L "$metadata_directory/manifest.json" || return 1
  metadata_identity=$(printf '%s' "$metadata_directory" | sha256sum | awk '{print $1}')
  metadata_cached="$metadata_work/$metadata_identity-$metadata_name"
  if [ ! -f "$metadata_cached" ]; then
    metadata_value=$(deployment_json read "metadata.$metadata_name" string "$metadata_directory/manifest.json") || return 1
    printf '%s\n' "$metadata_value" > "$metadata_cached"
  fi
  printf '%s\n' "$metadata_cached"
}
deployment_services_file() {
  metadata_identity=$(printf '%s' "$1" | sha256sum | awk '{print $1}')
  metadata_cached="$metadata_work/$metadata_identity-services"
  if [ ! -f "$metadata_cached" ]; then
    deployment_json services '' '' "$1/.hai/compose.json" > "$metadata_cached" || return 1
  fi
  printf '%s\n' "$metadata_cached"
}
deployment_forget_metadata() {
  metadata_identity=$(printf '%s' "$1" | sha256sum | awk '{print $1}')
  for metadata_cached in "$metadata_work/$metadata_identity-"*; do
    test -f "$metadata_cached" || continue
    rm -f -- "$metadata_cached"
  done
}
`.replaceAll('\\${', '${').replace('@@JSON@@', () => shellArgument(createDeploymentJsonTool()))
}
