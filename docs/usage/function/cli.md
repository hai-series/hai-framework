# @h-ai/cli 功能说明

[English](cli.en.md) · [日本語](cli.ja.md)

在终端运行 `hai` 命令创建、构建、部署和检查应用。命令默认在当前目录查找项目，可用 `--cwd` 指定其他目录。构建生成的目录可交给部署命令使用。

这里的示例都是终端命令。看见 `hai xxx` 时，在应用根目录打开终端执行。

[模块 README](../../../packages/cli/README.md) · [配置清单](../configuration/cli.md) · [数据结构](../data/cli.md) · [创建与开发项目](../getting-started/create.md)

<a id="quick-start"></a>

## 最小接入示例

### 安装 CLI

安装前核对 Node.js 版本，支持 22.23.4、24.22.1 或 26.12.1 起的对应主版本。使用 pnpm 12.11.2。在 PowerShell 中，可运行 `pnpm.cmd`。

```sh
pnpm view @h-ai/cli@latest version # 查询注册表，输出最新已发布版本。
pnpm add -g @h-ai/cli@latest # 将该 CLI 安装到 pnpm 的全局目录。
hai --version # 确认当前 PATH 实际调用的 CLI 版本。
hai create my-app --type fullstack --frontends web # 输入应用名、模板和前端目标，生成 my-app。
cd my-app # 进入刚生成的工程目录。
pnpm dev # 启动项目声明的开发服务，终端输出本地访问地址。
```

输入项目名称与模板类型，输出工程文件；默认安装依赖并初始化 Git。`--defaults` 采用默认选择，`--no-install`、`--no-git`、`--no-deploy` 分别关闭安装、Git 初始化和部署开发依赖。省略名称或类型时交互选择。每个命令的选项以 `hai <command> --help` 为准。

## 功能说明

<a id="api-reference"></a>

### 命令、输入与输出

直接在终端运行 `hai`。根据命令输出和退出码判断结果。升级示例中的 `TARGET_VERSION` 需替换为 `pnpm view` 查到的已发布精确版本。

| 命令 | 用途 | 参数与默认值 | 输出 | 示例 |
| --- | --- | --- | --- | --- |
| `hai create [name]` | 创建一个应用 | 用 `--type` 选模板。省略名称或类型时询问，`--defaults` 采用默认值。默认安装依赖、初始化 Git 并准备部署工具 | 新项目及启动提示 | `hai create orders --type admin --defaults` |
| `hai add [module]` | 向已有应用添加框架能力 | 模块名省略时询问。默认安装依赖，可加 `--no-install` | 依赖、配置和相应 Skills，应用随后接入调用 | `hai add ai` |
| `hai init` | 给现有工程补配置和 AI 入口 | 默认保留已有文件，`--force` 可以重建模块配置 | 缺少的应用配置和 AI 文件 | `hai init` |
| `hai generate [type] [name]` 或 `hai g` | 生成业务骨架 | 类型和名称可交互选择。多 workspace 工程用 `--workspace`；默认保护已有文件 | 页面、组件、路由、模型或迁移文件 | `hai generate api orders --workspace orders-serv` |
| `hai g:page <name>` | 生成页面 | 页面名必填，按需设 `--workspace` | 页面文件 | `hai g:page orders` |
| `hai g:component <name>` | 生成组件 | 组件名必填，按需设 `--workspace` | 组件文件 | `hai g:component OrderList` |
| `hai g:api <name>` | 生成 HTTP 入口 | 名称必填，按需设 `--workspace` 选择应用或服务 | 对应模板的路由，或契约及 procedure | `hai g:api orders --workspace orders-serv` |
| `hai g:model <name>` | 生成模型定义 | 名称必填，按需设 `--workspace` | 模型文件 | `hai g:model order` |
| `hai build` | 编译源码或打包 | `--target` 默认 `compile`。镜像默认并行 2 项。原生打包默认 release | 编译结果、镜像归档或安装包。镜像可用 `--json` 输出产物信息 | `hai build --target image --json` |
| `hai deploy [appDir]` | 计划、打包或部署应用 | 目录默认由当前工程确定。需选择或传入 `--env`。制品、服务及环境文件可单独指定 | 计划 JSON、离线交付包或部署结果 | `hai deploy --env prod --plan` |
| `hai upgrade <version>` | 预检完整发布和迁移差异 | 填写已发布的精确版本，目录默认当前工程 | 依赖、配置及 Skills 差异报告 | `hai upgrade TARGET_VERSION` |
| `hai feedback <action> <bundle>` | 查看离线诊断包 | 操作和 ZIP 路径必填，`evidence` 可按请求、错误及时间范围过滤 | 摘要、清单、证据或本机查看器地址 | `hai feedback summary feedback.zip` |
| `hai --version`、`hai --help` | 查看版本或选项 | 也可用 `hai <command> --help` | 已安装版本或命令用法 | `hai deploy --help` |

