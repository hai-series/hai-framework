/** 从示例应用的公开 YAML、hai.json 与统一模块清单更新环境说明，不读取 .env.local。 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { configEnvironmentVariables, documentConfig, moduleEnvironmentVariables, renderEnvironment, runtimeEnvironmentVariables } from '../packages/cli/src/commands/cli-config-environment.ts'
import { environmentReferenceSource } from './env-reference-source.mjs'

const catalog = JSON.parse(await readFile('packages/cli/src/commands/cli-config-catalog.json', 'utf8'))
const byName = new Map(catalog.map(variable => [variable.name, variable]))
const check = process.argv.includes('--check')

/** 收集实际应用入口直接读取的环境变量；跳过生成目录与测试夹具。 */
async function runtimeVariables(directory, names = new Set()) {
  // NTFS与Linux返回顺序不同；先稳定文件次序，避免可选变量的说明顺序随平台漂移。
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (['node_modules', 'dist', 'build', '.svelte-kit', 'paraglide', 'target', 'tests', 'e2e', 'src-tauri'].includes(entry.name))
      continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await runtimeVariables(file, names)
    }
    else if (/\.(?:ts|js|svelte)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      for (const variable of runtimeEnvironmentVariables(environmentReferenceSource(await readFile(file, 'utf8'), file)))
        names.add(variable.name)
    }
  }
  return names
}

for (const app of (await readdir('apps')).sort()) {
  const directory = path.join('apps', app)
  const file = path.join(directory, '.env.example')
  let previous
  try {
    previous = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n')
  }
  catch (error) {
    if (error.code === 'ENOENT')
      continue
    throw error
  }
  const active = new Map()
  const modules = new Set()
  for (const configFile of (await readdir(path.join(directory, 'config')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).sort()) {
    if (!configFile.endsWith('.yml'))
      continue
    const module = configFile.replace(/^_/, '').replace(/\.yml$/, '')
    modules.add(module)
    const configPath = path.join(directory, 'config', configFile)
    const original = (await readFile(configPath, 'utf8')).replaceAll('\r\n', '\n')
    const documented = documentConfig(module, original)
    if (documented !== original) {
      if (check)
        throw new Error(`${configPath} field documentation is stale; run pnpm generate:env`)
      await writeFile(configPath, documented)
    }
    for (const variable of configEnvironmentVariables(module, documented))
      active.set(variable.name, variable)
  }
  // 部署属于项目级配置；迁移到 JSON 后仍保留显式变量、路径及可选部署字段。
  const projectConfig = await readFile(path.join(directory, 'hai.json'), 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
  if (projectConfig !== null) {
    const project = JSON.parse(projectConfig)
    if (project.deploy && typeof project.deploy === 'object' && !Array.isArray(project.deploy)) {
      modules.add('deploy')
      for (const variable of configEnvironmentVariables('deploy', JSON.stringify(project.deploy)))
        active.set(variable.name, variable)
    }
  }
  // 纯客户端应用的公开地址来自已有公共示例；本机私有覆盖不参与生成。
  for (const [name, value] of Object.entries(parseEnv(previous))) {
    if (name.startsWith('PUBLIC_'))
      active.set(name, { ...byName.get(name), name, value, path: name })
  }
  const optionalNames = await runtimeVariables(directory)
  if (modules.has('iam')) {
    optionalNames.add('HAI_ADMIN_DEFAULT_PASSWORD')
  }
  if (modules.has('serv') || modules.has('kit')) {
    for (const name of ['HOST', 'PORT', 'NODE_ENV'])
      optionalNames.add(name)
  }
  const optional = new Map([...modules].flatMap(module => moduleEnvironmentVariables(module)).map(variable => [variable.name, variable]))
  for (const name of optionalNames) {
    const metadata = byName.get(name)
    if (metadata)
      optional.set(name, metadata)
  }
  for (const [name, variable] of active) {
    if (variable.optional)
      optional.set(name, variable)
    else
      optional.delete(name)
  }
  const candidates = [...optional.values()]
  const primitiveArrays = candidates.filter(variable => variable.constraint.includes('JSON 数组') && candidates.some(child => child.name === `${variable.name}_0` && !child.constraint.includes('JSON 对象')))
  const optionalText = renderEnvironment(candidates.filter((variable) => {
    if (primitiveArrays.some(parent => variable.name.startsWith(`${parent.name}_`)) && !active.has(variable.name))
      return false
    if (!(variable.constraint.includes('JSON 对象') || variable.constraint.includes('JSON 数组')) || variable.constraint.includes('false'))
      return true
    if ([...active.values()].some(child => child.name.startsWith(`${variable.name}_`)))
      return false
    return !candidates.some(child => child.name.startsWith(`${variable.name}_`)) || primitiveArrays.includes(variable)
  }))
    .split('\n')
    .map(line => line && !line.startsWith('#') ? `# ${line}` : line)
    .join('\n')
  const content = [
    '# 环境配置示例：包含本应用完整可用字段、说明和取值约束。',
    '# .env / .env.dev / .env.test / .env.prod 为公共配置，提交 Git；.env.local 为本机私有覆盖，不提交。',
    '# 优先级：进程环境 > .env.local > .env.<dev|test|prod> > .env。',
    '# 可选字段先在 YAML 或 hai.json.deploy 中启用对应配置块；一般优先设置细项，避免再用父 JSON 覆盖。完整框架变量见根 .env.example。',
    '',
    renderEnvironment([...active.values()].filter(variable => !variable.optional)),
    '',
    '# 可选字段（模块字段先启用 YAML 路径，运行时入口可直接注入）：',
    optionalText.trimEnd(),
    '',
  ].join('\n')
  if (check) {
    if (previous !== content)
      throw new Error(`${file} is stale; run pnpm generate:env`)
  }
  else if (previous !== content) {
    await writeFile(file, content)
  }
}
process.stdout.write(`App environment examples: ${check ? 'verified' : 'updated'}\n`)
