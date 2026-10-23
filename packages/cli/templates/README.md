# CLI 项目模板

## 简介

这里保存 `hai create` 生成应用时使用的源码、配置和 AI 指引。维护模板后，需要生成真实项目验证，不能只检查模板文件本身。

## 核心功能清单

- `admin`、`website`、`h5`：SvelteKit 应用。
- `api`：共享 contract 与 API service 的 workspace。
- `mobile-app`：Svelte + Vite + Capacitor 应用。
- `fullstack`：contract、API、共享界面，以及按需选择的 Web/App/Desktop；miniapp 仅预留说明。
- 后台工作区随窗口扩展；手机壳支持宽屏，表格在内部滚动，文章与认证表单保留阅读宽度。
- 默认部署工具、独立镜像 Dockerfile、环境示例和可复制的 AI 技能。

## 使用入门

### 文件如何组合

| 目录           | 用途                                                                |
| -------------- | ------------------------------------------------------------------- |
| `base/`        | 普通应用共用的配置、脚本和入口                                      |
| `apps/<类型>/` | 应用专属页面、workspace、原生壳与配置；API/fullstack 维护自己的骨架 |
| `features/`    | 按所选模块叠加的路由和页面                                          |
| `i18n/`        | Paraglide 工程配置                                                  |
| `skills/`      | 完整的技能目录与各类型 AI 入口                                      |

普通文件直接复制，`.hbs` 经 Handlebars 渲染并去掉后缀。`cli-template-engine.ts` 决定适用目录与条件；`cli-create.ts` 完成配置、镜像定义和根 README 等生成工作。修改前先查实际调用路径，API/fullstack 不套用 SvelteKit 文件路由。

### 配置与构建

模板通过 `projectName`、`appType`、`features`、`hasUi`、`hasI18n`、`versions` 以及 `api`/`fullstack` 上下文渲染，完整字段见 [cli-types.ts](../src/cli-types.ts)。模块 YAML 使用 `moduleConfig` helper，与 [配置生成器](../src/commands/cli-config-templates.ts) 共用字段和默认值。

部署默认启用，`--no-deploy` 可关闭；SDK 是开发依赖。每个镜像使用 `images/` 中独立 Dockerfile，Web 资源放 `images/web/`。`hai.build.json` 直接选择文件；依赖输入由构建器生成到 `images/dependencies/`。所有根 `.gitignore` 均忽略 `**/images/dependencies/`、运行数据和私有环境文件。

Fullstack 服务端保留各模块的配置示例，未使用模块保持注释。安装依赖、校验和初始化、接入业务后才启用对应配置。修改公开 Schema 时同步配置生成器、环境变量说明、调用方与技能。

### AI 指引

`skills/hai-*` 的完整目录复制到生成应用 `.agents/skills/`，按应用架构排除不适用项。`bridges/<类型>/AGENTS.md` 提供根入口；Claude/Copilot/OpenCode 配置只引用共享规则。新增参考文件必须随 skill 一起复制，不能链接回框架私有路径。

`hai add` / `hai init` 补齐缺失文件，保留应用已有的自定义内容。框架升级时按目标发布版本比较并合并，不直接覆盖应用规则。

### 页面与文案

用户可见文本加入对应 messages。认证复用 AuthPanel 与服务端公开 IAM 配置；表单复用 Form/FormLayout/FormField。业务规则由应用需求决定，模板默认角色、流程和限额可调整，修改时同步授权、界面、测试和文档。

## 开发测试

维护模板时保留 `shared/.gitattributes`，让生成工程的 `.dockerignore`、Dockerfile 和 POSIX 脚本统一使用 LF，保持跨平台输入一致并确保 Linux 脚本可运行。在仓库根执行：

```sh
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli build
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

脚手架门禁会生成项目并执行安装、类型检查、lint、构建、测试和浏览器流程。部署门禁另需可用 Podman/Docker，验证镜像构建、隔离服务器上的 SSH/人工部署与部分更新。原生安装包和真实第三方服务需要各自的验收环境。

## 许可证

Apache-2.0
