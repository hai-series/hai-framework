# 近 10 次功能提交审查与验证

审查对象为 `codex/framework-public-capabilities` 的最近 10 个非合并提交，范围从 `490b6f37` 到 `36bff534`。它们已通过合并提交 `b34d67e7` 完整进入本地 `main`，原提交哈希、作者与历史保留。本报告记录当前源码审查与实际执行证据，不使用旧版本测试结果作为本轮通过依据。

## 提交与覆盖范围

| 提交 | 功能 | 核对范围 |
| --- | --- | --- |
| `36bff534` | 新手引导与帮助中心 | UI 公开导出、SSR、等待/取消/焦点、i18n、用户偏好、后台应用与 fullstack Web/App/Desktop |
| `b8e52ff1` | IAM 授权读取说明 | 当前用户与授权读取、会话快照边界、README 与两类 IAM skill |
| `9c08706b` | Windows 与脚手架验证 | 子进程参数、临时目录、tarball 类型声明与清理 |
| `66895463` | 需求与设计审查 skill | 生成与复制入口、各应用桥接文档、问题闭合条件、LLMS 导航 |
| `f8327a93` | IAM 核心流程与 API Key 文档 | 中英日 README、scopes 交集、受限角色、撤销、当前授权与资源范围 |
| `99b52d7f` | Reach/Audit API 简化 | 模板推导 provider、直接发送错误、公共分页结果、后台与生成应用消费者 |
| `e282e3c3` | 可信客户端 IP | Node socket、Fetch 元数据、代理链、CIDR 校验、RPC 与自定义上下文 |
| `15d45a74` | 当前授权及批量用户查询 | 授权读取失败拒绝、禁用用户、角色筛选先于分页、批量顺序/去重/角色装配 |
| `0e25d187` | API Key 会话 scopes | 登录绑定、交集、通配符、受限角色、持久化 key 验证、撤销及刷新 |
| `490b6f37` | 流式存储与 checksum | Local/MinIO/RustFS、分片、范围读取、原子拒覆盖、源失败、取消与公共 tarball |

按仓库模块审查规范检查架构、导出/类型、错误边界、资源释放、数据库/共享缓存、权限、日志、i18n、调用方、README、skills、CLI 模板与测试。未发现需要扩展范围修复的 P0/P1 问题。

## 已修复问题

| 编号 | 等级 | 位置 | 证据与修复 | 验收条件 |
| --- | --- | --- | --- | --- |
| R01 | P2 | `packages/storage/src/storage-stream.ts` | 等待输入的 `next()` 不响应取消；新增公开 checksum 回归在旧实现下失败。取消与读取竞速，移除监听并请求关闭迭代器。 | 输入保持挂起时，取消即返回 `CHECKSUM_FAILED` 并调用迭代器关闭。 |
| R02 | P2 | `packages/storage/src/providers/storage-provider-local.ts` | `getStream()` 对目录返回成功；新增公开入口回归在旧实现下失败。返回流前检查文件类型。 | 目录读取在初始返回阶段得到 `INVALID_PATH`。 |
| R03 | P2 | `packages/cli/tests/commands.e2e.test.ts` | 第一轮根 `pnpm test` 出现 `EBUSY`，固定目录清理使整个 CLI suite 失败。每轮使用独立临时目录，验证清理范围并重试短暂文件锁。 | CLI 全套测试及根测试正常退出；不共享、删除其他运行目录。 |
| R04 | P2 | `packages/cli/tests/scaffold-gates.e2e.test.ts`、模板与示例应用 E2E | 截图硬编码为旧日期目录，新增导览图落在会清理的临时项目。尊重指定证据目录，成功截图在项目清理后保留；API、首页、引导、帮助与设置均留证。手机模板认证使用 390×844，导览截图等待 busy 清除。 | 8 个场景完成清理后仍存在本轮成功截图，手机表单以实际手机宽度验证。 |
| R05 | P2 | fullstack `playwright.config.ts.hbs` 与 `fullstack.spec.ts.hbs` | 旧配置只启动首个前端，新共享引导缺少 App/Desktop 运行证明。启动所有已选浏览器预览，逐端验证登录、导览、帮助及设置导航。 | Web/App/Desktop 各自通过真实预览测试并有截图。 |
| R06 | P2 | `packages/ui/src/lib/guide.svelte.ts` | 截图就绪断言稳定复现 App/Desktop 个人资料导览提前 Escape 后 busy 永久为 true。driver.js 在首帧完成前销毁不会触发 onDestroyed，控制器仍等待 onHighlighted。改为在 onDestroyStarted 统一 stop。 | 首帧定位期间按 Escape、关闭按钮或点击遮罩均清除 busy 和浮层，start 返回 false，且不写完成记录。 |

R01/R02 已执行 Red → Green：消费者取消、输入源同步取消与目录读取回归先失败后通过。R06 使用真实 driver.js 冻结定位动画首帧，三种关闭入口在旧实现下均失败，修复后导览测试 17/17 通过。第一轮已完成部分不能代替修复后的完整门禁。

