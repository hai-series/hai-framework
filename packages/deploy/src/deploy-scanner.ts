/** 应用、环境文件与中间件依赖扫描；不依赖 deploy.init()，不修改进程环境。 */
import type { HaiResult } from '@h-ai/core'
import type { DeployScanOptions, MiddlewareRequirement, ScanResult, ServiceType } from './deploy-types.js'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { parseAllDocuments } from 'yaml'
import { loadDeploymentConfig, loadDeploymentEnvironment } from './deploy-environment.js'
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'scanner' })

/** 安全缩窄 YAML/JSON 对象；数组与 null 不作为配置对象。 */
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/**
 * 从当前 workspace 的 lockfile 导入项遍历运行依赖，排除 dev 和 peer 边。
 * pnpm 12 的工具链和应用分别存于多个 YAML 文档，只选择含目标 importer 的应用文档。
 * 缺少 lockfile 或目标 importer 时要求先安装，不读取 package.json 或推测应用布局。
 */
function runtimeDependencies(appDir: string): { runtime: Set<string>, build: Set<string>, root: string } {
  let root = appDir
  while (!existsSync(join(root, 'pnpm-lock.yaml'))) {
    const parent = dirname(root)
    if (parent === root)
      throw new Error('Missing pnpm lockfile; run pnpm install')
    root = parent
  }
  const importerKey = relative(root, appDir).replaceAll('\\', '/') || '.'
  const documents = parseAllDocuments(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'))
  if (documents.some(document => document.errors.length))
    throw new Error('Invalid pnpm lockfile')
  const lock = documents.map(document => record(document.toJS())).reverse().find(document => importerKey in record(document.importers))
  if (!lock)
    throw new Error('Application is missing from pnpm lockfile; run pnpm install')
  const importers = record(lock.importers)
  const packages = record(lock.packages)
  const snapshots = record(lock.snapshots)
  const names = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string, node: Record<string, unknown>, importer?: string): void => {
    if (visited.has(id))
      return
    visited.add(id)
    const metadata = importer === undefined ? record(packages[id.split('(')[0]]) : {}
    const peers = record(metadata.peerDependencies)
    for (const [name, reference] of Object.entries({ ...record(node.dependencies), ...record(node.optionalDependencies) })) {
      if (name in peers)
        continue
      const version = typeof reference === 'string' ? reference : record(reference).version
      if (typeof version !== 'string')
        throw new Error('Invalid pnpm dependency reference')
      if (version.startsWith('link:')) {
        if (importer === undefined)
          throw new Error('Invalid workspace dependency')
        const target = relative(root, resolve(root, importer, version.slice(5))).replaceAll('\\', '/') || '.'
        const linked = record(importers[target])
        if (!Object.keys(linked).length)
          throw new Error('Missing linked workspace importer')
        names.add(name)
        visit(`workspace:${target}`, linked, target)
        continue
      }
      // npm alias 的引用已包含真实包名，不能再拼接别名。
      const key = version in snapshots || version in packages ? version : `${name}@${version}`
      names.add(key.match(/^(@[^/]+\/[^@]+|[^@]+)@/)?.[1] ?? name)
      const snapshot = record(snapshots[key] ?? packages[key])
      if (!Object.keys(snapshot).length && !(key in snapshots) && !(key in packages))
        throw new Error('Missing pnpm dependency snapshot')
      visit(key, snapshot)
    }
  }
  visit(`workspace:${importerKey}`, record(importers[importerKey]), importerKey)
  return { runtime: names, build: new Set([...names, ...Object.keys(record(record(importers[importerKey]).devDependencies))]), root }
}

/**
 * 扫描依赖和实际环境下的后端，不把 memory/local/console 强制改为外部服务。
 * 沿目标 importer 的运行依赖识别模块；LDAP 等可选能力再按实际配置识别。
 * @example `await scanApp('/workspace/packages/my-serv', { environment: 'prod' })`
 */
