# AGENTS.md

> 企业官网项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`messages/*` 与测试工作。

## 行为契约

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

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
3. 按改动范围验证，修复本次引入的失败；已有问题与未运行项明确报告。

## 质量门禁

先核对 package.json，按影响范围执行已有脚本；文档检查引用，UI/路由变更再运行 E2E。未运行项说明原因。

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
