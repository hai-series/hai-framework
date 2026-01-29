/**
 * =============================================================================
 * @hai/cli - 项目创建命令
 * =============================================================================
 * 类似 SvelteKit 的交互式项目创建
 * 
 * 使用: pnpm hai create my-admin-system
 * =============================================================================
 */

import path from 'node:path'
import { execSync } from 'node:child_process'
import fse from 'fs-extra'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import type { CreateProjectOptions, ProjectInfo, FeatureId, FeatureDefinition } from '../types.js'
import { createTemplateContext, writeFile, fileExists, detectPackageManager } from '../utils.js'

/**
 * 功能定义
 */
const FEATURES: Record<FeatureId, FeatureDefinition> = {
    iam: {
        id: 'iam',
        name: '身份与访问管理',
        description: 'Session/JWT 会话管理、RBAC 权限控制、OAuth',
        packages: ['@hai/iam'],
        dependencies: ['crypto'],
    },
    db: {
        id: 'db',
        name: '数据库',
        description: 'Drizzle ORM 多数据库支持 (SQLite/PostgreSQL/MySQL)',
        packages: ['@hai/db'],
    },
    ai: {
        id: 'ai',
        name: 'AI 集成',
        description: 'LLM 适配器、MCP 协议、技能系统、流式响应',
        packages: ['@hai/ai'],
    },
    storage: {
        id: 'storage',
        name: '文件存储',
        description: '本地存储、S3/OSS/COS 云存储',
        packages: ['@hai/storage'],
    },
    crypto: {
        id: 'crypto',
        name: '加密模块',
        description: '国密 SM2/SM3/SM4、Argon2 密码哈希',
        packages: ['@hai/crypto'],
    },
    // 兼容性别名
    auth: {
        id: 'auth',
        name: '认证授权（别名）',
        description: '已合并到 iam 模块',
        packages: ['@hai/iam'],
        dependencies: ['crypto'],
    },
    mcp: {
        id: 'mcp',
        name: 'MCP 协议（别名）',
        description: '已合并到 ai 模块',
        packages: ['@hai/ai'],
    },
    skills: {
        id: 'skills',
        name: '技能系统（别名）',
        description: '已合并到 ai 模块',
        packages: ['@hai/ai'],
    },
}

/**
 * 项目模板定义
 */
const PROJECT_TEMPLATES = {
    minimal: {
        name: 'minimal',
        description: '最小模板 - 仅核心功能',
        features: [] as FeatureId[],
    },
    default: {
        name: 'default',
        description: '标准模板 - IAM + 数据库',
        features: ['iam', 'db', 'crypto'] as FeatureId[],
    },
    full: {
        name: 'full',
        description: '完整模板 - 所有功能',
        features: ['iam', 'db', 'crypto', 'ai', 'storage'] as FeatureId[],
    },
    custom: {
        name: 'custom',
        description: '自定义 - 选择需要的功能',
        features: [] as FeatureId[],
    },
}

/**
 * 创建项目
 */
export async function createProject(options: CreateProjectOptions): Promise<void> {
    const spinner = ora()

    try {
        // 交互式获取选项
        const resolvedOptions = await resolveOptions(options)
        const projectPath = path.resolve(resolvedOptions.cwd ?? '.', resolvedOptions.name)

        // 检查目录是否存在
        if (await fileExists(projectPath)) {
            const { overwrite } = await prompts({
                type: 'confirm',
                name: 'overwrite',
                message: `目录 ${resolvedOptions.name} 已存在，是否覆盖？`,
                initial: false,
            })

            if (!overwrite) {
                console.log(chalk.yellow('已取消'))
                return
            }

            await fse.remove(projectPath)
        }

        spinner.start('创建项目目录...')
        await fse.ensureDir(projectPath)
        spinner.succeed()

        // 生成项目文件
        spinner.start('生成项目文件...')
        await generateProjectFiles(projectPath, resolvedOptions)
        spinner.succeed()

        // 初始化 Git
        if (resolvedOptions.git) {
            spinner.start('初始化 Git 仓库...')
            execSync('git init', { cwd: projectPath, stdio: 'ignore' })
            spinner.succeed()
        }

        // 安装依赖
        if (resolvedOptions.install) {
            spinner.start(`安装依赖 (${resolvedOptions.packageManager})...`)
            const installCmd = getInstallCommand(resolvedOptions.packageManager!)
            execSync(installCmd, { cwd: projectPath, stdio: 'ignore' })
            spinner.succeed()
        }

        // 完成提示
        console.log()
        console.log(chalk.green('✔ 项目创建成功！'))
        console.log()
        console.log('下一步：')
        console.log(chalk.cyan(`  cd ${resolvedOptions.name}`))

        if (!resolvedOptions.install) {
            console.log(chalk.cyan(`  ${resolvedOptions.packageManager} install`))
        }

        console.log(chalk.cyan(`  ${resolvedOptions.packageManager} dev`))
        console.log()
    }
    catch (error) {
        spinner.fail()
        console.error(chalk.red('创建项目失败:'), error)
        throw error
    }
}

