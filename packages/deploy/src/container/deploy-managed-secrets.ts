/** 自建中间件凭据在服务器定稿；打包机仅提供首次部署候选值。 */
import { parseEnv } from 'node:util'
import { deployM } from '../deploy-i18n.js'
import { createDeploymentManifestFunctions } from './deploy-manifest.js'

const groups = [
  { name: 'DB_PASSWORD', keys: ['POSTGRES_PASSWORD', 'MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD'], services: ['db', 'vecdb'] },
  { name: 'STORAGE_PASSWORD', keys: ['RUSTFS_SECRET_KEY', 'MINIO_ROOT_PASSWORD'], services: ['storage'] },
  { name: 'LDAP_PASSWORD', keys: ['LDAP_ADMIN_PASSWORD'], services: ['ldap'] },
]
const appPrefixes: Record<string, string> = { db: 'HAI_DB', vecdb: 'HAI_VECDB', storage: 'HAI_STORAGE', ldap: 'HAI_IAM_LDAP' }

/**
 * 按实际 Compose 声明解析命名卷，供凭据与后端身份清单共用。
 * @param projectName - 含环境的部署身份，不含 hai- 前缀。
 * @param mounts - 服务的 Compose volumes 字段。
 * @param declarations - Compose 顶层命名卷声明。
 * @returns 去重后的容器引擎实际卷名；忽略 bind mount。
 * @throws Error - 实际卷名不能安全写入部署清单。
 * @example 模块内部上下文
 * ```ts
 * const volumes = resolveComposeNamedVolumes('shop-prod', ['data:/data'], { data: null })
 * ```
 */
export function resolveComposeNamedVolumes(projectName: string, mounts: unknown, declarations: Record<string, unknown> = {}): string[] {
  if (!Array.isArray(mounts))
    return []
  const volumes = new Set<string>()
  for (const mount of mounts) {
    if (typeof mount !== 'string')
      continue
    const source = mount.split(':')[0]!
    if (!Object.hasOwn(declarations, source))
      continue
    const declaration = declarations[source]
    const details = declaration && typeof declaration === 'object' ? declaration : {}
    const volume = 'name' in details && typeof details.name === 'string'
      ? details.name
      : 'external' in details && details.external === true ? source : `hai-${projectName}_${source}`
    if (!/^\w[\w.-]*$/.test(volume))
      throw new Error(deployM('deploy_managedSecretsInvalid'))
    volumes.add(volume)
  }
  return [...volumes]
}

/**
 * 生成候选和卷身份清单；服务器以自己保存的状态覆盖候选，不把本机缓存当作长期凭据。
 * @param projectName - 含环境的部署身份，与 Compose project 参数一致。
 * @param nativeEnvironment - 仅供中间件使用的 dotenv。
 * @param compose - 当前生成的实际服务与命名卷。
 * @param compose.services - 实际启用的 Compose 服务。
 * @param compose.volumes - Compose 命名卷声明。
 * @returns 随不可变部署包传输的私有候选、卷清单和服务器执行脚本。
 * @throws Error - 候选不符合自动生成值格式，或同组凭据互相冲突。
 * @example 模块内部上下文
 * ```ts
 * const assets = createManagedSecretAssets('shop-test', '', { services: {} })
 * const script = assets['resolve-managed-secrets.sh']
 * ```
 */
export function createManagedSecretAssets(projectName: string, nativeEnvironment: string, compose: {
  services: Record<string, Record<string, unknown>>
  volumes?: Record<string, unknown>
}): Record<string, string> {
  const native = parseEnv(nativeEnvironment)
  const candidates: string[] = []
  const bindings = new Set<string>()
  const volumes = new Set<string>()
  for (const group of groups) {
    const values = [...new Set(group.keys.flatMap(key => native[key] === undefined ? [] : [native[key]!]))]
    if (!values.length)
      continue
    if (values.length !== 1 || !/^[\w-]{32}$/.test(values[0]!))
      throw new Error(deployM('deploy_managedSecretsInvalid'))
    candidates.push(`${group.name}=${values[0]}`)
    for (const key of group.keys.filter(key => native[key] !== undefined))
      bindings.add(`${group.name} ${key} exact`)
    for (const name of group.services) {
      const service = compose.services[name]
      if (!service?.env_file)
        continue
      bindings.add(`${group.name} ${appPrefixes[name]} prefix`)
      for (const volume of resolveComposeNamedVolumes(projectName, service.volumes, compose.volumes))
        volumes.add(`${group.name} ${volume}`)
    }
  }
  return {
    'managed-project': `hai-${projectName}\n`,
    'managed-candidates.env': candidates.length ? `${candidates.join('\n')}\n` : '',
    'managed-bindings': bindings.size ? `${[...bindings].join('\n')}\n` : '',
    'managed-volumes': volumes.size ? `${[...volumes].join('\n')}\n` : '',
    'resolve-managed-secrets.sh': createManagedSecretScript(),
  }
}

