# @hai/cli Skills

> 此文件描述 @hai/cli 模块的 API 与用法，供 AI 助手参考。

## 1. 模块概述

`@hai/cli` 是 hai-framework 的命令行工具，提供交互式项目创建和代码生成能力。基于 `cac` 构建命令行界面，使用 `prompts` 实现交互式引导，使用 `handlebars` 模板引擎生成代码。

CLI 二进制名为 `hai`，通过 `package.json` 的 `bin` 字段注册。

## 2. 入口与使用

### 命令行使用

```bash
# 创建项目
hai create [name] [options]

# 向现有项目添加模块
hai add [module] [options]

# 初始化/校验配置
hai init [options]

# 代码生成
hai generate [type] [name] [options]
hai g [type] [name] [options]          # 别名

# 快捷生成
hai g:page <name>
hai g:component <name>
hai g:api <name>
hai g:model <name>
```

### 编程式使用

```typescript
import { addModule, createProject, generate, generateConfigFile, initProject } from '@hai/cli'

await createProject({
  name: 'my-app',
  template: 'default',
  features: ['iam', 'db'],
  install: true,
  packageManager: 'pnpm',
  git: true,
})

await addModule({
  module: 'storage',
  install: true,
})

await initProject({
  force: false,
})

await generate({
  type: 'page',
  name: 'users',
})

// 生成配置文件内容
const yamlContent = generateConfigFile('db')
```

> CLI 无 init/close 生命周期，直接调用命令函数即可。

## 3. 目录结构

```
packages/cli/
  package.json
  README.md
  SKILLS.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  src/
    index.ts                  # CLI 入口（cac 命令注册）
    types.ts                  # 类型定义
    utils.ts                  # 工具函数（命名转换、模板渲染、文件操作）
    commands/
      index.ts                # 命令导出
      add.ts                  # 模块添加命令
      config-templates.ts     # 配置文件模板生成
      create.ts               # 项目创建命令
      generate.ts             # 代码生成命令
      init.ts                 # 初始化/校验命令
  tests/
```

## 4. 配置说明

CLI 无独立配置文件。通过命令行选项和交互式提示收集参数。

### CreateProjectOptions

| 字段             | 类型                                           | 默认值      | 说明                               |
| ---------------- | ---------------------------------------------- | ----------- | ---------------------------------- |
| `name`           | `string`                                       | —           | 项目名称（必填，交互式时提示输入） |
| `template`       | `'minimal' \| 'default' \| 'full' \| 'custom'` | `'default'` | 项目模板                           |
| `features`       | `FeatureId[]`                                  | —           | 启用的功能列表                     |
| `examples`       | `boolean`                                      | `true`      | 是否生成示例代码                   |
| `install`        | `boolean`                                      | `true`      | 是否安装依赖                       |
| `packageManager` | `'pnpm' \| 'npm' \| 'yarn'`                    | 自动检测    | 包管理器                           |
| `git`            | `boolean`                                      | `true`      | 是否初始化 Git                     |
| `verbose`        | `boolean`                                      | `false`     | 详细输出                           |
| `cwd`            | `string`                                       | `'.'`       | 工作目录                           |

### AddModuleOptions

| 字段      | 类型        | 默认值  | 说明                                   |
| --------- | ----------- | ------- | -------------------------------------- |
| `module`  | `FeatureId` | —       | 要添加的模块（可选，缺省时交互式选择） |
| `install` | `boolean`   | `true`  | 是否自动安装依赖                       |
| `verbose` | `boolean`   | `false` | 详细输出                               |
| `cwd`     | `string`    | `'.'`   | 工作目录                               |

### InitOptions

| 字段      | 类型      | 默认值  | 说明                                   |
| --------- | --------- | ------- | -------------------------------------- |
| `force`   | `boolean` | `false` | 强制重新生成所有配置文件（即使已存在） |
| `verbose` | `boolean` | `false` | 详细输出                               |
| `cwd`     | `string`  | `'.'`   | 工作目录                               |

### GenerateOptions

| 字段      | 类型            | 默认值     | 说明                               |
| --------- | --------------- | ---------- | ---------------------------------- |
| `type`    | `GeneratorType` | —          | 生成类型（必填，交互式时提示选择） |
| `name`    | `string`        | —          | 名称（必填）                       |
| `output`  | `string`        | 按类型默认 | 输出路径                           |
| `force`   | `boolean`       | `false`    | 覆盖已有文件                       |
| `verbose` | `boolean`       | `false`    | 详细输出                           |
| `cwd`     | `string`        | `'.'`      | 工作目录                           |

## 5. 操作接口

### 项目创建 — `createProject(options)`

交互式（或参数驱动）创建 hai 项目，流程：

1. 解析选项（缺失项通过交互式提示获取）
2. 检查目标目录（已存在时询问是否覆盖）
3. 创建目录结构
4. 生成项目文件（package.json、svelte.config.js、vite.config.ts、hooks.server.ts、app.html、app.d.ts、首页、布局、.gitignore、README.md）
5. 初始化 Git（可选）
6. 安装依赖（可选）
7. 输出下一步指引

### 模块添加 — `addModule(options)`

向现有项目增量添加模块，流程：

1. 检测项目（通过 `detectProject` 读取 `package.json`）
2. 过滤已安装模块，显示可用模块列表
3. 交互式选择（或使用 `module` 参数指定）
4. 自动解析依赖（如 IAM 自动添加 Crypto）
5. 更新 `package.json` 中的 `dependencies`
6. 生成配置文件到 `config/_<module>.yml`
7. 安装依赖（可选）

