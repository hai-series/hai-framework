# @h-ai/cli

> hai Agent Framework CLI — 交互式项目脚手架与代码生成工具。

## 支持的能力

- **项目创建** — 交互式引导创建 SvelteKit + hai 管理后台项目
- **模块添加** — 向现有项目增量启用模块，自动解析依赖
- **配置初始化** — 校验项目配置完整性，补全缺失的配置文件
- **代码生成** — 快速生成页面、组件、API 端点、数据模型、数据库迁移
- **模板选择** — 最小 / 标准 / 完整 / 自定义四种项目模板
- **功能组合** — 按需启用 IAM、DB、AI、Storage、Crypto 等模块
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

| 模板      | 说明     | 包含功能                         |
| --------- | -------- | -------------------------------- |
| `minimal` | 最小模板 | 仅 SvelteKit + @h-ai/core        |
| `default` | 标准模板 | IAM + DB + Crypto                |
| `full`    | 完整模板 | IAM + DB + Crypto + AI + Storage |
| `custom`  | 自定义   | 按需选择                         |

## 全局选项

| 选项               | 说明         |
| ------------------ | ------------ |
| `-v, --verbose`    | 显示详细输出 |
| `-C, --cwd <path>` | 指定工作目录 |

## 测试

```bash
pnpm --filter @h-ai/cli test
```

## License

Apache-2.0
