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

## 功能

### 命令、输入与输出

这些是终端命令，不需要先初始化框架服务。按实际输出与退出码判断结果。TARGET_VERSION需替换为pnpm view刚查询到的已发布精确版本，不原样输入占位词。

| 命令           | 用途与输入                                | 输出与示例                                                                                                                      |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| create         | 创建项目；名称、type、fullstack前端选择   | `hai create orders --type admin --defaults` 生成可运行的管理应用                                                                |
| add            | 给已有工程增加模块；模块名及当前目录      | `hai add ai` 补依赖、配置和技能，保留已有业务内容；应用仍需接入初始化、关闭和路由                                               |
| init           | 补齐已有工程的配置与AI入口                | `hai init` 补缺失文件；`--force` 可重建模块配置，执行前核对差异                                                                 |
| generate / g   | 生成业务骨架；类型、名称、目标workspace   | `hai generate api orders --workspace orders-serv` 生成路由或contract/procedure；同类快捷命令为 g:page/g:component/g:api/g:model |
| build          | 编译或打包；target、镜像/平台与源码       | `hai build --target image --json` 输出本次制品JSON；build不接收部署环境                                                         |
| deploy         | 计划、打包或发布；环境、制品、所选服务    | `hai deploy --env prod --plan` 输出只读计划；去掉plan才进入交付流程                                                             |
| upgrade        | 检查目标完整发布；精确版本、工程目录      | `hai upgrade TARGET_VERSION` 输出依赖、完整性、配置和技能漂移报告，不自动安装或覆盖                                             |
| deploy-secrets | 受控导入服务器已有凭据；目录、私有JSON    | `hai deploy-secrets /srv/orders --import /private/orders.json --runtime docker` 默认预检，显式 `--apply` 才保存                 |
| feedback       | 查看离线诊断ZIP；action、包路径和过滤条件 | `hai feedback summary feedback.zip` 输出摘要；inspect/evidence/view分别输出清单、证据或本机查看器                               |

全局 `--cwd/-C` 指定工程目录，`--verbose/-v` 开启详细诊断。CLI消息按 `HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG` 选择中英日文；生成应用的默认语言独立配置。

### 项目模板

| type                 | 生成内容与场景                                                    |
| -------------------- | ----------------------------------------------------------------- |
| admin / website / h5 | SvelteKit管理后台、展示网站或移动网页；website默认只接Core/Kit/UI |
| api                  | contract与独立Serv服务的pnpm workspace                            |
| mobile-app           | Svelte/Vite/Capacitor客户端，连接独立API                          |
| fullstack            | contract、Serv、共享UI及所选Web/App/Desktop；miniapp仅为预留说明  |

模板只安装实际使用的模块，同时保留注释中的可选配置和 `.env.example`。取消配置注释不等于完成业务接入。AI/payment/vecdb/datapipe按需添加；生产使用共享数据库、Redis和文件后端。项目中默认启用中英日文，fullstack可用 `fullstack.i18n.locales` 选择子集。