/**
 * 解析选项（交互式）
 */
async function resolveOptions(options: CreateProjectOptions): Promise<Required<CreateProjectOptions>> {
    console.log()
    console.log(chalk.bold.cyan('  🚀 hai Admin Framework'))
    console.log(chalk.gray('     AI-Native · Configuration-Driven · Security-First'))
    console.log()

    const questions: prompts.PromptObject[] = []

    // 项目名称
    if (!options.name) {
        questions.push({
            type: 'text',
            name: 'name',
            message: '项目名称:',
            initial: 'my-admin-app',
            validate: (value: string) => {
                if (!value.trim()) return '项目名称不能为空'
                if (!/^[a-z0-9-]+$/.test(value)) return '项目名称只能包含小写字母、数字和连字符'
                return true
            },
        })
    }

    // 模板选择
    if (!options.template) {
        questions.push({
            type: 'select',
            name: 'template',
            message: '选择模板:',
            choices: Object.values(PROJECT_TEMPLATES).map(t => ({
                title: `${chalk.bold(t.name.padEnd(10))} ${chalk.gray(t.description)}`,
                value: t.name,
            })),
            initial: 1, // default
        })
    }

    // 先获取模板选择
    const templateAnswers = questions.length > 0 ? await prompts(questions, {
        onCancel: () => {
            console.log(chalk.red('\n已取消'))
            process.exit(1)
        },
    }) : {}

    const selectedTemplate = options.template || templateAnswers.template || 'default'

    // 功能选择（仅在 custom 模板时显示）
    let selectedFeatures: FeatureId[] = []

    if (selectedTemplate === 'custom' && !options.features) {
        const featureChoices = Object.values(FEATURES).map(f => ({
            title: `${chalk.bold(f.name.padEnd(10))} ${chalk.gray(f.description)}`,
            value: f.id,
            selected: ['auth', 'db', 'crypto'].includes(f.id), // 默认选中常用功能
        }))

        const { features } = await prompts({
            type: 'multiselect',
            name: 'features',
            message: '选择功能 (空格选择，回车确认):',
            choices: featureChoices,
            hint: '- 空格选择，回车确认',
            instructions: false,
        }, {
            onCancel: () => {
                console.log(chalk.red('\n已取消'))
                process.exit(1)
            },
        })

        selectedFeatures = features || []

        // 自动添加依赖功能
        selectedFeatures = resolveFeatureDependencies(selectedFeatures)
    } else if (selectedTemplate !== 'custom') {
        selectedFeatures = PROJECT_TEMPLATES[selectedTemplate as keyof typeof PROJECT_TEMPLATES].features
    }

    // 示例代码选项
    let addExamples = options.examples
    if (addExamples === undefined) {
        const { examples } = await prompts({
            type: 'confirm',
            name: 'examples',
            message: '是否添加示例代码?',
            initial: true,
        }, {
            onCancel: () => {
                console.log(chalk.red('\n已取消'))
                process.exit(1)
            },
        })
        addExamples = examples
    }

    // 包管理器
    const detected = await detectPackageManager(options.cwd ?? '.')
    let packageManager = options.packageManager
    if (!packageManager) {
        const { pm } = await prompts({
            type: 'select',
            name: 'pm',
            message: '包管理器:',
            choices: [
                { title: 'pnpm (推荐)', value: 'pnpm' },
                { title: 'npm', value: 'npm' },
                { title: 'yarn', value: 'yarn' },
            ],
            initial: detected === 'pnpm' ? 0 : detected === 'npm' ? 1 : 2,
        }, {
            onCancel: () => {
                console.log(chalk.red('\n已取消'))
                process.exit(1)
            },
        })
        packageManager = pm
    }

    // 安装依赖
    let install = options.install
    if (install === undefined) {
        const { doInstall } = await prompts({
            type: 'confirm',
            name: 'doInstall',
            message: '是否安装依赖?',
            initial: true,
        }, {
            onCancel: () => {
                console.log(chalk.red('\n已取消'))
                process.exit(1)
            },
        })
        install = doInstall
    }

    // Git 初始化
    let git = options.git
    if (git === undefined) {
        const { initGit } = await prompts({
            type: 'confirm',
            name: 'initGit',
            message: '是否初始化 Git?',
            initial: true,
        }, {
            onCancel: () => {
                console.log(chalk.red('\n已取消'))
                process.exit(1)
            },
        })
        git = initGit
    }

    return {
        name: options.name || templateAnswers.name,
        template: (selectedTemplate || 'default') as CreateProjectOptions['template'],
        features: selectedFeatures,
        examples: addExamples ?? true,
        install: install ?? true,
        packageManager: packageManager || 'pnpm',
        git: git ?? true,
        verbose: options.verbose ?? false,
        cwd: options.cwd ?? '.',
    }
}