/**
 * 复用现有服务器凭据格式校验，不解码或输出任何凭据值。
 * @returns 定义 valid_values 的纯 Shell 片段，兼容首次候选与受控导入 v2。
 * @example 模块内部上下文
 * ```ts
 * const validation = createManagedSecretValidationScript()
 * const script = [validation, 'valid_values "$credential_file"'].join('\n')
 * // 仅在部署包内校验可信路径，不将凭据内容写入日志或返回给浏览器。
 * void script
 * ```
 */
export function createManagedSecretValidationScript(): string {
  return String.raw`valid_values() {
  version=$(awk -F= '$1=="FORMAT_VERSION" {print $2}' "$1")
  if [ "$version" = 2 ]; then
    LC_ALL=C awk -F= '
      NF {
        if(NF!=2 || seen[$1]++) exit 1
        if($1=="FORMAT_VERSION") {if($2!="2") exit 1; next}
        if($1=="PROJECT") {if($2!~/^[A-Za-z0-9][A-Za-z0-9_.-]*$/) exit 1; project=1; next}
        if($1~/^VOLUME_[0-9]+$/) {if($2!~/^(DB_PASSWORD|STORAGE_PASSWORD|LDAP_PASSWORD):[A-Za-z0-9][A-Za-z0-9_.-]*$/) exit 1; next}
        if($1!~/^(DB_PASSWORD|STORAGE_PASSWORD|LDAP_PASSWORD)$/ || $2!~/^[0-9a-f]+$/ || length($2)%2 || length($2)>8192) exit 1
        for(i=1;i<=length($2);i+=2) {b=substr($2,i,2); if(b~/^[01]/ || b=="7f") exit 1}
      }
      END {if(!project) exit 1}
    ' "$1"
    return
  fi
  LC_ALL=C awk -F= '
    NF {if(NF!=2 || $1!~/^(DB_PASSWORD|STORAGE_PASSWORD|LDAP_PASSWORD)$/ || $2!~/^[A-Za-z0-9_-]+$/ || length($2)!=32 || seen[$1]++) exit 1}
  ' "$1"
}
`
}

/**
 * 生成由部署入口持锁调用的凭据定稿函数体，不输出密码值。
 * @returns 合入 apply.sh 的 Shell 代码，所有应用配置写入单一运行文件。
 * @example 模块内部上下文
 * ```ts
 * const script = createManagedSecretScript()
 * void script
 * ```
 */
