# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) · [框架首页](../../README.md)

用 `hai` 创建应用、添加模块、生成基础代码，并构建 Web、API 与原生制品。完整操作流程和配置含义见[使用指南](../../docs/usage/README.md)。

## 快速开始

### 安装 CLI

使用符合 `engines` 的 Node.js（`^22.23.4 || ^24.22.1 || ^26.12.1`）与 pnpm 12.11.2。PowerShell 使用 `pnpm.cmd`。

```sh
pnpm view @h-ai/cli@latest version
pnpm add -g @h-ai/cli@latest
hai --version
hai create my-app --type fullstack --frontends web
cd my-app
pnpm dev
```

输入项目名称与模板类型，输出工程文件；默认安装依赖并初始化 Git。`--defaults` 采用默认选择，`--no-install`、`--no-git`、`--no-deploy` 分别关闭安装、Git 初始化和部署开发依赖。省略名称或类型时交互选择。每个命令的选项以 `hai <command> --help` 为准。

## 配置清单

命令行选项控制本次执行，工程中的 `hai.json` 保存构建与发布配置。

在[模块配置清单](../../docs/usage/configuration/cli.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/cli.md)中查看调用示例、输入输出、错误处理与使用要点。

- `create` / `add` / `init` — 创建工程、接入模块和补齐配置
- `generate` / `g` — 生成页面、组件、接口、模型和迁移
- `build` / `deploy` — 构建制品、检查发布计划、发布或恢复
- `upgrade` / `feedback` — 预检目标版本和查看离线反馈包

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/cli.md)，了解生成的工程、配置、构建缓存和发布记录。

## 开发测试

在框架仓库使用当前源码：

```sh
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli build
node packages/cli/dist/index.js create ../my-app
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

脚手架门禁实际安装、编译并运行生成项目的测试和浏览器流程；部署门禁需Podman/Docker。`--generate` 和 `--i18n` 分别定向检查生成路由及终端语言。测试后端与用户配置隔离，夹具通过不表示实际生产数据或第三方服务验收。Windows原生门禁另需Rust/MSVC并显式设置HAI_CLI_NATIVE_BUILD=1；真实设备交互独立验证。

## 许可证

Apache-2.0