## 门禁记录

执行跨越 2026-10-14 至 2026-10-15。后续在独立工作树复制当前代码快照并执行冻结安装，避免主工作区并行构建争用 dist；既有其他改动保持原样。

| 门禁 | 最终结果 | 覆盖 |
| --- | --- | --- |
| `pnpm.cmd install --frozen-lockfile` | 0 | 隔离工作树，全部 30 个 workspace |
| `pnpm.cmd typecheck` | 0 | 60/60 任务，13 命中缓存 |
| `pnpm.cmd lint` | 0 | 29/29 任务；check:skills 为 36 skills / 173 引用 |
| `pnpm.cmd build` | 0 | 54/54 任务，19 命中缓存 |
| `pnpm.cmd test` | 0 | 65/65 任务，4613 测试通过；UI 317、CLI 515、Storage 278、IAM 447 |
| `pnpm.cmd e2e` | 0 | 40/40 任务；CLI 8/8 门禁，合计 228 项浏览器测试通过、1 项真实 AI 测试按开关跳过 |

单测默认跳过 8 个耗时脚手架场景，它们由 E2E 门禁单独执行。真实 AI audio smoke 与 Docker-SSH 部署测试属于显式启用项，本轮未设置对应开关。构建保留现有第三方循环依赖、大 chunk、未来 Vite native config loader 和颜色环境变量警告，没有将这些警告算作执行失败。

CLI 本轮使用当前源码构建的本地 tarball，8/8 组生成项目分别完成 install → typecheck → lint → build → test → e2e，合计 25 项浏览器测试通过。Admin 和 fullstack 还编译并执行公共能力夹具；Admin 的 page/component/api/model/migration 增量生成也进入真实门禁。

| 模板场景 | 浏览器测试 | 代表截图 |
| --- | --- | --- |
| API minimal | 2/2 | [Health](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-api-health.png) |
| Admin | 2/2 | [登录](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-admin-login.png) |
| API IAM + Reach | 3/3 | [Health](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-api-iam-health.png) |
| API IAM basic | 3/3 | [Health](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-api-iam-basic-health.png) |
| Website | 2/2 | [首页](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-website-home.png) |
| H5 | 2/2 | [手机登录](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-h5-login.png) |
| Mobile App | 2/2 | [手机登录](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-mobile-login.png) |
| Fullstack Web/App/Desktop | 9/9 | [Web 导览](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-fullstack-guide-desktop.png)、[App 导览](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-fullstack-app-guide.png)、[Desktop 资料页](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/sample-fullstack-desktop-profile.png) |

截图检查覆盖各模板代表页面、移动表单、fullstack 引导、帮助与个人资料布局。R06 修复后的资料页截图已清除持续 loading，移动导览按钮与浮层位于屏幕范围内。API 模板为请求测试，通过额外 globalSetup 保留实际 Chrome 中的 Health 响应截图。

| 仓库应用 | 默认浏览器 E2E |
| --- | --- |
| mobile-app | 3/3 |
| admin-console | 188/188；加密传输单独配置 2/2 |
| ai-playground | 3/3；`HAI_E2E_LIVE=1` 的真实 LLM/Memory/TTS/ASR 测试未启用 |
| corporate-website | 3/3 |
| h5-app | 4/4 |

后台导览、暗色帮助和角色分页截图在传输配置重置输出目录前已执行；为长期保留成功画面，额外单独重跑对应 3 个场景并复制到统一证据目录。该补拍不改变源代码，未重复计入 228 项默认浏览器测试。

本地证据已保留 83 张 PNG：[截图画廊](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/index.html)、[原图尺寸与时间清单](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/screenshots.json)、[门禁与代码哈希记录](../../test-results/framework-public-capabilities-2026-10-14-01a13a60/validation.json)。额外补拍 3/3 通过；截图布局已人工复查。证据目录被 Git 忽略，源代码和本报告进入提交。

首轮根测试发现并修复 Windows EBUSY。fullstack 启动超时在诊断重跑中未复现；主工作区另一轮 E2E 遇到并行构建期间类型声明缺失，因此使用独立工作树继续验收。截图就绪检查进一步发现 R06：App/Desktop 提前关闭资料导览时 busy 未释放。保留失败证据，使用修复后的最终完整执行结果验收。

## 同步与验收边界

已同步 storage、UI 与 CLI 的中英日 README、生成应用 shared README、storage skill、UI guide 契约和 LLMS 导航。本次包含 storage 与共享引导的运行时代码修复、测试可靠性与模板验证改动，不是纯文档变更。保留原有未提交的根 `package.json` 版本改动及其他工作中的改动，不将它们混入本次修复提交。

浏览器验收覆盖桌面与移动 viewport，以及 App/Desktop 的浏览器预览。小程序设备、Capacitor/Tauri 安装包和真实付费 AI/短信/邮件服务没有由这些测试证明；对应平台验收仍独立。模板测试使用本次源码构建的本地 tarball、真实服务与隔离数据库，通知使用本地 HTTP/LDAP 测试夹具。
