/** 从示例应用的公开 YAML 与统一模块清单更新环境说明，不读取 .env.local。 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { configEnvironmentVariables, moduleEnvironmentVariables, renderEnvironment, runtimeEnvironmentVariables } from '../packages/cli/src/commands/cli-config-environment.ts'

const catalog = JSON.parse(await readFile('packages/cli/src/commands/cli-config-catalog.json', 'utf8'))
const byName = new Map(catalog.map(variable => [variable.name, variable]))
const check = process.argv.includes('--check')

/** 收集实际应用入口直接读取的环境变量；跳过生成目录与测试夹具。 */
async function runtimeVariables(directory, names = new Set()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.svelte-kit', 'paraglide', 'target', 'tests', 'e2e', 'src-tauri'].includes(entry.name))
      continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await runtimeVariables(file, names)
    }
    else if (/\.(?:ts|js|svelte)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      for (const variable of runtimeEnvironmentVariables(await readFile(file, 'utf8')))
        names.add(variable.name)
    }
  }
  return names
}

for (const app of await readdir('apps')) {
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
  for (const configFile of await readdir(path.join(directory, 'config')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    if (!configFile.endsWith('.yml'))
      continue
    const module = configFile.replace(/^_/, '').replace(/\.yml$/, '')
    modules.add(module)
    for (const variable of configEnvironmentVariables(module, await readFile(path.join(directory, 'config', configFile), 'utf8')))
      active.set(variable.name, variable)
  }
  // 纯客户端应用的公开地址来自已有公共示例；本机私有覆盖不参与生成。
  for (const [name, value] of Object.entries(parseEnv(previous))) {
    if (name.startsWith('PUBLIC_'))
      active.set(name, { ...byName.get(name), name, value, path: name })
  }
  const optionalNames = await runtimeVariables(directory)
  if (modules.has('iam'))
    optionalNames.add('HAI_ADMIN_DEFAULT_PASSWORD')
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
  for (const name of active.keys())
    optional.delete(name)
  const optionalText = renderEnvironment([...optional.values()]).split('\n').map(line => line && !line.startsWith('#') ? `# ${line}` : line).join('\n')
  const content = [
    '# 环境配置示例：包含本应用完整可用字段、说明和取值约束。',
    '# .env / .env.dev / .env.test / .env.prod 为公共配置，提交 Git；.env.local 为本机私有覆盖，不提交。',
    '# 优先级：进程环境 > .env.local > .env.<dev|test|prod> > .env。',
    '# 可选字段先在 YAML 声明，或使用父级对象整体覆盖；完整框架变量见根 .env.example。',
    '',
    renderEnvironment([...active.values()]),
    '',
    '# 可选字段（模块字段先启用 YAML 路径，运行时入口可直接注入）：',
    optionalText.trimEnd(),
    '',
  ].join('\n')
  if (check) {
    if (previous !== content)
      throw new Error(`${file} is stale; run pnpm generate:env`)
  }
  else {
    await writeFile(file, content)
  }
}
process.stdout.write(`App environment examples: ${check ? 'verified' : 'updated'}\n`)
