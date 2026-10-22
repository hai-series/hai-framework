/**
 * @h-ai/cli — 代码生成命令
 * @module cli-generate
 */

import type { GenerateOptions, GeneratorType, TemplateContext } from '../cli-types.js'
import type { GeneratedFile } from './cli-generate-serv.js'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { createTemplateContext, writeCliError, writeCliMessage } from '../cli-utils.js'
import { generateServApi } from './cli-generate-serv.js'
import { generateArchitecture, resolveGenerateTarget } from './cli-generate-target.js'

/**
 * 生成器配置
 */
const GENERATORS: Record<GeneratorType, {
  description: () => string
  defaultPath: string
  generate: (context: TemplateContext, outputDir: string) => Promise<Array<{ path: string, content: string }>>
}> = {
  page: {
    description: () => cliM('cli_generatePageDescription'),
    defaultPath: 'src/routes',
    generate: generatePage,
  },
  component: {
    description: () => cliM('cli_generateComponentDescription'),
    defaultPath: 'src/lib/components',
    generate: generateComponent,
  },
  api: {
    description: () => cliM('cli_generateApiDescription'),
    defaultPath: 'src/routes/api',
    generate: generateApi,
  },
  model: {
    description: () => cliM('cli_generateModelDescription'),
    defaultPath: 'src/lib/models',
    generate: generateModel,
  },
  migration: {
    description: () => cliM('cli_generateMigrationDescription'),
    defaultPath: 'migrations',
    generate: generateMigration,
  },
}

/**
 * 按实际应用/workspace 架构生成代码，并在文件写入失败时回滚本次修改。
 * @param options - 生成类型、名称、workspace 及覆盖选项。
 * @returns 文件生成并接入已有路由入口后完成。
 * @throws Error | AggregateError - 架构不支持、路径/覆盖冲突，或写入及回滚失败。
 * @example `await generate({ type: 'api', name: 'orders', cwd: '/app', workspace: 'app-serv' })`
 */
export async function generate(options: GenerateOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? '.'

  try {
    // 交互式获取选项
    const resolvedOptions = await resolveGenerateOptions(options)
    const generator = GENERATORS[resolvedOptions.type]

    // 名称会同时进入路径、标识符与源码字符串，禁止路径片段和代码字符。
    if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/i.test(resolvedOptions.name))
      throw new Error(cliM('cli_invalidGenerateName'))

    const target = await resolveGenerateTarget(resolvedOptions)
    const architecture = generateArchitecture(target.target)
    const outputDir = path.resolve(target.target.directory, resolvedOptions.output || generator.defaultPath)
    // 文件路由必须在真实应用的路由目录内，不能生成不会被消费的“页面”。
    if (['page', 'api'].includes(resolvedOptions.type) && architecture === 'sveltekit') {
      const routes = path.join(target.target.directory, 'src/routes')
      if (!outputDir.startsWith(routes + path.sep) && outputDir !== routes)
        throw new Error(cliM('cli_generateInvalidRouteOutput'))
    }
    if (resolvedOptions.type === 'api' && architecture === 'serv' && resolvedOptions.output)
      throw new Error(cliM('cli_generateInvalidRouteOutput'))
    const relativeOutput = path.relative(target.root, outputDir)
    if (relativeOutput === '..' || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput))
      throw new Error(cliM('cli_generateOutsideWorkspace'))

    const context = createTemplateContext(resolvedOptions.name, {
      projectName: target.target.name,
    })

    spinner.start(cliM('cli_generateProgress', { params: { description: generator.description() } }))

    const files = resolvedOptions.type === 'api' && architecture === 'serv'
      ? await generateServApi(context, target)
      : await generator.generate(context, outputDir)
    await writeGeneratedFiles(files, target.root, resolvedOptions.force)

    spinner.succeed(cliM('cli_generateComplete'))

    writeCliMessage('')
    writeCliMessage(cliM('cli_generateFiles'))
    files.forEach((file) => {
      writeCliMessage(chalk.cyan(`  ${path.relative(cwd, file.path)}`))
    })
    writeCliMessage('')
  }
  catch (error) {
    spinner.fail(cliM('cli_generateFailed'))
    writeCliError(cliM('cli_generateFailureDetail'), { error })
    if (error instanceof AggregateError) {
      for (const cause of error.errors)
        writeCliError(cliM('cli_generateFailureDetail'), { error: cause })
    }
    throw error
  }
}

/**
 * 解析生成选项
 */
