/**
 * =============================================================================
 * @h-ai/cli - 代码生成命令
 * =============================================================================
 */

import type { GenerateOptions, GeneratorType, TemplateContext } from '../types.js'
import path from 'node:path'
import { core } from '@h-ai/core'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import { createTemplateContext, writeFile } from '../utils.js'
import { detectProject } from './create.js'

/**
 * 生成器配置
 */
const GENERATORS: Record<GeneratorType, {
  description: string
  defaultPath: string
  generate: (name: string, context: TemplateContext, outputDir: string) => Promise<string[]>
}> = {
  page: {
    description: 'SvelteKit 页面',
    defaultPath: 'src/routes',
    generate: generatePage,
  },
  component: {
    description: 'Svelte 组件',
    defaultPath: 'src/lib/components',
    generate: generateComponent,
  },
  api: {
    description: 'API 端点',
    defaultPath: 'src/routes/api',
    generate: generateApi,
  },
  model: {
    description: '数据模型',
    defaultPath: 'src/lib/models',
    generate: generateModel,
  },
  migration: {
    description: '数据库迁移',
    defaultPath: 'migrations',
    generate: generateMigration,
  },
}

/**
 * 生成代码
 */
export async function generate(options: GenerateOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? '.'

  try {
    // 检查是否在 hai 项目中
    const project = await detectProject(cwd)

    if (!project?.isHaiProject) {
      core.logger.warn(chalk.yellow('警告: 当前目录不是 hai 项目'))
    }

    // 交互式获取选项
    const resolvedOptions = await resolveGenerateOptions(options)
    const generator = GENERATORS[resolvedOptions.type]

    if (!generator) {
      throw new Error(`未知的生成器类型: ${resolvedOptions.type}`)
    }

    const outputDir = path.resolve(cwd, resolvedOptions.output || generator.defaultPath)
    const context = createTemplateContext(resolvedOptions.name, {
      projectName: project?.name,
    })

    spinner.start(`生成 ${generator.description}...`)

    const files = await generator.generate(resolvedOptions.name, context, outputDir)

    spinner.succeed()

    core.logger.info('', {})
    core.logger.info(chalk.green('✔ 生成完成！'))
    core.logger.info('', {})
    core.logger.info('创建的文件:')
    files.forEach((file) => {
      core.logger.info(chalk.cyan(`  ${path.relative(cwd, file)}`))
    })
    core.logger.info('', {})
  }
  catch (error) {
    spinner.fail()
    core.logger.error(chalk.red('生成失败:'), { error })
    throw error
  }
}

/**
 * 解析生成选项
 */
async function resolveGenerateOptions(options: GenerateOptions): Promise<Required<GenerateOptions>> {
  const questions: prompts.PromptObject[] = []

  if (!options.type) {
    questions.push({
      type: 'select',
      name: 'type',
      message: '选择生成类型:',
      choices: Object.entries(GENERATORS).map(([key, value]) => ({
        title: `${key} - ${value.description}`,
        value: key,
      })),
    })
  }

  if (!options.name) {
    questions.push({
      type: 'text',
      name: 'name',
      message: '名称:',
      validate: (value: string) => {
        if (!value.trim())
          return '名称不能为空'
        return true
      },
    })
  }

  const answers = questions.length > 0 ? await prompts(questions) : {}

  return {
    type: options.type || answers.type,
    name: options.name || answers.name,
    output: options.output ?? '',
    force: options.force ?? false,
    verbose: options.verbose ?? false,
    cwd: options.cwd ?? '.',
  }
}

/**
 * 生成页面
 */
