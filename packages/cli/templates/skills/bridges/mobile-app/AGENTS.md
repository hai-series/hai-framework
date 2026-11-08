# AGENTS.md

> Capacitor Mobile App 项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/`、`messages/*` 与移动端测试工作。


## 行为契约

先读 [项目共同规则](.agents/skills/hai-app-create/project.md)，按当前任务读取下面的入口；不要加载整个 skill 树。业务以用户当前明确要求及指定文档为准，模板行为是可调整的起点。

| 任务 | 入口 |
| --- | --- |
| 新增、修改、修复应用 | [hai-app-create](.agents/skills/hai-app-create/SKILL.md)；配置、注释与能力选择按需查 [development.md](.agents/skills/hai-app-create/development.md) |
| 需求/设计文档审查 | [hai-spec-review](.agents/skills/hai-spec-review/SKILL.md) |
| 文档驱动规划、实施或返修 | [hai-spec-implement](.agents/skills/hai-spec-implement/SKILL.md) |
| 代码审查 / 测试 / 构建 / 升级 | 按任务读取同名 hai-app-review / hai-app-tests / hai-build / hai-framework-sync；模块按实际依赖选择 |

## 项目概述

本项目是 hai-framework Mobile/Capacitor 模板：直接使用 Svelte 5 + Vite 输出 SPA，Capacitor 负责 Android/iOS 原生壳和设备能力。

## 架构边界

- 页面统一继承公共 header/footer；新增 SPA 页面放 `src/lib/pages/**/*.svelte`，由 `HashRouter` 自动发现。菜单只维护业务入口，不维护路由表。

- 当前客户端使用 Vite SPA；保留此架构时不混入 SvelteKit 路由、server hooks 或 `@h-ai/kit`。
- 需求迁移到 SvelteKit 时同步运行环境、路由、初始化、构建与原生壳集成；不能仅添加 `+page.svelte` 等文件就视为完成迁移。
- 原生能力通过 `@h-ai/capacitor` 使用；token 原生端使用 Capacitor 安全存储，Web 预览仅使用内存存储。
- API 调用使用 `@h-ai/api-client`，业务错误按 HaiResult 处理。
- 页面文本走 i18n，同步中英日文 messages。
- 原生桥接与设备调用放在 `src/lib/capacitor.ts` 或 service，避免散落在页面模板中。
- 本样板默认不使用 `@h-ai/core`、`@h-ai/kit`、`@h-ai/serv`、`@h-ai/api-contract` 作为主架构。

## 常用命令

```bash
pnpm build
pnpm cap:sync:android
pnpm cap:run:android
pnpm cap:build:android:debug
pnpm cap:build:android:release
```


## 完成条件

按实际 package scripts 和 [分轮验证](.agents/skills/hai-app-tests/validation.md) 选择受影响范围，依次收集 typecheck → lint → build（需要时）→ test → 相关 E2E；例如 `pnpm typecheck`。普通失败不中断独立检查，汇总后集中修复并定向复测。报告实际结果、文档/调用方同步与未验证原因；不能用静态、mock 或 Web 结果代替真实业务、外部服务或原生验证。
