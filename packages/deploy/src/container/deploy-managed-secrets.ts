/** 自建中间件凭据在服务器定稿；打包机仅提供首次部署候选值。 */
import { parseEnv } from 'node:util'
import { deployM } from '../deploy-i18n.js'

const groups = [
  { name: 'DB_PASSWORD', keys: ['POSTGRES_PASSWORD', 'MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD'], services: ['db', 'vecdb'] },
  { name: 'STORAGE_PASSWORD', keys: ['RUSTFS_SECRET_KEY', 'MINIO_ROOT_PASSWORD'], services: ['storage'] },
  { name: 'LDAP_PASSWORD', keys: ['LDAP_ADMIN_PASSWORD'], services: ['ldap'] },
]
const appPrefixes: Record<string, string> = { db: 'HAI_DB', vecdb: 'HAI_VECDB', storage: 'HAI_STORAGE', ldap: 'HAI_IAM_LDAP' }

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
      if (!Array.isArray(service.volumes))
        continue
      for (const mount of service.volumes) {
        if (typeof mount !== 'string')
          continue
        const source = mount.split(':')[0]!
        if (!Object.hasOwn(compose.volumes ?? {}, source))
          continue
        const declaration = compose.volumes![source]
        const details = declaration && typeof declaration === 'object' ? declaration : {}
        const volume = 'name' in details && typeof details.name === 'string'
          ? details.name
          : 'external' in details && details.external === true ? source : `hai-${projectName}_${source}`
        if (!/^\w[\w.-]*$/.test(volume))
          throw new Error(deployM('deploy_managedSecretsInvalid'))
        volumes.add(`${group.name} ${volume}`)
      }
    }
  }
  return {
    'managed-candidates.env': candidates.length ? `${candidates.join('\n')}\n` : '',
    'managed-bindings': bindings.size ? `${[...bindings].join('\n')}\n` : '',
    'managed-volumes': volumes.size ? `${[...volumes].join('\n')}\n` : '',
    'resolve-managed-secrets.sh': createManagedSecretScript(),
  }
}

/** 由 apply.sh 持有项目部署锁时调用，不输出密码值。 */
function createManagedSecretScript(): string {
  return String.raw`#!/bin/sh
# 由 apply.sh 在项目部署锁内调用；长期凭据只保存在服务器，不依赖打包机。
set -eu
umask 077
root=$1
release=$2
runtime=$3
state="$root/managed-secrets.env"
candidate_file="$release/managed-candidates.env"
test -s "$candidate_file" || exit 0
fail() { printf '%s\n' "$*" >&2; exit 1; }
valid_values() {
  LC_ALL=C awk -F= '
    NF {if(NF!=2 || $1!~/^(DB_PASSWORD|STORAGE_PASSWORD|LDAP_PASSWORD)$/ || $2!~/^[A-Za-z0-9_-]+$/ || length($2)!=32 || seen[$1]++) exit 1}
  ' "$1"
}
value_of() { awk -F= -v key="$2" '$1==key {print $2}' "$1"; }
test ! -L "$state" || fail "Invalid managed middleware credential state: $state"
valid_values "$candidate_file" || fail 'Invalid managed middleware credential candidates; rebuild the deployment bundle.'
next="$release/managed-secrets.next"
if [ -f "$state" ]; then
  test -s "$state" && valid_values "$state" || fail "Invalid managed middleware credential state: $state. Restore its protected backup."
  cp "$state" "$next"
else
  : > "$next"
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
    done < "$release/managed-volumes"
    value=$candidate
    printf '%s=%s\n' "$name" "$value" >> "$next"
  fi
done < "$candidate_file"
while IFS='=' read -r name candidate; do
  test -n "$name" || continue
  value=$(value_of "$next" "$name")
  for file in .env.runtime middleware.env middleware-runtime.env; do
    HAI_DEPLOY_SECRET_CANDIDATE="$candidate" HAI_DEPLOY_SECRET_VALUE="$value" LC_ALL=C awk -v group="$name" '
      FILENAME==ARGV[1] {if($1==group) {keys[$2]=$3}; next}
      function replace_literal(line, needle, value, result, at) {
        result=""
        while((at=index(line,needle))>0) {result=result substr(line,1,at-1) value; line=substr(line,at+length(needle))}
        return result line
      }
      {
        equal=index($0,"="); key=substr($0,1,equal-1); scoped=0
        for(prefix in keys) if(key==prefix || (keys[prefix]=="prefix" && index(key,prefix "_")==1)) scoped=1
        if(scoped) print replace_literal($0,ENVIRON["HAI_DEPLOY_SECRET_CANDIDATE"],ENVIRON["HAI_DEPLOY_SECRET_VALUE"])
        else print
      }
    ' "$release/managed-bindings" "$release/$file" > "$release/$file.next"
    mv "$release/$file.next" "$release/$file"
  done
done < "$candidate_file"
chmod 600 "$next"
mv "$next" "$state"
printf '[INFO] Managed middleware credential source: %s (server state; values hidden).\n' "$state"
`
}