全局 `--cwd/-C` 指定工程目录，`--verbose/-v` 开启详细诊断。CLI消息按 `HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG` 选择中英日文；生成应用的默认语言独立配置。

### 项目模板

| type                 | 生成内容与场景                                                    |
| -------------------- | ----------------------------------------------------------------- |
| admin / website / h5 | SvelteKit管理后台、展示网站或移动网页；website默认只接Core/Kit/UI |
| api                  | contract与独立Serv服务的pnpm workspace                            |
| mobile-app           | Svelte/Vite/Capacitor客户端，连接独立API                          |
| fullstack            | contract、Serv、共享UI及所选Web/App/Desktop；miniapp仅为预留说明  |

模板只安装实际使用的模块，同时保留注释中的可选配置和 `.env.example`。取消配置注释不等于完成业务接入。AI/payment/vecdb/datapipe按需添加；生产使用共享数据库、Redis和文件后端。项目中默认启用中英日文，fullstack可用 `fullstack.i18n.locales` 选择子集。

带浏览器界面的模板在加载前检查已知低版本浏览器；最低要求为Chrome/Edge111、Firefox114、Safari及iOS/iPadOS16.4。[浏览器入口](../getting-started/build.md#浏览器启动检测)

### 生成页面、组件、API、模型与迁移

```sh
hai generate page dashboard # 输入路由名，生成 dashboard 页面。
hai generate component UserCard # 输入组件名，生成对应 Svelte 组件文件。
hai generate api orders --workspace orders-serv # 输入接口名和目标包，生成契约或服务处理器。
hai generate model order # 输入模型名，生成数据库模型骨架。
hai generate migration add-orders # 输入迁移名，生成待填写的迁移文件。
```

生成名称只填写名称本身。通过 `--workspace` 指定包名或相对目录。SvelteKit 用 `--output` 时，输出必须在 `src/routes` 下，Serv 生成器没有这个选项。带文件路由的模板才能用 `hai generate page` 生成页面。生成 Serv 路由时，CLI 只更新带 `@hai-generator` 的集中入口。CLI 写入前先检查所有目标，失败时撤回本次修改，`--force` 也只会替换生成文件。迁移命令只生成 `up` 和 `down` 函数，实际迁移在之后运行。

### 构建、静态站与原生包

```sh
hai build --target image --images "serv,web" --concurrency 1 # 串行构建两个镜像角色，成功后输出镜像产物。
hai build --target app --platform android --runtime auto --debug # 选择 Android 和可用的容器引擎，输出调试包。
hai build --target desktop --platform windows --arch x64 # 按 Windows x64 目标生成桌面制品。
```

默认目标 `compile` 用于编译，也可用 `--target image`、`app` 或 `desktop` 打包。容器镜像只包括 `serv` 和 `web` 两类角色，手机安装包和桌面应用单独发布。镜像最多同时构建 2 个。构建镜像时，`--runtime auto` 优先选择可用的 Podman，再选择 Docker。显式指定的运行时不可用时直接报错。Android 省略运行时时使用本机工具链，iOS 需要 macOS、Xcode 和签名。

每次成功构建都会在 `.hai/build/` 下保留独立目录，然后更新 `latest` 指向。使用 `--json` 时，命令的标准输出只包含本次镜像构建的 JSON，可把其中的 `artifactDir` 传给部署命令。进度和错误写到标准错误。若 Git 来源为 `unknown` 或无法判断是否有未提交修改，应先核实来源再部署。[命名、签名和自动化](../getting-started/build.md)

website静态构建在构建进程设置 `HAI_BUILD_STATIC=1` 与实际 `PUBLIC_BASE_PATH`，再执行 `pnpm build`，只发布build目录并保留.nojekyll。静态构建拒绝动态API/actions、服务端业务初始化、私密资产及链接；联系表单未接服务时只提示并保留输入。网站目录变化需要重建；API地址独立配置。[静态与子目录部署](../configuration/delivery.md)

### 部署、离线交付与恢复

```sh
hai deploy --env prod --plan # 读取生产环境配置，输出本地计划 JSON。
hai deploy --env prod --plan --inspect-remote # 读取同一环境和服务器基线，补充计划中的远端事实。
hai deploy --env prod --build --bundle-only # 先构建，再输出可手工交付的生产归档。
hai deploy --env prod --build --services "serv,web" # 对满足基线的生产环境构建并发布选定服务。
```

用 `--plan` 校验配置和查看部署计划。加上 `--inspect-remote` 后，CLI 才通过 SSH 读取远端上次成功发布的信息。看到 `not-inspected` 表示还没有检查远端。使用 `--bundle-only` 时无需连接目标服务器，输出归档、目标描述、执行脚本和 `APPLY.txt`。首次发布或调整服务结构时用完整包。只更新部分服务前，应核对服务器上的上一次成功发布与本次构建的预期一致。

排查打包或部署故障时，在所选环境设置 `HAI_CORE_LOGGING_LEVEL=debug`，查看部署模块的诊断日志。`--plan` 的标准输出保留为 JSON。

工程根 `package.json.name` 决定项目身份，再附加环境后缀。完整包保存当前服务组合与私有配置；服务器凭据、后端绑定账本和数据卷成套保护。失败可能恢复上一成功服务，但不撤销数据写入、迁移、通知或支付。SSH结果unknown时先只读核对远端，不能自动重复发布。[部署与恢复](../../../packages/deploy/README.md)

HTTPS支持已有普通PEM文件或Let’s Encrypt。证书/私钥每份最多1MiB、拒绝链接；ACME需要真实域名、邮箱、条款确认和公网80端口。证书状态在服务器，启停或改变布局需全量部署。[HTTPS配置](../configuration/delivery.md#可选https证书)

### 诊断、升级预检与凭据导入

```sh
hai feedback evidence feedback.zip --request-id request-42 --page 1 --page-size 20 # 以请求编号过滤指定 ZIP，输出证据首页。
hai feedback view feedback.zip # 打开指定 ZIP，输出本机查看器地址。
hai upgrade TARGET_VERSION # 输入已发布精确版本，输出当前工程的升级预检结果。
```

离线包必须是普通单链接文件，最多64MiB；view仅监听loopback，使用随机访问路径。浏览器只运行框架内置查看器，不执行包内同名脚本。过滤结果不代表证据完整，继续按请求/错误编号检查上下文。

`hai upgrade` 只读核对实际消费包、CLI/deploy 制品、catalog、锁文件、安装状态和技能差异。

### AI指引与应用体验

生成应用的共享入口是AGENTS.md和 `.agents/skills/`；Claude/Copilot/OpenCode引用共享规范。添加模块补齐相关技能引用，已有自定义文件保留。任务按能力选择skill，公共契约以安装版本类型为准。[模板组成](../../../packages/cli/templates/README.md)

Fullstack提供用户/角色、审计、反馈、个人设置和主题语言界面；初始账号密码只在环境私有文件或Secret中分发，CLI不打印值。密码只创建缺失账号，不重置已有账号。原生展示名来自Core配置，文件名使用工程标识。

## 错误处理

命令失败显示安全原因、路径或步骤并以非零码退出。安装失败保留已生成文件便于重试；构建失败不更新成功latest。密钥不放命令参数或日志。计划、预检和导入回执各有明确范围，不能当部署成功。失败后按诊断修复配置、权限或前置依赖，再重试原步骤；结果未知先查事实。

<a id="command-options"></a>

## 命令行覆盖参数

| 参数 | 默认值/必填 | 说明 |
| --- | --- | --- |
| `--yes`                                 | 省略时由当前是否交互终端决定 | 跳过交互选源，尚未配置时使用官方源                                                                                            |
| `hai deploy --env`                      | 读取 `deploy.environment`    | 选择发布环境及该环境的文件。例如 `--env prod` 选用 `.env.prod`，私有文件仍按优先级合并                                        |