async function generatePage(
  _name: string,
  context: TemplateContext,
  outputDir: string,
): Promise<string[]> {
  const files: string[] = []
  const pageDir = path.join(outputDir, context.kebabCase)

  // +page.svelte
  const pageContent = `<script lang="ts">
  /**
   * ${context.pascalCase} 页面
   */
</script>

<svelte:head>
  <title>${context.pascalCase}</title>
</svelte:head>

<div class="container mx-auto p-4">
  <h1 class="text-2xl font-bold mb-4">${context.pascalCase}</h1>
  
  <!-- 页面内容 -->
</div>
`

  const pagePath = path.join(pageDir, '+page.svelte')
  await writeFile(pagePath, pageContent)
  files.push(pagePath)

  // +page.server.ts
  const serverContent = `/**
 * ${context.pascalCase} 页面服务端
 */
import type { PageServerLoad, Actions } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  return {
    // 页面数据
  }
}

export const actions: Actions = {
  default: async ({ request, locals }) => {
    // 表单处理
  },
}
`

  const serverPath = path.join(pageDir, '+page.server.ts')
  await writeFile(serverPath, serverContent)
  files.push(serverPath)

  return files
}

/**
 * 生成组件
 */
async function generateComponent(
  _name: string,
  context: TemplateContext,
  outputDir: string,
): Promise<string[]> {
  const files: string[] = []

  // Component.svelte
  const componentContent = `<script lang="ts">
  /**
   * ${context.pascalCase} 组件
   */
  
  interface Props {
    /** 自定义 class */
    class?: string
  }
  
  let { class: className = '' }: Props = $props()
</script>

<div class={className}>
  <!-- 组件内容 -->
  <slot />
</div>
`

  const componentPath = path.join(outputDir, `${context.pascalCase}.svelte`)
  await writeFile(componentPath, componentContent)
  files.push(componentPath)

  return files
}

/**
 * 生成 API 端点
 */
async function generateApi(
  _name: string,
  context: TemplateContext,
  outputDir: string,
): Promise<string[]> {
  const files: string[] = []
  const apiDir = path.join(outputDir, context.kebabCase)

  // +server.ts
  const serverContent = `/**
 * ${context.pascalCase} API
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

/**
 * GET ${context.kebabCase}
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const { requestId } = locals
    
    return kit.response.ok({ message: 'Hello from ${context.kebabCase}' }, requestId)
  }
  catch (error) {
    return kit.response.internalError()
  }
}

/**
 * POST ${context.kebabCase}
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { requestId } = locals
    const body = await request.json()
    
    // 处理请求
    
    return kit.response.ok({ success: true }, requestId)
  }
  catch (error) {
    return kit.response.internalError()
  }
}
`

  const serverPath = path.join(apiDir, '+server.ts')
  await writeFile(serverPath, serverContent)
  files.push(serverPath)

  return files
}

/**
 * 生成数据模型
 */
async function generateModel(
  _name: string,
  context: TemplateContext,
  outputDir: string,
): Promise<string[]> {
  const files: string[] = []

  // model.ts
  const modelContent = `/**
 * ${context.pascalCase} 模型
 */
import { z } from 'zod'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { createId } from '@h-ai/core'

/**
 * ${context.pascalCase} 表
 */
export const ${context.camelCase}Table = sqliteTable('${context.snakeCase}', {
  id: text('id').primaryKey().$defaultFn(() => createId('${context.snakeCase.slice(0, 3)}')),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

/**
 * ${context.pascalCase} Schema
 */
export const ${context.camelCase}Schema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.date(),
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
  await writeFile(modelPath, modelContent)
  files.push(modelPath)

  return files
}

/**
 * 生成迁移
 */
async function generateMigration(
  _name: string,
  context: TemplateContext,
  outputDir: string,
): Promise<string[]> {
  const files: string[] = []
  const timestamp = Date.now()

  // migration.ts
  const migrationContent = `/**
 * 迁移: ${context.pascalCase}
 * 时间: ${new Date().toISOString()}
 */
import type { MigrationFn } from '@h-ai/db'

export const up: MigrationFn = async (db) => {
  // 升级逻辑
  await db.run(\`
    CREATE TABLE IF NOT EXISTS ${context.snakeCase} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  \`)
}

export const down: MigrationFn = async (db) => {
  // 回滚逻辑
  await db.run('DROP TABLE IF EXISTS ${context.snakeCase}')
}
`

  const migrationPath = path.join(outputDir, `${timestamp}_${context.snakeCase}.ts`)
  await writeFile(migrationPath, migrationContent)
  files.push(migrationPath)

  return files
}
