/**
 * @h-ai/cli — 代码生成命令
 * @module cli-generate
 */

import type { GenerateOptions, GeneratorType, TemplateContext } from '../cli-types.js'
import path from 'node:path'
import { core } from '@h-ai/core'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { createTemplateContext } from '../cli-utils.js'
import { detectProject } from './cli-create.js'

/**
 * 生成器配置
 */
const GENERATORS: Record<GeneratorType, {
  description: string
  defaultPath: string
  generate: (context: TemplateContext, outputDir: string) => Promise<Array<{ path: string, content: string }>>
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

    // 名称会同时进入路径、标识符与源码字符串，禁止路径片段和代码字符。
    if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/i.test(resolvedOptions.name))
      throw new Error(cliM('cli_invalidGenerateName'))

    const outputDir = path.resolve(cwd, resolvedOptions.output || generator.defaultPath)

    // 安全校验：输出路径必须在当前工作目录内，防止路径遍历
    const resolvedCwd = path.resolve(cwd)
    if (!outputDir.startsWith(resolvedCwd + path.sep) && outputDir !== resolvedCwd) {
      throw new Error(cliM('cli_generateOutsideWorkspace'))
    }

    const context = createTemplateContext(resolvedOptions.name, {
      projectName: project?.name,
    })

    spinner.start(`生成 ${generator.description}...`)

    const files = await generator.generate(context, outputDir)
    const realCwd = await fse.realpath(resolvedCwd)
    // 先检查全部目标，再落盘，避免页面的第二个文件冲突时已覆盖第一个。
    for (const file of files) {
      if (!resolvedOptions.force && await fse.pathExists(file.path))
        throw new Error(cliM('cli_generateExists', { params: { path: file.path } }))
      let ancestor = file.path
      while (!await fse.pathExists(ancestor))
        ancestor = path.dirname(ancestor)
      const realAncestor = await fse.realpath(ancestor)
      const relative = path.relative(realCwd, realAncestor)
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw new Error(cliM('cli_generateOutsideWorkspace'))
    }
    for (const file of files) {
      await fse.ensureDir(path.dirname(file.path))
      await fse.writeFile(file.path, file.content, { encoding: 'utf-8', flag: resolvedOptions.force ? 'w' : 'wx' })
    }

    spinner.succeed()

    core.logger.info('', {})
    core.logger.info(chalk.green('✔ 生成完成！'))
    core.logger.info('', {})
    core.logger.info('创建的文件:')
    files.forEach((file) => {
      core.logger.info(chalk.cyan(`  ${path.relative(cwd, file.path)}`))
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