/**
 * 解析功能依赖
 */
function resolveFeatureDependencies(features: FeatureId[]): FeatureId[] {
    const result = new Set(features)

    for (const featureId of features) {
        const feature = FEATURES[featureId]
        if (feature.dependencies) {
            for (const dep of feature.dependencies) {
                result.add(dep)
            }
        }
    }

    return Array.from(result)
}

/**
 * 生成项目文件
 */
async function generateProjectFiles(
    projectPath: string,
    options: Required<CreateProjectOptions>,
): Promise<void> {
    // 创建模板上下文（用于后续生成示例代码）
    const _context = createTemplateContext(options.name, {
        projectName: options.name,
        template: options.template,
        features: options.features,
        examples: options.examples,
        year: new Date().getFullYear(),
    })

    // 收集需要的包
    const featurePackages: Record<string, string> = {}
    for (const featureId of options.features || []) {
        const feature = FEATURES[featureId]
        for (const pkg of feature.packages) {
            featurePackages[pkg] = 'workspace:*'
        }
    }

    // package.json
    const packageJson = {
        name: options.name,
        version: '0.0.1',
        private: true,
        license: 'Apache-2.0',
        type: 'module',
        scripts: {
            dev: 'vite dev',
            build: 'vite build',
            preview: 'vite preview',
            check: 'svelte-kit sync && svelte-check --tsconfig ./tsconfig.json',
            lint: 'eslint .',
            test: 'vitest run',
        },
        dependencies: {
            // 核心包（始终需要）
            '@hai/core': 'workspace:*',
            '@hai/kit': 'workspace:*',
            '@hai/ui': 'workspace:*',
            // 根据选择的功能添加包
            ...featurePackages,
        },
        devDependencies: {
            '@sveltejs/adapter-auto': '^3.0.0',
            '@sveltejs/kit': '^2.0.0',
            '@sveltejs/vite-plugin-svelte': '^4.0.0',
            svelte: '^5.0.0',
            'svelte-check': '^4.0.0',
            typescript: '^5.7.0',
            vite: '^6.0.0',
            vitest: '^2.0.0',
            tailwindcss: '^4.0.0',
            daisyui: '^5.0.0',
        },
    }

    await writeFile(
        path.join(projectPath, 'package.json'),
        JSON.stringify(packageJson, null, 2),
    )

    // tsconfig.json
    const tsconfig = {
        extends: './.svelte-kit/tsconfig.json',
        compilerOptions: {
            strict: true,
            moduleResolution: 'bundler',
            verbatimModuleSyntax: true,
        },
    }

    await writeFile(
        path.join(projectPath, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2),
    )

    // svelte.config.js
    const svelteConfig = `/**
 * hai Admin App - Svelte 配置
 */
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
  kit: {
    adapter: adapter(),
  },
}

export default config
`

    await writeFile(path.join(projectPath, 'svelte.config.js'), svelteConfig)

    // vite.config.ts
    const viteConfig = `/**
 * hai Admin App - Vite 配置
 */
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
})
`

    await writeFile(path.join(projectPath, 'vite.config.ts'), viteConfig)

    // src/routes/+page.svelte
    const homePage = `<script lang="ts">
  /**
   * 首页
   */
</script>

<svelte:head>
  <title>${options.name}</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold mb-4">欢迎使用 hai Admin Framework</h1>
    <p class="text-gray-600">开始构建你的管理后台</p>
  </div>
</main>
`

    await writeFile(path.join(projectPath, 'src/routes/+page.svelte'), homePage)

    // src/routes/+layout.svelte
    const layout = `<script lang="ts">
  /**
   * 根布局
   */
  import type { Snippet } from 'svelte'
  
  interface Props {
    children: Snippet
  }
  
  let { children }: Props = $props()
</script>

{@render children()}
`

    await writeFile(path.join(projectPath, 'src/routes/+layout.svelte'), layout)

    // src/app.html
    const appHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`

    await writeFile(path.join(projectPath, 'src/app.html'), appHtml)

    // src/app.d.ts
    const appDts = `/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    interface Locals {
      requestId: string
      session?: import('@hai/kit').SessionData
    }
  }
}

