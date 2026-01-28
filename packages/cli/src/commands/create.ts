/**
 * =============================================================================
 * @hai/cli - 项目创建命令
 * =============================================================================
 */

import path from 'node:path'
import { execSync } from 'node:child_process'
import fs from 'fs-extra'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import type { CreateProjectOptions, ProjectInfo } from '../types.js'
import { createTemplateContext, renderTemplate, writeFile, fileExists, detectPackageManager } from '../utils.js'

/**
 * 项目模板定义
 */
const PROJECT_TEMPLATES = {
    default: {
        name: 'default',
        description: '标准模板，包含基础功能',
        features: ['auth', 'ui', 'api'],
    },
    minimal: {
        name: 'minimal',
        description: '最小模板，仅包含核心功能',
        features: ['core'],
    },
    full: {
        name: 'full',
        description: '完整模板，包含所有功能',
        features: ['auth', 'ui', 'api', 'ai', 'storage', 'mcp'],
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

            await fs.remove(projectPath)
        }

        spinner.start('创建项目目录...')
        await fs.ensureDir(projectPath)
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
    const questions: prompts.PromptObject[] = []

    if (!options.name) {
        questions.push({
            type: 'text',
            name: 'name',
            message: '项目名称:',
            initial: 'my-hai-app',
            validate: (value: string) => {
                if (!value.trim()) return '项目名称不能为空'
                if (!/^[a-z0-9-]+$/.test(value)) return '项目名称只能包含小写字母、数字和连字符'
                return true
            },
        })
    }

    if (!options.template) {
        questions.push({
            type: 'select',
            name: 'template',
            message: '选择模板:',
            choices: Object.values(PROJECT_TEMPLATES).map(t => ({
                title: `${t.name} - ${t.description}`,
                value: t.name,
            })),
            initial: 0,
        })
    }

    if (options.install === undefined) {
        questions.push({
            type: 'confirm',
            name: 'install',
            message: '是否安装依赖?',
            initial: true,
        })
    }

    if (!options.packageManager) {
        const detected = await detectPackageManager(options.cwd ?? '.')
        questions.push({
            type: 'select',
            name: 'packageManager',
            message: '包管理器:',
            choices: [
                { title: 'pnpm', value: 'pnpm' },
                { title: 'npm', value: 'npm' },
                { title: 'yarn', value: 'yarn' },
            ],
            initial: detected === 'pnpm' ? 0 : detected === 'npm' ? 1 : 2,
        })
    }

    if (options.git === undefined) {
        questions.push({
            type: 'confirm',
            name: 'git',
            message: '是否初始化 Git?',
            initial: true,
        })
    }

    const answers = questions.length > 0 ? await prompts(questions) : {}

    return {
        name: options.name || answers.name,
        template: options.template || answers.template || 'default',
        install: options.install ?? answers.install ?? true,
        packageManager: options.packageManager || answers.packageManager || 'pnpm',
        git: options.git ?? answers.git ?? true,
        verbose: options.verbose ?? false,
        cwd: options.cwd ?? '.',
    }
}

/**
 * 生成项目文件
 */
async function generateProjectFiles(
    projectPath: string,
    options: Required<CreateProjectOptions>,
): Promise<void> {
    const context = createTemplateContext(options.name, {
        projectName: options.name,
        template: options.template,
        year: new Date().getFullYear(),
    })

    // package.json
    const packageJson = {
        name: options.name,
        version: '0.0.1',
        private: true,
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
            '@hai/core': 'workspace:*',
            '@hai/config': 'workspace:*',
            '@hai/kit': 'workspace:*',
            '@hai/ui': 'workspace:*',
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
        },
    }

    // 根据模板添加额外依赖
    if (options.template === 'full') {
        Object.assign(packageJson.dependencies, {
            '@hai/auth': 'workspace:*',
            '@hai/db': 'workspace:*',
            '@hai/crypto': 'workspace:*',
            '@hai/ai': 'workspace:*',
            '@hai/skills': 'workspace:*',
            '@hai/mcp': 'workspace:*',
            '@hai/storage': 'workspace:*',
        })
    }
    else if (options.template === 'default') {
        Object.assign(packageJson.dependencies, {
            '@hai/auth': 'workspace:*',
            '@hai/db': 'workspace:*',
            '@hai/crypto': 'workspace:*',
        })
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
    await fs.ensureDir(path.join(projectPath, 'static'))
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
        const pkg = await fs.readJson(pkgPath)
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
