import type { TemplateContext } from '../cli-types.js'
import type { GenerateTarget } from './cli-generate-target.js'
import path from 'node:path'
import fse from 'fs-extra'
import { cliM } from '../cli-i18n.js'

/**
 * 一批经过预检后统一写入的生成文件。
 * @example `{ path: '/app/src/demo.ts', content: 'export const demo = true' }`
 */
export interface GeneratedFile {
  /** 输出文件的绝对路径。 */
  path: string
  /** 写入后的完整源码。 */
  content: string
  /** 仅聚合文件编辑携带原内容；写入前校验文件没有被其他操作修改。 */
  previousContent?: string
}

/** 向模板明确标注的现有入口追加 import/export/对象项；未知结构拒绝改写。 */
function appendAt(source: string, marker: string, entry: string): string {
  if (source.split(marker).length !== 2)
    throw new Error(cliM('cli_generateUnsupportedAggregator'))
  if (source.split(/\r?\n/).some(line => line.trim() === entry.trim()))
    return source
  // 模板的相对 import 均为单行；插在同组正确位置，避免增量生成破坏排序门禁。
  const moduleName = /^import .+ from ['"](.+)['"]$/.exec(entry)?.[1]
  if (moduleName) {
    for (const match of source.matchAll(/^import (?!type\b)[^\r\n]+ from ['"](\.[^'"]+)['"]\r?$/gm)) {
      if (match[1]!.localeCompare(moduleName) > 0)
        return `${source.slice(0, match.index)}${entry}\n${source.slice(match.index)}`
    }
  }
  return source.replace(marker, `${entry}\n${marker}`)
}

/**
 * 沿服务端依赖图生成 contract 与 procedure，并接入模板已有的聚合入口。
 * @param context - 已通过标识符校验的名称。
 * @param target - 解析后的后端 workspace 与共享 contract 包。
 * @returns 新源码及现有入口的完整修改计划，不在本函数落盘。
 * @throws Error - contract 包不唯一或入口不再具有可识别的生成标记。
 * @example `const files = await generateServApi(context, target)`
 */
export async function generateServApi(context: TemplateContext, target: GenerateTarget): Promise<GeneratedFile[]> {
  const contracts = target.packages.filter(pkg => pkg.dependencies['@h-ai/api-contract'] && pkg.dependencies.zod && pkg.name in target.target.dependencies)
  if (contracts.length !== 1)
    throw new Error(cliM('cli_generateUnsupportedAggregator'))
  const contract = contracts[0]!
  const contractSources = await fse.readdir(path.join(contract.directory, 'src'))
  const aggregators: Array<{ path: string, content: string }> = []
  for (const name of contractSources.filter(name => name.endsWith('.ts'))) {
    const file = path.join(contract.directory, 'src', name)
    const content = await fse.readFile(file, 'utf8')
    if (content.includes('// @hai-generator:contracts:entries'))
      aggregators.push({ path: file, content })
  }
  if (aggregators.length !== 1)
    throw new Error(cliM('cli_generateUnsupportedAggregator'))
  const aggregator = aggregators[0]!
  const contractIndex = path.join(contract.directory, 'src/index.ts')
  const procedureIndex = path.join(target.target.directory, 'src/server/procedures/index.ts')
  const indexSource = await fse.readFile(contractIndex, 'utf8')
  const procedureSource = await fse.readFile(procedureIndex, 'utf8')
  const contractName = `${context.camelCase}Contract`
  const factoryName = `create${context.pascalCase}Procedures`
  const domainMarker = `// @hai-generator:domain ${context.camelCase}`
  const contractFile = path.join(contract.directory, 'src', `${context.kebabCase}-contract.ts`)
  const procedureFile = path.join(target.target.directory, 'src/server/procedures', `${context.kebabCase}-procedures.ts`)
  const importLine = `import { ${contractName} } from './${context.kebabCase}-contract.js'`
  const entryLine = `  ${context.camelCase}: ${contractName},`
  const factoryImport = `import { ${factoryName} } from './${context.kebabCase}-procedures.js'`
  const domainProperty = new RegExp(`^\\s*(?:${context.camelCase}|['"]${context.camelCase}['"]):`, 'm')
  if (domainProperty.test(aggregator.content) || domainProperty.test(procedureSource)) {
    for (const file of [contractFile, procedureFile]) {
      if (!await fse.pathExists(file) || !(await fse.readFile(file, 'utf8')).includes(domainMarker))
        throw new Error(cliM('cli_generateDomainExists', { params: { name: context.camelCase } }))
    }
  }
  const contractContent = `${domainMarker}
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

/**
 * ${context.pascalCase} 示例契约：GET 列表与 POST 校验回显，不执行持久写入。
 * @example client.${context.camelCase}.create({ name: 'Example' })
 */
export const ${contractName} = {
  list: apiContract
    .route({ method: 'GET', path: '/${context.kebabCase}', operationId: '${context.camelCase}.list', tags: ['${context.kebabCase}'] })
    .output(apiContract.haiResultSchema(z.object({ items: z.array(z.object({ name: z.string() })) }))),
  create: apiContract
    .route({ method: 'POST', path: '/${context.kebabCase}', operationId: '${context.camelCase}.create', tags: ['${context.kebabCase}'] })
    .input(z.object({ name: z.string().min(1) }))
    .output(apiContract.haiResultSchema(z.object({ name: z.string() }))),
}
`
  const procedureContent = `${domainMarker}
import type { ServContext } from '@h-ai/serv'
import { ok } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { ${contractName} } from '${contract.name}'

/**
 * 创建 ${context.pascalCase} 示例过程；新增持久写入前接入授权与业务服务。
 * @returns 与共享契约一致的公开过程；示例不访问用户数据。
 * @example const procedures = { ${context.camelCase}: ${factoryName}() }
 */
export function ${factoryName}() {
  return serv
    .implement(${contractName})
    .context<ServContext>()
    .route('list', () => ok({ items: [] }))
    .route('create', ({ input }) => ok({ name: input.name }))
    .build()
}
`
  return [
    { path: contractFile, content: contractContent },
    { path: procedureFile, content: procedureContent },
    { path: aggregator.path, previousContent: aggregator.content, content: appendAt(appendAt(aggregator.content, '// @hai-generator:contracts:imports', importLine), '  // @hai-generator:contracts:entries', entryLine) },
    { path: contractIndex, previousContent: indexSource, content: appendAt(indexSource, '// @hai-generator:contracts:exports', `export * from './${context.kebabCase}-contract.js'`) },
    { path: procedureIndex, previousContent: procedureSource, content: appendAt(appendAt(procedureSource, '// @hai-generator:procedures:imports', factoryImport), '    // @hai-generator:procedures:entries', `    ${context.camelCase}: ${factoryName}(),`) },
  ]
}
