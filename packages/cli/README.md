# @h-ai/cli

> hai Agent Framework CLI — 交互式项目脚手架与代码生成工具。

## 支持的能力

- **项目创建** — 交互式引导创建 SvelteKit 应用、Svelte 5 移动/桌面前端与 hai 后端项目
- **模块添加** — 向现有项目增量启用模块，自动解析依赖
- **配置初始化** — 校验项目配置完整性，补全缺失的配置文件
- **代码生成** — 快速生成页面、组件、API 端点、数据模型、数据库迁移
- **模板选择** — 最小 / 标准 / 完整 / 自定义四种项目模板
- **功能组合** — 按需启用 IAM、DB、AI、Storage、Crypto 等模块
- **API 服务脚手架** — API Service 模板使用 `@h-ai/api-contract` + `@h-ai/serv` 组合公共 contract / procedures，并通过 `@h-ai/api-client` typed client 消费
- **自动依赖解析** — 选择功能时自动补全依赖（如 IAM 自动引入 Crypto）

## 快速开始

### 创建项目

```bash
# 交互式创建（推荐）
npx hai create my-admin-app

# 指定模板与功能
npx hai create my-app -t full
npx hai create my-app -t custom -f iam,db,ai
```

交互流程：

1. 输入项目名称
2. 选择模板（minimal / default / full / custom）
3. 选择功能模块（custom 模板下）
4. 是否添加示例代码
5. 选择包管理器（pnpm / npm / yarn）
6. 是否安装依赖
7. 是否初始化 Git

### 添加模块

```bash
# 交互式选择
npx hai add

# 指定模块
npx hai add iam
npx hai add storage
```

向现有项目增量添加模块。自动更新 `package.json`、生成配置文件、解析依赖。

### 初始化/校验配置

```bash
# 校验配置完整性，补全缺失配置
npx hai init

# 强制重新生成所有配置
npx hai init --force
```

### 代码生成

名称必须以字母开头，仅含字母、数字、短横线或下划线，不接受路径。默认先预检全部输出并拒绝覆盖；显式 `--force` 才替换文件。输出及符号链接目标必须留在工作目录内。

页面/API 生成器适用于 SvelteKit；组件使用 Svelte 5 children snippet。API 使用 `kit.handler` 与 Zod 输入校验。迁移输出显式 `up()` / `down()`，调用前初始化 `reldb`，调用后检查 HaiResult；它不是自动迁移运行器，`down()` 会删除表，需应用确认后执行。

```bash
# 交互式生成
npx hai generate

# 指定类型
npx hai generate page users
npx hai generate component UserCard
npx hai generate api users
npx hai generate model user
npx hai generate migration add-users

# 快捷命令
npx hai g:page dashboard
npx hai g:component StatusBadge
npx hai g:api orders
npx hai g:model order
```

## 项目模板

| 模板      | 说明     | 包含功能                                            |
| --------- | -------- | --------------------------------------------------- |
| `minimal` | 最小模板 | 基础 SvelteKit/hai 骨架（移动端为 Svelte 5 + Vite） |
| `default` | 标准模板 | IAM + DB + Cache + Crypto                           |
| `full`    | 完整模板 | 全量业务模块 + API Service / contract 机制          |
| `custom`  | 自定义   | 按需选择                                            |

## 全局选项

| 选项               | 说明         |
| ------------------ | ------------ |
| `-v, --verbose`    | 显示详细输出 |
| `-C, --cwd <path>` | 指定工作目录 |

## 开发阶段本地使用

> 适用于尚未发布到 npm、在 monorepo 中本地调试 CLI 的场景。

### 1. 构建

```bash
# 构建 CLI（生成 dist/）
pnpm --filter @h-ai/cli build

# 或启动 watch 模式（修改源码后自动重建）
pnpm --filter @h-ai/cli dev
```

### 2. 直接运行（无需安装）

构建完成后，可以用 `node` 直接调用 `dist/index.js`：

```bash
# 从仓库根目录运行
node packages/cli/dist/index.js create my-app
node packages/cli/dist/index.js create my-app --type admin --features iam,db
```

或者在任意目录通过绝对路径调用：

```bash
node /path/to/hai-framework/packages/cli/dist/index.js create my-app
```

### 3. 全局链接（`pnpm link`）

如果希望在终端里直接用 `hai` 命令，可以全局链接：

```bash
# 在 packages/cli 目录下执行
cd packages/cli
pnpm link --global

# 验证
hai --version
hai create my-app
```

> 使用完毕后可解除链接：`pnpm unlink --global @h-ai/cli`

### 4. 在 monorepo 内的其他 app 中使用

monorepo 内的 `apps/*` 项目已通过 `workspace:*` 协议引用本地包，可直接使用：

```bash
# 在仓库根目录执行，对任意 app 类型生成项目
node packages/cli/dist/index.js create ../my-new-project
```

### 5. 运行测试

```bash
# 单元测试 + E2E 模板生成测试
pnpm --filter @h-ai/cli test

# 真实脚手架 E2E 门禁（生成项目后执行 install/typecheck/lint/build/test/e2e）
pnpm --filter @h-ai/cli test:e2e

# watch 模式
pnpm --filter @h-ai/cli test:watch

# 覆盖率
pnpm --filter @h-ai/cli test:coverage
```

## License

Apache-2.0
