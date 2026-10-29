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
hai create my-app --type fullstack --frontends web --yes
cd my-app
pnpm dev
```

需要交互选择时，运行 `hai create my-app`。如果使用 `--no-install`，进入工程后先运行 `pnpm install`。创建默认包含部署开发工具；不需要时可加 `--no-deploy`。Windows PowerShell 使用 `pnpm.cmd` 执行这些命令。

## 选择模板和能力

| 选择 | 用途与默认条件 |
| --- | --- |
| `--type fullstack` | API与多端客户端共用契约。`--frontends` 默认选择 `web,app,desktop`；`miniapp` 仅提供预留说明，不参与构建 |
| `--type api` | 独立接口契约与Node服务。fullstack/API均为workspace，固定使用pnpm |
| `admin` / `website` / `h5` | 同源SvelteKit应用。交互初始选择admin；`--yes`且省略类型时也选择admin |
| `mobile-app` | Capacitor + Vite客户端；原生能力需要对应平台环境 |
| `--template` | 可选 `minimal/default/full/custom`。fullstack固定custom；其他类型交互选择，`--yes`时默认default |
| `--features` | 自定义模块列表。`none`明确不选可选模块，不能与其他值混用；fullstack仍保留架构必需模块 |
| `--examples` / `--no-examples` | 默认生成示例。投入业务使用前替换示例数据、回调与权限 |
| `--no-git` / `--git-remote` | 关闭Git初始化，或设置指定远端；设置远端不会自动推送代码 |
| `--package-manager` | pnpm/npm/yarn，workspace类型仍遵守固定pnpm约束 |
| `--yes` | 省略交互并采用默认选项；真实生产凭据仍需按环境配置 |

已有项目可用 `hai add <module>` 添加适用模块，例如 `hai add deploy`。`page` / `api` 生成器面向SvelteKit文件路由；fullstack/API的接口契约、服务过程和hash页面按生成结构继续开发。

## 理解目录再改代码

只做静态官网时，用 `--type website --features none` 明确不选业务模块。website默认仍为SSR；[静态构建配置](../configuration/delivery.md#静态website与github-pages)说明如何启用静态输出、配置项目子路径，以及哪些动态能力不适用于GitHub Pages。

以本例为准：`packages/my-app-contract` 定义接口，`packages/my-app-serv` 实现API，`packages/my-app-shared` 保存共享内容，`apps/my-app-web` 提供Web页面。fullstack环境文件在工程根；独立API模板的环境文件在 `apps/my-app-serv`。开始修改前先读生成项目的 `README.md` 和 `AGENTS.md`。

## 确认首次运行成功

按终端实际地址打开页面。带IAM管理界面的模板首次使用 `admin` 登录，初始随机密码在所选环境的 `HAI_ADMIN_DEFAULT_PASSWORD` 中；开发环境查看对应 `.env.dev`，不要把密码复制到截图或公开日志。已有数据库中的账号不会因重启自动重置密码。

完成一次登录和一条成功/失败操作，确认请求到正确服务、提示可读、日志能关联问题；缺少依赖时应在启动或操作边界明确失败。fullstack默认包含DB、Cache、IAM、Crypto、Storage和Audit，不含AI运行依赖，首次运行不需要CUDA。
