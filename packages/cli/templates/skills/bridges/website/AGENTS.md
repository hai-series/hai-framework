# AGENTS.md

> 企业官网项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`messages/*` 与测试工作。

## 行为契约

1. 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
2. 任务规模 ≥ M 时，先回顾现有页面、SEO 相关实现、表单/API、测试与 `.agents/skills/*/SKILL.md`。
3. 在写第一行新代码前，用 1 行回答 Q1-Q7 必要性自检。
4. 任务规模 ≥ M 时，说明将影响的页面、表单、messages、SEO 元信息、测试和 README。

## 必要性自检（M / L 任务必须输出）

- Q1：已有页面 / layout / 组件 / 表单是否可复用？
- Q2：能否扩展现有 route、section、组件，而不是新增抽象层？
- Q3：当前真实调用点是哪些页面、表单或 API？
- Q4：能否用更少的 section、组件、helper 解决？
- Q5：是否把后端、存储或中间态细节泄漏给页面层？
- Q6：是否与现有路由、i18n、SEO 和脚本一致？
- Q7：是否比较过更安全的表单校验、SEO 和构建方案？

## 影响分析（M / L 任务必须输出）

- 直接影响：哪些页面、layout、表单/API、messages、README、测试会变。
- 间接影响：哪些导航入口、SEO 标签、部署脚本和共享组件需要同步。

## 项目定位

本项目是 hai-framework 企业官网模板，重点是 SvelteKit 页面、SEO、i18n、表单/API 边界和可部署构建产物。

## 架构边界

- 页面内容与导航文案全部走 i18n，同步中英文 messages。
- 表单和 API 输入必须 Zod 校验。
- UI 组件优先使用 `@h-ai/ui`，不要重复实现已有组件。
- `+server.ts` 只能导出 handler 和 SvelteKit 允许的配置项；helper 放到 `src/lib/**`。
- SEO 元信息、路由结构和消息文案要一起维护。
- 本样板默认不以 `@h-ai/serv`、`@h-ai/api-contract`、`@h-ai/api-client`、`@h-ai/capacitor` 作为主架构。

## 工作流程

1. 先搜索现有页面、layout、组件、messages、表单/API 和测试。
2. 修改页面时同步 README、i18n、测试和 SEO 相关元信息。
3. 每次改动后运行质量门禁，不能留下“已知失败”。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- 页面、表单、SEO、i18n 与测试保持一致。
- 最终回复说明门禁状态、已更新页面 / 表单 / 文档与未完成项。

## 优先 Skills

- `hai-build`、`hai-app-create`、`hai-app-review`、`hai-app-tests`
- `hai-kit`、`hai-ui`、`hai-reldb`、`hai-cache`
- 其它 `hai-*` 模块按需读取
