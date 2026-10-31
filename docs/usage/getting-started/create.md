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

已有项目可用 `hai add <module>` 添加适用模块，例如 `hai add deploy`。`page` / `api` 生成器面向SvelteKit文件路由；fullstack/API的接口契约、服务过程和hash页面按生成结构继续开发。

## 理解目录再改代码

新建工程统一采用适用的完整模块和示例，服务端包含 AI、向量库、反馈等依赖；客户端仍按类型隔离服务端模块。安装体积相应增加，示例需按实际业务替换。`--template`、`--features`、`--examples/--no-examples` 已删除，`create --yes/-y` 改为 `--defaults`，旧参数明确报错；`deploy --yes` 保持原义。已有工程的模块选择不受影响。

新建 website 同样包含完整模块和示例，默认 Node SSR。静态发布前须在工程中移除服务端业务依赖及其初始化、API/`actions`，保留 Core/Kit/UI；没有轻量创建参数。已有不含这些动态能力的 website 仍可按[静态构建配置](../configuration/delivery.md#静态website与github-pages)发布。

以本例为准：`packages/my-app-contract` 定义接口，`packages/my-app-serv` 实现API，`packages/my-app-shared` 保存共享内容，`apps/my-app-web` 提供Web页面。fullstack环境文件在工程根；独立API模板的环境文件在 `apps/my-app-serv`。开始修改前先读生成项目的 `README.md` 和 `AGENTS.md`。

## 确认首次运行成功

按终端实际地址打开页面。带IAM管理界面的模板首次使用 `admin` 登录，初始随机密码在所选环境的 `HAI_ADMIN_DEFAULT_PASSWORD` 中；开发环境查看对应 `.env.dev.local`，不要把密码复制到截图或公开日志。已有数据库中的账号不会因重启自动重置密码。

完成一次登录和一条成功/失败操作，确认请求到正确服务、提示可读、日志能关联问题；缺少依赖时应在启动或操作边界明确失败。完整预设包含 AI 和向量库运行依赖，模型服务与生产通知/支付需要实际配置。默认容器跳过 CUDA/TensorRT 额外下载；本地开发按生成环境说明启动。