export async function scanApp(inputDir: string, options?: DeployScanOptions): Promise<HaiResult<ScanResult>> {
  try {
    const appDir = resolve(inputDir)
    const graph = runtimeDependencies(appDir)
    const envDir = options?.envDir ? resolve(options.envDir) : existsSync(join(appDir, '.env')) ? appDir : graph.root
    const loaded = loadDeploymentEnvironment({ environment: options?.environment ?? 'prod', envDir, requireFile: options?.environment !== undefined })
    if (!loaded.success)
      return loaded
    const env = loaded.data.values
    const deps = graph.runtime
    const configs: Record<string, Record<string, unknown>> = {}
    for (const [name, owner] of Object.entries({ db: 'reldb', cache: 'cache', storage: 'storage', vecdb: 'vecdb', iam: 'iam', reach: 'reach' })) {
      configs[name] = {}
      if (!deps.has(`@h-ai/${owner}`))
        continue
      const configFile = ['yml', 'yaml'].map(ext => join(appDir, 'config', `_${name}.${ext}`)).find(existsSync)
      const config = configFile ? loadDeploymentConfig(name, configFile, env) : undefined
      if (config && !config.success)
        return config
      configs[name] = config?.data ?? {}
    }
    const middlewares: MiddlewareRequirement[] = []
    const add = (service: ServiceType, backend: string, configName = service as string, configPath: string[] = [], config = configs[configName] ?? {}, source = `_${configName}.yml`) => {
      middlewares.push({ service, backend, source, configName, configPath, envPrefix: ['HAI', configName, ...configPath].map(part => part.toUpperCase()).join('_'), config })
    }
    const iam = deps.has('@h-ai/iam')
    if (deps.has('@h-ai/reldb'))
      add('db', String(configs.db.type ?? 'sqlite'), 'db', [], configs.db, '@h-ai/reldb / _db.yml')
    if (deps.has('@h-ai/cache'))
      add('cache', String(configs.cache.type ?? 'memory'), 'cache', [], configs.cache, '@h-ai/cache / _cache.yml')
    if (deps.has('@h-ai/storage'))
      add('storage', String(configs.storage.type ?? 'local'))
    if (deps.has('@h-ai/vecdb'))
      add('vecdb', String(configs.vecdb.type ?? 'lancedb'))
    if (iam) {
      const ldap = record(configs.iam.ldap)
      add('ldap', record(configs.iam.login).ldap === true ? 'ldap' : 'disabled', 'iam', ['ldap'], ldap, '@h-ai/iam (LDAP)')
    }
    const providers = configs.reach.providers
    if (deps.has('@h-ai/reach') && Array.isArray(providers)) {
      for (const [index, item] of providers.entries()) {
        const provider = record(item)
        const type = String(provider.type ?? '')
        const service = type === 'aliyun-sms' ? 'sms' : ['smtp', 'api', 'console'].includes(type) ? 'email' : undefined
        if (service)
          add(service, type, 'reach', ['providers', String(index)], provider, '@h-ai/reach')
      }
    }
    if (deps.has('@h-ai/reach') && !middlewares.some(item => item.configName === 'reach'))
      add('email', 'console', 'reach', ['providers', '0'], { name: 'email', type: 'console' }, '@h-ai/reach')
    const isSvelteKit = graph.build.has('@sveltejs/kit')
    const scan: ScanResult = {
      appDir,
      envDir,
      middlewares,
      haiModules: [...deps].filter(name => name.startsWith('@h-ai/')).sort(),
      appName: basename(appDir),
      isSvelteKit,
      adapterInstalled: graph.build.has('@sveltejs/adapter-vercel'),
      nodeAdapterInstalled: graph.build.has('@sveltejs/adapter-node'),
      requiredServices: [...new Set(middlewares.map(item => item.service))],
      serviceBackends: Object.fromEntries(middlewares.map(item => [item.service, item.backend])),
    }
    logger.info('Application scanned', { appName: scan.appName, haiModules: scan.haiModules, requiredServices: scan.requiredServices, serviceBackends: scan.serviceBackends })
    return ok(scan)
  }
  catch {
    // JSON/YAML 异常可能带有凭据行，不把原异常暴露到日志或用户错误。
    return err(HaiDeployError.SCAN_FAILED, deployM('deploy_scanFailed', { params: { error: 'Invalid or ambiguous application/configuration/lockfile; specify the application directory and run pnpm install' } }))
  }
}
