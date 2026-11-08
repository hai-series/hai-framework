# hai-framework 官网

Hai Framework 的静态官网与使用手册，使用 `@h-ai/ui`、公共主题、Paraglide 与 Kit 展示框架能力和接入流程。它属于 monorepo，开发规范读取根目录 [AGENTS.md](../../AGENTS.md)。

## 页面与文档维护

- 首页提供功能特点、四类 CLI 模板实际截图、快速上手、按职责阅读入口与 GitHub 入口。每项能力可进入对应使用指南，模板截图可打开原图。界面支持中文、英文和日文，详细使用手册以中文为主，英文和日文入口说明语言覆盖范围。
- 文档正文直接读取人工维护的 [docs/usage](../../docs/usage/README.md)，目录直接读取 [navigation.json](../../docs/usage/navigation.json)。左侧按章折叠，默认展开当前章，搜索和跨章导航后跟随更新，当前页突出显示。修改正文或目录后重新构建即可，不再维护另一份说明。
- 相对文档和图片链接映射到 `/hai-framework/` 下的静态页面和截图；仓库源码、规范链接指向 GitHub。
- 全文搜索索引收录正式目录和语言入口。索引加载失败通过公共 Toast 提示，用户可在搜索窗口重新加载。
- 使用文档截图和流程图由 Vite 从 `docs/usage/images` 输出，每次构建只包含当前图片。Kit 静态资源目录为 `public/`，包含网站图标与模板预览原图。PNG 与 SVG 的宽高在构建时读取，预留布局空间，保证文档锚点跳转稳定。
- 文档代码块保留语言标识，公共 `MarkdownRenderer` 安全重建高亮和复制按钮；`schema=...` 只用于示例校验。配置说明使用可复制的文字和代码，截图保留实际界面与操作状态，不发布终端结果表格图。

首页预览展示生成应用的 Fullstack 用户管理、Admin 登录、mobile-app 登录和静态 website 联系页。更新模板效果时运行对应真实生成场景，保留原始画面并检查展示内容；合成账号仅用于演示，移动画面展示浏览器布局。文档里的 website 图片直接复用，不重复保存。

## 框架能力导航

本应用的启动、页面和业务操作按上文执行；各框架模块的完整用途、输入输出、配置和错误处理见下表。不要从应用示例推断模块全部能力；服务端与浏览器入口按对应模块契约选择。

| 模块 | 本应用相关能力 |
| --- | --- |
| [@h-ai/core](../../packages/core/README.md) | 配置、日志、结果与国际化 |
| [@h-ai/kit](../../packages/kit/README.md) | SvelteKit 路由、请求与页面集成 |
| [@h-ai/ui](../../packages/ui/README.md) | 页面、表单和交互组件 |

## 开发与验证

从仓库根目录执行：

```sh
pnpm --filter framework-website dev
pnpm --filter framework-website typecheck
pnpm --filter framework-website lint
pnpm --filter framework-website test
pnpm --filter framework-website compile:pages
pnpm --filter framework-website test:e2e
```

本应用依赖工作区已构建的框架包。浏览器测试使用本机 Chrome、单个 worker，必须先成功构建静态产物。统一通过根 `scripts/run-e2e.mjs` 托管，每轮在 `test-results/run-*/` 使用独立输出，保留截图和失败跟踪，不覆盖前轮证据；业务临时数据在退出后回收。截图使用 Playwright 的 `testInfo.outputPath`。测试服务器不提供 SPA 回退，用于验证每个深链接都有真实 HTML。测试产物不提交仓库。

## GitHub Pages 构建与预览

```sh
pnpm --filter framework-website compile:pages
pnpm --filter framework-website start
```

构建命令也可以使用 `pnpm --filter framework-website build`，通过框架 `hai build` 调用本应用的 `compile` 脚本。产物目录为 `apps/framework-website/build`，静态适配器完整预渲染所有页面，含 `.nojekyll`。预览地址为 `http://127.0.0.1:4297/hai-framework/`。缺少构建首页时，预览器立即退出并提示先执行 `pnpm build`，避免启动后持续返回 404。`start:test` 和 `start:prod` 使用同一个静态预览器；它们不会启动 Node 应用后端。

GitHub Pages 目标地址为 `https://hai-series.github.io/hai-framework/`。仓库子路径固定在 `vite.config.ts` 的 SvelteKit 插件，发布工作流上传上述构建目录。更新根 `package.json` 的版本后需要重新构建，页面仅公开读取其中的版本字段。文档、导航和版本文件均属于应用构建缓存输入。

本应用只维护静态文件与 GitHub Pages 发布流程，未提供 Dockerfile、镜像构建或后端服务部署配置。`hai.json` 保留空对象；`hai build` 的默认 compile 流程直接调用 package.json 的 `compile` 脚本，不需要镜像声明。`start`、`start:test`、`start:prod` 仅用于本机静态预览，不是生产服务部署命令。

此站不提供登录、数据库、Feedback 管理或其他服务端 API。构建期仅初始化公开文档所需的 core、Kit 和 i18n；浏览器产物不读取或注入私有环境变量。新增动态业务能力应另建服务，并重新核对静态托管的适用条件。

## 许可证

[Apache-2.0](../../LICENSE)
