# @h-ai/cli 功能说明

使用 `hai` 终端命令生成、构建、部署和诊断项目。命令的参数、工作目录和产物路径决定执行范围。

[模块 README](../../../packages/cli/README.md) · [配置清单](../configuration/cli.md) · [数据结构](../data/cli.md) · [创建与开发项目](../getting-started/create.md)

## 最小接入示例

### 安装 CLI

使用符合 `engines` 的 Node.js（`^22.23.4 || ^24.22.1 || ^26.12.1`）与 pnpm 12.11.2。PowerShell 使用 `pnpm.cmd`。

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

### 命令、输入与输出

直接在终端运行 `hai`。根据命令输出和退出码判断结果。升级示例中的 `TARGET_VERSION` 需替换为 `pnpm view` 查到的已发布精确版本。

| 命令         | 用途与输入                                | 输出与示例                                                                                                                      |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| create       | 创建项目；名称、type、fullstack前端选择   | `hai create orders --type admin --defaults` 生成可运行的管理应用                                                                |
| add          | 给已有工程增加模块；模块名及当前目录      | `hai add ai` 补依赖、配置和技能，保留已有业务内容；应用仍需接入初始化、关闭和路由                                               |
| init         | 补齐已有工程的配置与AI入口                | `hai init` 补缺失文件；`--force` 可重建模块配置，执行前核对差异                                                                 |
| generate / g | 生成业务骨架；类型、名称、目标workspace   | `hai generate api orders --workspace orders-serv` 生成路由或contract/procedure；同类快捷命令为 g:page/g:component/g:api/g:model |
| build        | 编译或打包；target、镜像/平台与源码       | `hai build --target image --json` 输出本次制品JSON；build不接收部署环境                                                         |
| deploy       | 计划、打包或发布；环境、制品、所选服务    | `hai deploy --env prod --plan` 输出只读计划；去掉plan才进入交付流程                                                             |
| upgrade      | 检查目标完整发布；精确版本、工程目录      | `hai upgrade TARGET_VERSION` 输出依赖、完整性、配置和技能漂移报告，不自动安装或覆盖                                             |
| feedback     | 查看离线诊断ZIP；action、包路径和过滤条件 | `hai feedback summary feedback.zip` 输出摘要；inspect/evidence/view分别输出清单、证据或本机查看器                               |

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

名称不含路径，默认不覆盖业务文件。`--workspace` 选包名或相对目录；SvelteKit的 `--output` 必须位于src/routes，Serv生成器不接受该参数。page仅用于文件路由；纯Vite页面/API组合明确拒绝。Serv只更新带 `@hai-generator` 标记的聚合入口。整批预检，写入失败回滚本次修改；`--force` 仅替换生成文件。迁移输出up/down函数，不执行数据变更。

### 构建、静态站与原生包

```sh
hai build --target image --images "serv,web" --concurrency 1 # 串行构建两个镜像角色，成功后输出镜像产物。
hai build --target app --platform android --runtime auto --debug # 选择 Android 和可用的容器引擎，输出调试包。
hai build --target desktop --platform windows --arch x64 # 按 Windows x64 目标生成桌面制品。
```

target默认compile，其他目标为image/app/desktop。镜像角色为serv/web；原生app/desktop不作为Compose服务。镜像默认最多并行2项，runtime的auto优先可用Podman、再选Docker，显式选择不降级。Android省略runtime时使用本机工具链；iOS需macOS/Xcode与签名。

输出在 `.hai/build/` 的独立批次目录，成功归档后更新相对 `latest`。`--json` 的stdout仅包含本次镜像构建JSON，`artifactDir` 可供后续部署使用；进度和失败写stderr。Git来源为unknown或dirty未知时不能当干净制品。[命名、签名和自动化](../getting-started/build.md)

website静态构建在构建进程设置 `HAI_BUILD_STATIC=1` 与实际 `PUBLIC_BASE_PATH`，再执行 `pnpm build`，只发布build目录并保留.nojekyll。静态构建拒绝动态API/actions、服务端业务初始化、私密资产及链接；联系表单未接服务时只提示并保留输入。网站目录变化需要重建；API地址独立配置。[静态与子目录部署](../configuration/delivery.md)

### 部署、离线交付与恢复

```sh
hai deploy --env prod --plan # 读取生产环境配置，输出本地计划 JSON。
hai deploy --env prod --plan --inspect-remote # 读取同一环境和服务器基线，补充计划中的远端事实。
hai deploy --env prod --build --bundle-only # 先构建，再输出可手工交付的生产归档。
hai deploy --env prod --build --services "serv,web" # 对满足基线的生产环境构建并发布选定服务。
```

plan只校验并输出计划；inspect-remote另通过SSH读取基线事实，not-inspected不表示通过。bundle-only不连接目标，输出归档、目标描述、上传/本机部署脚本和说明；归档中的APPLY.txt解释手工入口。首次安装和拓扑变化使用完整包，部分服务更新要求匹配服务器成功基线。

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