支持的模块：`iam`、`db`、`cache`、`ai`、`storage`、`crypto`、`kit`、`ui`

### 初始化/校验配置 — `initProject(options)`

校验现有项目配置完整性，补全缺失的配置文件：

1. 检测项目及已安装的 @hai 包
2. 逐个检查对应的配置文件 `config/_<module>.yml` 是否存在
3. 显示已有配置和缺失配置清单
4. 自动生成缺失的配置文件
5. `--force` 模式下重新生成所有配置文件
6. 始终确保 `config/_core.yml` 存在

配置映射表：

| 包             | 配置文件              |
| -------------- | --------------------- |
| `@hai/core`    | `config/_core.yml`    |
| `@hai/db`      | `config/_db.yml`      |
| `@hai/cache`   | `config/_cache.yml`   |
| `@hai/iam`     | `config/_iam.yml`     |
| `@hai/storage` | `config/_storage.yml` |
| `@hai/ai`      | `config/_ai.yml`      |

### 配置文件模板 — `generateConfigFile(moduleKey)`

生成指定模块的默认 YAML 配置文件内容。支持的模块：`core`、`db`、`cache`、`iam`、`storage`、`ai`。

配置文件使用 `${ENV_VAR:default}` 语法支持环境变量替换。

### 功能模块（FeatureId）

| ID        | 名称           | 说明                    | 依赖     | 安装的包       |
| --------- | -------------- | ----------------------- | -------- | -------------- |
| `iam`     | 身份与访问管理 | Session/JWT、RBAC       | `crypto` | `@hai/iam`     |
| `db`      | 数据库         | SQLite/PostgreSQL/MySQL | —        | `@hai/db`      |
| `ai`      | AI 集成        | LLM、MCP、工具          | —        | `@hai/ai`      |
| `storage` | 文件存储       | 本地/S3                 | —        | `@hai/storage` |
| `crypto`  | 加密模块       | SM2/SM3/SM4             | —        | `@hai/crypto`  |
| `auth`    | 别名           | → iam                   | `crypto` | `@hai/iam`     |
| `mcp`     | 别名           | → ai                    | —        | `@hai/ai`      |

### 项目模板

| 模板      | 预选功能                               |
| --------- | -------------------------------------- |
| `minimal` | 无（仅 SvelteKit + @hai/core）         |
| `default` | `iam`、`db`、`crypto`                  |
| `full`    | `iam`、`db`、`crypto`、`ai`、`storage` |
| `custom`  | 用户交互式选择                         |

### 代码生成 — `generate(options)`

| 类型        | 说明           | 默认输出路径         | 生成文件                                         |
| ----------- | -------------- | -------------------- | ------------------------------------------------ |
| `page`      | SvelteKit 页面 | `src/routes`         | `+page.svelte`、`+page.server.ts`                |
| `component` | Svelte 组件    | `src/lib/components` | `{PascalCase}.svelte`                            |
| `api`       | API 端点       | `src/routes/api`     | `+server.ts`（GET + POST）                       |
| `model`     | 数据模型       | `src/lib/models`     | `{kebab-case}.ts`（Drizzle 表定义 + Zod Schema） |
| `migration` | 数据库迁移     | `migrations`         | `{timestamp}_{snake_case}.ts`（up/down）         |

### 工具函数

```typescript
// 命名转换
toCamelCase('user-profile') // 'userProfile'
toPascalCase('user-profile') // 'UserProfile'
toKebabCase('UserProfile') // 'user-profile'
toSnakeCase('UserProfile') // 'user_profile'

// 模板上下文
const ctx = createTemplateContext('user-profile', { projectName: 'my-app' })
// { camelCase: 'userProfile', pascalCase: 'UserProfile', kebabCase: 'user-profile', snakeCase: 'user_profile', projectName: 'my-app' }

// 模板渲染
renderTemplate('Hello {{pascalCase}}', ctx) // 'Hello UserProfile'
await renderTemplateFile('./template.hbs', ctx)

// 文件操作
await writeFile('/path/to/file.ts', content) // 自动创建目录
await fileExists('/path/to/file.ts')

// 包管理器检测
await detectPackageManager('/project') // 'pnpm' | 'npm' | 'yarn'

// 项目检测
const info = await detectProject('/project')
// { name: 'my-app', version: '0.0.1', isHaiProject: true, haiPackages: ['@hai/core', '@hai/iam'] }

// Handlebars Helpers（自动注册）
// if_eq、date、year、upper、lower
```

## 6. Client 接口

CLI 无独立 Client。所有功能通过命令行或编程式调用。

## 7. 错误码

CLI 无独立错误码。异常通过 `core.logger.error` 输出后以 `process.exit(1)` 退出。

## 8. 注意事项

- CLI 使用 `core.logger` 输出日志，搭配 `chalk` 着色和 `ora` spinner 显示进度。
- 功能依赖自动解析：选择 `iam` 时自动添加 `crypto` 依赖。
- `auth` 和 `mcp` 是兼容性别名，分别映射到 `iam` 和 `ai`。
- 生成的项目基于 SvelteKit + Svelte 5 + TailwindCSS v4 + DaisyUI 5。
- 代码生成器会自动检测当前目录是否为 hai 项目（查找 `@hai/*` 依赖）。
- 模板使用 Handlebars 引擎，支持 `noEscape` 模式（不转义 HTML）。
- 生成的 `package.json` 中 @hai 包版本为 `workspace:*`（适用于 monorepo 开发）。