export {}
`

    await writeFile(path.join(projectPath, 'src/app.d.ts'), appDts)

    // src/hooks.server.ts
    const hooks = `/**
 * SvelteKit Server Hooks
 */
import { createHandle } from '@hai/kit'

export const handle = createHandle({
  logging: true,
})
`

    await writeFile(path.join(projectPath, 'src/hooks.server.ts'), hooks)

    // .gitignore
    const gitignore = `node_modules
.svelte-kit
build
.env
.env.*
!.env.example
*.log
.DS_Store
`

    await writeFile(path.join(projectPath, '.gitignore'), gitignore)

    // README.md
    const readme = `# ${options.name}

基于 hai Admin Framework 构建的管理后台。

## 开发

\`\`\`bash
${options.packageManager} install
${options.packageManager} dev
\`\`\`

## 构建

\`\`\`bash
${options.packageManager} build
${options.packageManager} preview
\`\`\`

## 文档

- [hai Admin Framework](https://github.com/hai-framework/hai)
- [SvelteKit](https://kit.svelte.dev/)
- [Svelte 5](https://svelte.dev/)
`

    await writeFile(path.join(projectPath, 'README.md'), readme)

    // static/favicon.png (空占位)
    await fse.ensureDir(path.join(projectPath, 'static'))
}

/**
 * 获取安装命令
 */
function getInstallCommand(pm: 'pnpm' | 'npm' | 'yarn'): string {
    switch (pm) {
        case 'pnpm':
            return 'pnpm install'
        case 'yarn':
            return 'yarn'
        default:
            return 'npm install'
    }
}

/**
 * 检测项目信息
 */
export async function detectProject(cwd: string): Promise<ProjectInfo | null> {
    const pkgPath = path.join(cwd, 'package.json')

    if (!(await fileExists(pkgPath))) {
        return null
    }

    try {
        const pkg = await fse.readJson(pkgPath)
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }

        const haiPackages = Object.keys(deps).filter(name => name.startsWith('@hai/'))

        return {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            isHaiProject: haiPackages.length > 0,
            haiPackages,
        }
    }
    catch {
        return null
    }
}
