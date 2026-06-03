# AGENTS.md

> H5 移动端项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`messages/*` 与移动端测试工作。

## 行为契约

1. 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
2. 任务规模 ≥ M 时，先回顾现有路由、触屏交互、messages、测试与 `.agents/skills/*/SKILL.md`。
3. 在写第一行新代码前，用 1 行回答 Q1-Q7 必要性自检。
4. 任务规模 ≥ M 时，说明将影响的页面、移动端导航、API、messages、测试和 README。

## 必要性自检（M / L 任务必须输出）

- Q1：已有页面 / layout / 底部导航 / 组件是否可复用？
- Q2：能否扩展现有路由、移动端组件和 API，而不是新增抽象层？
- Q3：当前真实调用点是哪些触屏页面、导航和 API？
- Q4：能否用更少的 route、section、helper 解决？
- Q5：是否把服务端、中间态或敏感 token 细节泄漏给页面层？
- Q6：是否与现有移动端布局、i18n、脚本和路由结构一致？
- Q7：是否比较过更安全的鉴权、缓存和请求处理方式？

## 影响分析（M / L 任务必须输出）

- 直接影响：哪些页面、layout、导航、API、messages、README、测试会变。
- 间接影响：哪些移动端流程、权限入口、共享组件和接口断言需要同步。

## 项目定位

本项目是 hai-framework H5 模板，面向移动浏览器，重点是触屏布局、移动端导航、i18n、API 调用与端到端流程。

## 架构边界

- 使用移动端友好的布局和 `@h-ai/ui` 移动组件。
- 页面文本走 i18n，同步中英文 messages。
- API 输入必须校验，业务错误按 HaiResult 传递。
- `+server.ts` 只能导出 handler 和 SvelteKit 允许的配置项；helper 放到 `src/lib/**`。
- 敏感 token 不要写入不安全存储；优先复用模板已有的鉴权与请求模式。
- 本样板默认不以 `@h-ai/serv`、`@h-ai/api-contract`、`@h-ai/api-client`、`@h-ai/capacitor` 作为主架构。

## 工作流程

1. 先搜索现有移动端页面、导航、messages、API 和测试。
2. 修改导航、触屏交互、API 或认证流程时，同步 README、i18n 和测试。
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

- 页面、导航、API、i18n 与测试保持一致。
- 最终回复说明门禁状态、已更新移动端流程 / 文档与未完成项。

## 优先 Skills

- `hai-build`、`hai-app-create`、`hai-app-review`、`hai-app-tests`
- `hai-kit`、`hai-ui`、`hai-reldb`、`hai-cache`
- 其它 `hai-*` 模块按需读取