async function resolveGenerateOptions(options: GenerateOptions): Promise<Required<GenerateOptions>> {
  const questions: prompts.PromptObject<'type' | 'name'>[] = []

  if (!options.type) {
    questions.push({
      type: 'select',
      name: 'type',
      message: cliM('cli_generateTypePrompt'),
      choices: Object.entries(GENERATORS).map(([key, value]) => ({
        title: `${key} - ${value.description()}`,
        value: key,
      })),
    })
  }

  if (!options.name) {
    questions.push({
      type: 'text',
      name: 'name',
      message: cliM('cli_generateNamePrompt'),
      validate: (value: string) => {
        if (!value.trim())
          return cliM('cli_generateNameRequired')
        return true
      },
    })
  }

  const answers = questions.length > 0
    ? await prompts<'type' | 'name'>(questions, { onCancel: () => { throw new Error(cliM('cli_generateCancelled')) } })
    : {}
  const type: unknown = options.type || ('type' in answers ? answers.type : undefined)
  const name: unknown = options.name || ('name' in answers ? answers.name : undefined)
  if (!isGeneratorType(type))
    throw new Error(cliM('cli_generateUnknownType', { params: { type: String(type ?? '') } }))
  if (typeof name !== 'string' || !name.trim())
    throw new Error(cliM('cli_generateNameRequired'))

  return {
    type,
    name,
    output: options.output ?? '',
    force: options.force ?? false,
    verbose: options.verbose ?? false,
    cwd: options.cwd ?? '.',
    workspace: options.workspace ?? '',
  }
}

/** 校验真实生成类型，避免未识别参数或对象原型成员绕过提示。 */
function isGeneratorType(value: unknown): value is GeneratorType {
  return typeof value === 'string' && Object.hasOwn(GENERATORS, value)
}

/** 统一预检、暂存、提交一批源码；失败时回滚本次已提交的文件，避免半套路由。 */
async function writeGeneratedFiles(files: GeneratedFile[], root: string, force: boolean): Promise<void> {
  if (new Set(files.map(file => path.resolve(file.path))).size !== files.length)
    throw new Error(cliM('cli_generateUnsupportedAggregator'))
  const previous = new Map<string, string | undefined>()
  const stages = new Map<string, string>()
  const written: GeneratedFile[] = []
  const failures: unknown[] = []
  for (const file of files) {
    const relativeFile = path.relative(root, file.path)
    if (relativeFile === '..' || relativeFile.startsWith(`..${path.sep}`) || path.isAbsolute(relativeFile))
      throw new Error(cliM('cli_generateOutsideWorkspace'))
    let ancestor = file.path
    while (!await fse.pathExists(ancestor))
      ancestor = path.dirname(ancestor)
    const relative = path.relative(root, await fse.realpath(ancestor))
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error(cliM('cli_generateOutsideWorkspace'))
    const content = await fse.pathExists(file.path) ? await fse.readFile(file.path, 'utf8') : undefined
    if (file.previousContent !== undefined ? content !== file.previousContent : content !== undefined && !force)
      throw new Error(cliM('cli_generateExists', { params: { path: file.path } }))
    previous.set(file.path, content)
  }
  try {
    for (const file of files) {
      await fse.ensureDir(path.dirname(file.path))
      const stage = path.join(path.dirname(file.path), `.${path.basename(file.path)}.${randomUUID()}.tmp`)
      stages.set(file.path, stage)
      await fse.writeFile(stage, file.content, { encoding: 'utf8', flag: 'wx' })
    }
    for (const file of files) {
      const current = await fse.pathExists(file.path) ? await fse.readFile(file.path, 'utf8') : undefined
      if (current !== previous.get(file.path))
        throw new Error(cliM('cli_generateExists', { params: { path: file.path } }))
      await fse.rename(stages.get(file.path)!, file.path)
      written.push(file)
    }
  }
  catch (error) {
    failures.push(error)
    for (const file of written.reverse()) {
      try {
        if (await fse.readFile(file.path, 'utf8') !== file.content)
          throw new Error(cliM('cli_generateExists', { params: { path: file.path } }))
        const original = previous.get(file.path)
        if (original === undefined)
          await fse.unlink(file.path)
        else
          await fse.writeFile(file.path, original, 'utf8')
      }
      catch (rollbackError) {
        failures.push(rollbackError)
      }
    }
  }
  finally {
    for (const stage of stages.values()) {
      try {
        await fse.unlink(stage)
      }
      catch (error) {
        // 已提交的 stage 被 rename 移走；其余清理失败逐项保留，不遮盖主错误。
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
          failures.push(error)
      }
    }
  }
  if (failures.length > 1)
    throw new AggregateError(failures, cliM('cli_generateRollbackFailed'))
  if (failures.length === 1)
    throw failures[0]
}

/**
 * 生成页面
 */
async function generatePage(
  context: TemplateContext,
  outputDir: string,
): Promise<Array<{ path: string, content: string }>> {
  const files: Array<{ path: string, content: string }> = []
  const pageDir = path.join(outputDir, context.kebabCase)

  // +page.svelte
  const pageContent = `<!-- ${context.pascalCase} 页面 -->
<svelte:head>
  <title>${context.pascalCase}</title>
</svelte:head>

<div class='container mx-auto p-4'>
  <h1 class='text-2xl font-bold mb-4'>${context.pascalCase}</h1>

  <!-- 页面内容 -->
</div>
`

  const pagePath = path.join(pageDir, '+page.svelte')
  files.push({ path: pagePath, content: pageContent })

  // +page.server.ts
  const serverContent = `/**
 * ${context.pascalCase} 页面服务端
 */
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
  return {
    // 页面数据
  }
}

export const actions: Actions = {
  default: async () => {
    // 表单处理
  },
}
`

  const serverPath = path.join(pageDir, '+page.server.ts')
  files.push({ path: serverPath, content: serverContent })

  return files
}