带浏览器界面的模板在加载前检查已知低版本浏览器；最低要求为Chrome/Edge111、Firefox114、Safari及iOS/iPadOS16.4。[浏览器入口](../../docs/usage/getting-started/build.md#浏览器启动检测)

### 生成页面、组件、API、模型与迁移

```sh
hai generate page dashboard
hai generate component UserCard
hai generate api orders --workspace orders-serv
hai generate model order
hai generate migration add-orders
```

名称不含路径，默认不覆盖业务文件。`--workspace` 选包名或相对目录；SvelteKit的 `--output` 必须位于src/routes，Serv生成器不接受该参数。page仅用于文件路由；纯Vite页面/API组合明确拒绝。Serv只更新带 `@hai-generator` 标记的聚合入口。整批预检，写入失败回滚本次修改；`--force` 仅替换生成文件。迁移输出up/down函数，不执行数据变更。

### 构建、静态站与原生包

```sh
hai build --target image --images "serv,web" --concurrency 1
hai build --target app --platform android --runtime auto --debug
hai build --target desktop --platform windows --arch x64
```

target默认compile，其他目标为image/app/desktop。镜像角色为serv/web；原生app/desktop不作为Compose服务。镜像默认最多并行2项，runtime的auto优先可用Podman、再选Docker，显式选择不降级。Android省略runtime时使用本机工具链；iOS需macOS/Xcode与签名。

输出在 `.hai/build/` 的独立批次目录，成功归档后更新相对 `latest`。`--json` 的stdout仅包含本次镜像构建JSON，`artifactDir` 可供后续部署使用；进度和失败写stderr。Git来源为unknown或dirty未知时不能当干净制品。[命名、签名和自动化](../../docs/usage/getting-started/build.md)

website静态构建在构建进程设置 `HAI_BUILD_STATIC=1` 与实际 `PUBLIC_BASE_PATH`，再执行 `pnpm build`，只发布build目录并保留.nojekyll。静态构建拒绝动态API/actions、服务端业务初始化、私密资产及链接；联系表单未接服务时只提示并保留输入。网站目录变化需要重建；API地址独立配置。[静态与子目录部署](../../docs/usage/configuration/delivery.md)

### 部署、离线交付与恢复

```sh
hai deploy --env prod --plan
hai deploy --env prod --plan --inspect-remote
hai deploy --env prod --build --bundle-only
hai deploy --env prod --build --services "serv,web"
```

plan只校验并输出计划；inspect-remote另通过SSH读取基线事实，not-inspected不表示通过。bundle-only不连接目标，输出归档、目标描述、上传/本机部署脚本和说明；归档中的APPLY.txt解释手工入口。首次安装和拓扑变化使用完整包，部分服务更新要求匹配服务器成功基线。

排查打包或部署故障时，在所选环境设置 `HAI_CORE_LOGGING_LEVEL=debug`，查看部署模块的诊断日志。`--plan` 的标准输出保留为 JSON。

工程根 `package.json.name` 决定项目身份，再附加环境后缀。完整包保存当前服务组合与私有配置；服务器凭据、后端绑定账本和数据卷成套保护。失败可能恢复上一成功服务，但不撤销数据写入、迁移、通知或支付。SSH结果unknown时先只读核对远端，不能自动重复发布。[部署与恢复](../deploy/README.md)

HTTPS支持已有普通PEM文件或Let’s Encrypt。证书/私钥每份最多1MiB、拒绝链接；ACME需要真实域名、邮箱、条款确认和公网80端口。证书状态在服务器，启停或改变布局需全量部署。[HTTPS配置](../../docs/usage/configuration/delivery.md#可选https证书)

### 诊断、升级预检与凭据导入

```sh
hai feedback evidence feedback.zip --request-id request-42 --page 1 --page-size 20
hai feedback view feedback.zip
hai upgrade TARGET_VERSION
```

离线包必须是普通单链接文件，最多64MiB；view仅监听loopback，使用随机访问路径。浏览器只运行框架内置查看器，不执行包内同名脚本。过滤结果不代表证据完整，继续按请求/错误编号检查上下文。

upgrade比较实际消费者的框架包、CLI/deploy制品、catalog/lock/安装状态及技能定制；不执行迁移。deploy-secrets需在Linux服务器提供Node，JSON最多64KiB且为私有普通单链接文件，默认只读；导入不恢复数据库或建立成功发布基线。[凭据输入与恢复边界](../deploy/docs/credential-import.md)

### AI指引与应用体验

生成应用的共享入口是AGENTS.md和 `.agents/skills/`；Claude/Copilot/OpenCode引用共享规范。添加模块补齐相关技能引用，已有自定义文件保留。任务按能力选择skill，公共契约以安装版本类型为准。[模板组成](templates/README.md)

Fullstack提供用户/角色、审计、反馈、个人设置和主题语言界面；初始账号密码只在环境私有文件或Secret中分发，CLI不打印值。密码只创建缺失账号，不重置已有账号。原生展示名来自Core配置，文件名使用工程标识。

## 配置

`hai.json.build.images` 指定角色、context、Dockerfile和端口，build.sources/build.proxy控制下载，deploy控制目标。镜像与npm源分别选择official/cn/custom，代理选择inherit/system/custom/none。命令参数覆盖本次操作；详细输入和效果见[配置手册](../../docs/usage/configuration/delivery.md)。

全部HAI配置来源为进程 > 模式私有 > 全局私有 > 模式公共 > 基础env > YAML。同来源先父JSON后细项；高来源父对象清除低来源细项。运行配置、密钥和SSH凭据存私有文件，构建不读取部署秘密。修改普通后端运行配置后重启；端口、挂载、网关、HTTPS或网站构建目录变化需要部署/重建。[运行配置](../../docs/usage/configuration/runtime.md)

镜像context必须可信且稳定。依赖输入及缓存要求普通单链接文件，缓存祖先拒绝symlink/junction；清单最多16MiB，归档按64KiB块比较/复制。文件不变保留mtime，更新原子替换；异常提示路径、原因与诊断码，不回显清单内容。

pnpm工程保留适用的deepmerge/DaisyUI补丁实体及patchedDependencies注册；仅安装框架npm包不会继承仓库补丁配置。[补丁目录](../../patches/)

## 错误处理

命令失败显示安全原因、路径或步骤并以非零码退出。安装失败保留已生成文件便于重试；构建失败不更新成功latest。密钥不放命令参数或日志。计划、预检和导入回执各有明确范围，不能当部署成功。失败后按诊断修复配置、权限或前置依赖，再重试原步骤；结果未知先查事实。

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
