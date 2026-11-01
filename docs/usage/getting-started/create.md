# 创建项目并首次运行

[首次交付](README.md) · [前置环境](../overview/environment.md) · [下一步：配置与开发](develop.md)

普通安装使用 npm 的 `latest` 标签，最新版本以[注册表](https://www.npmjs.com/package/@h-ai/cli?activeTab=versions)为准。团队需要可复现安装时，先查询实际版本再固定；不以工作区版本或文档中的历史发布记录判断当前最新版。

## 第一步：确认并安装CLI

先查询发布渠道和目标版本：

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@latest version
```

下面跟随默认发布版；如需跟随已发布的 Beta 渠道，可改成 `@h-ai/cli@beta`。需要锁定时，将 `@latest` 替换为刚查询得到的具体版本。

```sh
pnpm add -g @h-ai/cli@latest
hai --version
```

检查 `hai --version` 与安装目标一致。如果查询失败或目标还未发布，先使用实际已发布版本及其对应文档，不把工作区目标版本当成可用包。

## 第二步：创建并启动应用

以下创建 Web + API 工程，默认安装依赖并初始化 Git：

```sh
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

需要交互选择时，运行 `hai create my-app`。如果使用 `--no-install`，进入工程后先运行 `pnpm install`。创建默认包含部署开发工具；不需要时可加 `--no-deploy`。Windows PowerShell 使用 `pnpm.cmd` 执行这些命令。

## 选择项目类型

| 选择 | 用途与默认条件 |
| --- | --- |
| `--type fullstack` | API与多端客户端共用契约。`--frontends` 默认选择 `web,app,desktop`；`miniapp` 仅提供预留说明，不参与构建 |
| `--type api` | 独立接口契约与Node服务。fullstack/API均为workspace，固定使用pnpm |
| `admin` / `website` / `h5` | 同源SvelteKit应用。交互初始选择admin；`--defaults`且省略类型时也选择admin |
| `mobile-app` | Capacitor + Vite客户端；原生能力需要对应平台环境 |
| `--no-git` / `--git-remote` | 关闭Git初始化，或设置指定远端；设置远端不会自动推送代码 |
| `--package-manager` | pnpm/npm/yarn，workspace类型仍遵守固定pnpm约束 |
| `--defaults` | 省略交互并采用默认选项；真实生产凭据仍需按环境配置 |

已有项目可用 `hai add <module>` 添加适用模块，例如 `hai add deploy`。`page` 生成器用于 SvelteKit 文件路由；`api` 按目标 workspace 生成 SvelteKit 路由或 Serv 的 contract、procedure 及聚合入口，使用 `--workspace` 选择服务。fullstack 的 hash 页面按生成结构继续开发。

## 理解目录再改代码

各模板只安装实际使用的模块：admin/h5 使用认证、验证码/找回密码通知及其 DB/cache/crypto 依赖，website 使用 Core/Kit/UI，API 使用认证、通知、上传和反馈，fullstack 使用管理后台的认证、审计、存储、通知、调度和反馈，mobile-app 只使用客户端能力。AI、payment、vecdb、datapipe 不默认安装。所有项目保留完整模块 YAML 和 `.env.example`；未启用项以注释提供，不进入公共环境默认值，也不触发部署中间件提示。新增功能时添加依赖、取消所需配置注释，再接入初始化、关闭和业务代码；依赖安装不自动启用功能。`--template`、`--features`、`--examples/--no-examples` 已删除，`create --yes/-y` 改为 `--defaults`，旧参数明确报错；`deploy --yes` 保持原义。已有工程不会自动裁剪依赖。

新建 website 默认 Node SSR，只安装 Core/Kit/UI，可直接按[静态构建配置](../configuration/delivery.md#静态website与github-pages)发布。后续接入的服务端业务依赖、初始化、API/`actions` 需要在静态发布前移除；注释配置和环境变量参考不影响静态构建。

以本例为准：`packages/my-app-contract` 定义接口，`packages/my-app-serv` 实现API，`packages/my-app-shared` 保存共享内容，`apps/my-app-web` 提供Web页面。fullstack环境文件在工程根；独立API模板的环境文件在 `apps/my-app-serv`。开始修改前先读生成项目的 `README.md` 和 `AGENTS.md`。

## 确认首次运行成功

按终端实际地址打开页面。带IAM管理界面的模板首次使用 `admin` 登录，初始随机密码在所选环境的 `HAI_ADMIN_DEFAULT_PASSWORD` 中；开发环境查看对应 `.env.dev.local`，不要把密码复制到截图或公开日志。已有数据库中的账号不会因重启自动重置密码。

完成一次登录和一条成功/失败操作，确认请求到正确服务、提示可读、日志能关联问题；缺少依赖时应在启动或操作边界明确失败。AI、向量库与支付按需添加；模型服务、生产通知和支付需要配置真实 Provider。默认容器跳过 CUDA/TensorRT 额外下载；本地开发按生成环境说明启动。
