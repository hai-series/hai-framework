/**
 * 生成运行配置定稿与回滚函数；Node 直接复用已导入的应用镜像。
 * @param primaryService - 安装的主应用服务。
 * @returns 合入部署入口的 Shell 函数，不要求服务器安装 Node。
 * @example 模块内部上下文
 * ```ts
 * const script = createRuntimeConfigurationScript('serv')
 * void script
 * ```
 */
export function createRuntimeConfigurationScript(primaryService: 'serv' | 'web'): string {
  return String.raw`configuration_mount() {
  configuration_mount_source=$(printf '%s' "$1" | sed 's/"/""/g')
  printf 'type=bind,"source=%s",target=%s,readonly' "$configuration_mount_source" "$2"
}
remove_runtime_preparation() {
  if [ -z "$configuration_container" ] && [ "$configuration_creation_started" = true ]; then
    if [ -f "$metadata_work/runtime-container.id" ] && [ ! -L "$metadata_work/runtime-container.id" ]; then configuration_container=$(cat "$metadata_work/runtime-container.id"); fi
    if ! printf '%s\n' "$configuration_container" | LC_ALL=C awk 'length($0)!=64 || $0!~/^[a-f0-9]+$/ {exit 1}'; then
      printf 'Runtime preparation container creation has no confirmed receipt; inspect the runtime before retrying.\n' >&2
      return 1
    fi
  fi
  test -n "$configuration_container" || return 0
  configuration_owner=$("$runtime" inspect --format '{{index .Config.Labels "org.h-ai.deploy.runtime-preparation"}}' "$configuration_container") || return 1
  test "$configuration_owner" = "$id" || { printf 'Cannot confirm runtime preparation container ownership.\n' >&2; return 1; }
  "$runtime" rm -f -v "$configuration_container" >/dev/null || return 1
  configuration_remaining=$("$runtime" ps -aq --no-trunc --filter "id=$configuration_container") || return 1
  test -z "$configuration_remaining" || { printf 'Runtime preparation container cleanup failed.\n' >&2; return 1; }
  configuration_container=''
  configuration_creation_started=false
}
restore_application_runtime() {
  test "$runtime_config_changed" = true || return 0
  if [ "$runtime_config_existed" = true ]; then
    (set -C; cat "$release/.hai/previous-runtime.env" > "$root/config/.env.runtime.restore-$id") || return 1
    chmod 644 "$root/config/.env.runtime.restore-$id" || return 1
    mv "$root/config/.env.runtime.restore-$id" "$root/config/.env.runtime" || return 1
  else
    rm -f -- "$root/config/.env.runtime" || return 1
  fi
  runtime_config_changed=false
}
prepare_application_runtime() {
  configuration_snapshot="$release/config/.env.runtime"
  configuration_current="$root/config/.env.runtime"
  test -d "$release/config" && test ! -L "$release/config" && test -f "$configuration_snapshot" && test ! -L "$configuration_snapshot" || { printf 'Invalid application configuration snapshot.\n' >&2; return 1; }
  if [ -e "$root/config" ] || [ -L "$root/config" ]; then
    test -d "$root/config" && test ! -L "$root/config" || return 1
  else
    mkdir "$root/config"
  fi
  chmod 755 "$root/config"
  if [ -e "$configuration_current" ] || [ -L "$configuration_current" ]; then
    test -f "$configuration_current" && test ! -L "$configuration_current" || return 1
  fi
  configuration_selected=false
  case " $selected " in *' @@PRIMARY@@ '*) configuration_selected=true;; esac
  configuration_mode=full
  if [ "$partial" = true ]; then configuration_mode=partial; fi
  if [ "$configuration_selected" = false ]; then configuration_mode=retain; fi
  if [ "$partial" = true ]; then test -f "$configuration_current" || { printf 'Installed application runtime configuration is missing.\n' >&2; return 1; }; fi
  configuration_node=$(deployment_json read metadata.node-runtime string "$release/manifest.json")
  case "$configuration_node" in true|false) ;; *) printf 'Invalid Node runtime metadata.\n' >&2; return 1;; esac
  if [ "$configuration_mode" = retain ]; then
    cp "$configuration_current" "$configuration_snapshot"
  elif [ "$configuration_node" = true ]; then
    configuration_image=$(deployment_json read services.@@PRIMARY@@.image string "$release/.hai/compose.json")
    test -f "$release/.hai/runtime-env.mjs" && test ! -L "$release/.hai/runtime-env.mjs" || return 1
    cp "$release/manifest.json" "$metadata_work/runtime-manifest.json"
    cp "$configuration_snapshot" "$metadata_work/runtime-candidate.env"
    chmod 644 "$metadata_work/runtime-manifest.json" "$metadata_work/runtime-candidate.env"
    configuration_previous_manifest='-'
    configuration_previous_environment='-'
    configuration_credentials='-'
    set -- create --pull never --network none --read-only --cap-drop ALL --user 0:0 --log-driver none --env NODE_OPTIONS= --label "org.h-ai.deploy.runtime-preparation=$id" --cidfile "$metadata_work/runtime-container.id" --entrypoint node
    set -- "$@" --mount "$(configuration_mount "$release/.hai/runtime-env.mjs" /runtime-env.mjs)"
    set -- "$@" --mount "$(configuration_mount "$metadata_work/runtime-manifest.json" /input/manifest.json)"
    set -- "$@" --mount "$(configuration_mount "$metadata_work/runtime-candidate.env" /input/config/.env.runtime)"
    if [ -n "$previous" ]; then
      cp "$root/releases/$previous/manifest.json" "$metadata_work/runtime-previous-manifest.json"
      chmod 644 "$metadata_work/runtime-previous-manifest.json"
      set -- "$@" --mount "$(configuration_mount "$metadata_work/runtime-previous-manifest.json" /input/previous-manifest.json)"
      configuration_previous_manifest=/input/previous-manifest.json
    fi
    if [ -f "$configuration_current" ]; then
      cp "$configuration_current" "$metadata_work/runtime-previous.env"
      chmod 644 "$metadata_work/runtime-previous.env"
      set -- "$@" --mount "$(configuration_mount "$metadata_work/runtime-previous.env" /input/previous.env)"
      configuration_previous_environment=/input/previous.env
    fi
    if [ -f "$root/managed-secrets.env" ]; then
      cp "$root/managed-secrets.env" "$metadata_work/runtime-credentials.env"
      chmod 644 "$metadata_work/runtime-credentials.env"
      set -- "$@" --mount "$(configuration_mount "$metadata_work/runtime-credentials.env" /input/credentials.env)"
      configuration_credentials=/input/credentials.env
    fi
    configuration_creation_started=true
    "$runtime" "$@" "$configuration_image" /runtime-env.mjs prepare /input/ "$configuration_previous_manifest" "$configuration_previous_environment" "$configuration_credentials" "$configuration_mode" > "$metadata_work/runtime-create.log"
    configuration_container=$(cat "$metadata_work/runtime-container.id")
    printf '%s\n' "$configuration_container" | LC_ALL=C awk 'length($0)!=64 || $0!~/^[a-f0-9]+$/ {exit 1}'
    configuration_owner=$("$runtime" inspect --format '{{index .Config.Labels "org.h-ai.deploy.runtime-preparation"}}' "$configuration_container")
    test "$configuration_owner" = "$id" || return 1
    "$runtime" start --attach "$configuration_container" > "$metadata_work/runtime-result.json"
    test "$("$runtime" inspect --format '{{.State.ExitCode}}' "$configuration_container")" = 0 || return 1
    remove_runtime_preparation
    deployment_json runtime environment string "$metadata_work/runtime-result.json" > "$configuration_snapshot.next"
    deployment_json runtime manifest json "$metadata_work/runtime-result.json" > "$release/manifest.json.next"
    mv "$configuration_snapshot.next" "$configuration_snapshot"
    mv "$release/manifest.json.next" "$release/manifest.json"
    deployment_forget_metadata "$release"
  elif [ "$configuration_mode" = partial ]; then
    # 静态应用的托管字段由交付器写成单行；其余业务正文原样保留给 Compose。
    configuration_keys=$(deployment_metadata_file "$release" managed-app-keys)
    LC_ALL=C awk '
      FILENAME==ARGV[1] {if(NF) keys[$0]=1; next}
      FILENAME==ARGV[2] {at=index($0,"="); name=substr($0,1,at-1); if(name in keys) {values[name]=$0}; next}
      {
        at=index($0,"="); name=substr($0,1,at-1); hidden=(name in values)
        for(parent in values) if(index(name,parent "_")==1) hidden=1
        if(!hidden) print
      }
      END {for(name in values) print values[name]}
    ' "$configuration_keys" "$configuration_current" "$configuration_snapshot" > "$configuration_snapshot.next"
    mv "$configuration_snapshot.next" "$configuration_snapshot"
  fi
  chmod 755 "$release/config"
  chmod 644 "$configuration_snapshot"
  test "$configuration_selected" = true || return 0
  if [ -f "$configuration_current" ]; then
    runtime_config_existed=true
    cp "$configuration_current" "$release/.hai/previous-runtime.env"
    chmod 600 "$release/.hai/previous-runtime.env"
  fi
  (set -C; : > "$root/config/.env.runtime.next-$id")
  runtime_next_owned=true
  cat "$configuration_snapshot" > "$root/config/.env.runtime.next-$id"
  chmod 644 "$root/config/.env.runtime.next-$id"
  mv "$root/config/.env.runtime.next-$id" "$configuration_current"
  runtime_next_owned=false
  runtime_config_changed=true
}
`.replaceAll('@@PRIMARY@@', () => primaryService)
}