export function createManagedSecretScript(): string {
  return String.raw`#!/bin/sh
# 由 apply.sh 在项目部署锁内调用；长期凭据只保存在服务器，不依赖打包机。
set -eu
umask 077
root=$1
release=$2
runtime=$3
state="$root/managed-secrets.env"
candidate_file="$release/.hai/managed-candidates.env"
test -d "$root" && test ! -L "$root" && test -d "$release/.hai" && test ! -L "$release/.hai" || exit 1
@@MANIFEST_FUNCTIONS@@
deployment_metadata_init
trap deployment_metadata_cleanup EXIT
managed_project=$(deployment_metadata_file "$release" managed-project)
managed_bindings=$(deployment_metadata_file "$release" managed-bindings)
managed_volumes=$(deployment_metadata_file "$release" managed-volumes)
test -s "$candidate_file" || exit 0
fail() { printf '%s\n' "$*" >&2; exit 1; }
@@MANAGED_VALUES_VALIDATOR@@
value_of() { awk -F= -v key="$2" '$1==key {print $2}' "$1"; }
test ! -L "$state" || fail "Invalid managed middleware credential state: $state"
valid_values "$candidate_file" || fail 'Invalid managed middleware credential candidates; rebuild the deployment bundle.'
next="$release/.hai/managed-secrets.next"
if [ -f "$state" ]; then
  test -s "$state" && valid_values "$state" || fail "Invalid managed middleware credential state: $state. Restore its protected backup."
  cp "$state" "$next"
else
  : > "$next"
fi
format=$(value_of "$next" FORMAT_VERSION)
if [ "$format" = 2 ]; then
  test "$(value_of "$next" PROJECT)" = "$(cat "$managed_project")" || fail 'Managed middleware credential project mismatch.'
  known=$("$runtime" volume ls -q) || fail 'Cannot check persistent volumes; managed middleware credentials were not changed.'
  while IFS=' ' read -r volume_group volume; do
    test -n "$volume" || continue
    binding="$volume_group:$volume"
    if ! awk -F= -v binding="$binding" '$1~/^VOLUME_[0-9]+$/ && $2==binding {found=1} END {exit !found}' "$next"; then
      if printf '%s\n' "$known" | grep -Fxq "$volume"; then
        fail 'Existing persistent volume is not bound to the imported credential state. Import its verified identity first.'
      fi
      index=$(awk -F= '$1~/^VOLUME_[0-9]+$/ {n=substr($1,8)+0; if(n>max)max=n} END {print max+1}' "$next")
      printf 'VOLUME_%s=%s\n' "$index" "$binding" >> "$next"
    fi
  done < "$managed_volumes"
fi
volumes_checked=false
known_volumes=''
while IFS='=' read -r name candidate; do
  test -n "$name" || continue
  value=$(value_of "$next" "$name")
  if [ -z "$value" ]; then
    if [ "$volumes_checked" = false ]; then
      known_volumes=$("$runtime" volume ls -q) || fail 'Cannot check persistent volumes; managed middleware credentials were not changed.'
      volumes_checked=true
    fi
    while IFS=' ' read -r volume_group volume; do
      test "$volume_group" = "$name" || continue
      if printf '%s\n' "$known_volumes" | grep -Fxq "$volume"; then
        fail "Missing $name in $state for existing persistent volume $volume. Restore the server credential state before retrying."
      fi
    done < "$managed_volumes"
    value=$candidate
    if [ "$format" = 2 ]; then value=$(printf '%s' "$candidate" | od -An -tx1 | tr -d ' \n'); fi
    printf '%s=%s\n' "$name" "$value" >> "$next"
  fi
done < "$candidate_file"
while IFS='=' read -r name candidate; do
  test -n "$name" || continue
  value=$(value_of "$next" "$name")
  for file in config/.env.runtime .hai/middleware-runtime.env; do
    compose_environment=false
    if [ "$file" = .hai/middleware-runtime.env ]; then compose_environment=true; fi
    HAI_DEPLOY_SECRET_CANDIDATE="$candidate" HAI_DEPLOY_SECRET_VALUE="$value" LC_ALL=C awk -v group="$name" -v format="$format" -v compose_environment="$compose_environment" '
      FILENAME==ARGV[1] {if($1==group) {keys[$2]=$3}; next}
      function replace_literal(line, needle, value, result, at) {
        result=""
        while((at=index(line,needle))>0) {result=result substr(line,1,at-1) value; line=substr(line,at+length(needle))}
        return result line
      }
      function decode_hex(hex, result, i, high, low) {
        for(i=1;i<=length(hex);i+=2) {high=index("0123456789abcdef",substr(hex,i,1))-1; low=index("0123456789abcdef",substr(hex,i+1,1))-1; result=result sprintf("%c",high*16+low)}
        return result
      }
      function json_escape(value, apostrophe, result, i, ch) {
        for(i=1;i<=length(value);i++) {
          ch=substr(value,i,1)
          if(ch=="\\") result=result "\\\\"
          else if(ch=="\"") result=result "\\\""
          else if(ch==sprintf("%c",39) && apostrophe) result=result "\\u0027"
          else result=result ch
        }
        return result
      }
      function uri_escape(value, result, i, ch, j, ordinal) {
        for(i=1;i<=length(value);i++) {
          ch=substr(value,i,1)
          if(ch~/[A-Za-z0-9_.~-]/) result=result ch
          else {ordinal=0; for(j=1;j<=255;j++) if(sprintf("%c",j)==ch) {ordinal=j; break}; result=result sprintf("%%%02X",ordinal)}
        }
        return result
      }
      {
        equal=index($0,"="); key=substr($0,1,equal-1); scoped=0
        for(prefix in keys) if(key==prefix || (keys[prefix]=="prefix" && index(key,prefix "_")==1)) scoped=1
        if(scoped && format==2 && index($0,ENVIRON["HAI_DEPLOY_SECRET_CANDIDATE"])>0) {
          candidate=ENVIRON["HAI_DEPLOY_SECRET_CANDIDATE"]; value=decode_hex(ENVIRON["HAI_DEPLOY_SECRET_VALUE"])
          literal=substr($0,equal+1); quote=sprintf("%c",39)
          json=substr(literal,1,1)==quote && (substr(literal,2,1)=="{" || substr(literal,2,1)=="[")
          if(json) literal=substr(literal,2,length(literal)-2)
          literal=replace_literal(literal,":" candidate "@",":" uri_escape(value) "@")
          if(json) {literal=replace_literal(literal,candidate,json_escape(value,1)); print key "=" quote literal quote}
          else {
            if(substr(literal,1,1)==quote || substr(literal,1,1)=="\"") literal=substr(literal,2,length(literal)-2)
            literal=replace_literal(literal,candidate,value)
            literal=json_escape(literal,0); if(compose_environment=="true") literal=replace_literal(literal,"$","$")
            print key "=\"" literal "\""
          }
        }
        else if(scoped) print replace_literal($0,ENVIRON["HAI_DEPLOY_SECRET_CANDIDATE"],ENVIRON["HAI_DEPLOY_SECRET_VALUE"])
        else print
      }
    ' "$managed_bindings" "$release/$file" > "$release/$file.next"
    mv "$release/$file.next" "$release/$file"
  done
done < "$candidate_file"
chmod 600 "$next"
mv "$next" "$state"
printf '[INFO] Managed middleware credential source: %s (server state; values hidden).\n' "$state"
`.replace('@@MANAGED_VALUES_VALIDATOR@@', () => createManagedSecretValidationScript()).replace('@@MANIFEST_FUNCTIONS@@', () => createDeploymentManifestFunctions())
}