/**
 * 生成组件
 */
async function generateComponent(
  context: TemplateContext,
  outputDir: string,
): Promise<Array<{ path: string, content: string }>> {
  const files: Array<{ path: string, content: string }> = []

  // Component.svelte
  const componentContent = `<script lang='ts'>
  import type { Snippet } from 'svelte'

  /**
   * ${context.pascalCase} 组件
   */

  interface Props {
    /** 自定义 class */
    class?: string
    /** 子内容（Svelte 5 snippet） */
    children?: Snippet
  }

  const { class: className = '', children }: Props = $props()
</script>

<div class={className}>
  <!-- 组件内容 -->
  {@render children?.()}
</div>
`

  const componentPath = path.join(outputDir, `${context.pascalCase}.svelte`)
  files.push({ path: componentPath, content: componentContent })

  return files
}

/**
 * 生成 API 端点
 */
async function generateApi(
  context: TemplateContext,
  outputDir: string,
): Promise<Array<{ path: string, content: string }>> {
  const files: Array<{ path: string, content: string }> = []
  const apiDir = path.join(outputDir, context.kebabCase)

  // +server.ts
  const serverContent = `/**
 * ${context.pascalCase} API
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

/** 示例输入；添加业务逻辑前扩展字段和约束。 */
const InputSchema = z.object({
  /** 业务名称（非空） */
  name: z.string().min(1),
})

/**
 * GET ${context.kebabCase}
 */
export const GET: RequestHandler = kit.handler(async ({ locals }) => {
  return kit.response.ok({ items: [] }, locals.requestId)
})

/**
 * POST ${context.kebabCase}
 */
export const POST: RequestHandler = kit.handler(async ({ request, locals }) => {
  const body = await kit.validate.body(request, InputSchema)
  // 校验通过后再执行业务操作；示例仅回传数据，不执行写入。
  return kit.response.ok(body, locals.requestId)
})
`

  const serverPath = path.join(apiDir, '+server.ts')
  files.push({ path: serverPath, content: serverContent })

  return files
}

/**
 * 生成数据模型
 */
async function generateModel(
  context: TemplateContext,
  outputDir: string,
): Promise<Array<{ path: string, content: string }>> {
  const files: Array<{ path: string, content: string }> = []

  // model.ts
  const modelContent = `/**
 * ${context.pascalCase} 模型
 */
import { z } from 'zod'

/**
 * ${context.pascalCase} Schema
 */
export const ${context.camelCase}Schema = z.object({
  /** 记录唯一标识 */
  id: z.string(),
  /** 显示名称 */
  name: z.string().min(1),
  /** 创建时间 */
  createdAt: z.date(),
  /** 最后修改时间 */
  updatedAt: z.date(),
})

/**
 * 创建 ${context.pascalCase} Schema
 */
export const create${context.pascalCase}Schema = ${context.camelCase}Schema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

/**
 * 更新 ${context.pascalCase} Schema
 */
export const update${context.pascalCase}Schema = create${context.pascalCase}Schema.partial()

/**
 * ${context.pascalCase} 类型
 */
export type ${context.pascalCase} = z.infer<typeof ${context.camelCase}Schema>
export type Create${context.pascalCase} = z.infer<typeof create${context.pascalCase}Schema>
export type Update${context.pascalCase} = z.infer<typeof update${context.pascalCase}Schema>
`

  const modelPath = path.join(outputDir, `${context.kebabCase}.ts`)
  files.push({ path: modelPath, content: modelContent })

  return files
}

/**
 * 生成迁移
 */
async function generateMigration(
  context: TemplateContext,
  outputDir: string,
): Promise<Array<{ path: string, content: string }>> {
  const files: Array<{ path: string, content: string }> = []
  const timestamp = Date.now()

  // migration.ts
  const migrationContent = `/**
 * 迁移: ${context.pascalCase}
 * 时间: ${new Date().toISOString()}
 */
import { reldb } from '@h-ai/reldb'

/** 升级：调用前初始化 reldb，调用方必须检查返回的 HaiResult。 */
export function up() {
  return reldb.ddl.createTable('hai_app_${context.snakeCase}', {
    id: { type: 'TEXT', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    created_at: { type: 'TIMESTAMP', notNull: true },
    updated_at: { type: 'TIMESTAMP', notNull: true },
  })
}

/** 回滚会删除整张表；由应用确认数据可删除后显式调用。 */
export function down() {
  return reldb.ddl.dropTable('hai_app_${context.snakeCase}')
}
`

  const migrationPath = path.join(outputDir, `${timestamp}_${context.snakeCase}.ts`)
  files.push({ path: migrationPath, content: migrationContent })

  return files
}
