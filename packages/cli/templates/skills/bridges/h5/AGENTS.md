# AGENTS.md

> H5 移动端项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`messages/*` 与移动端测试工作。

## 行为契约

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

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

- 页面、导航、API、i18n 与测试保持一致。
- 最终回复说明门禁状态、已更新移动端流程 / 文档与未完成项。

## 优先 Skills

- `hai-build`、`hai-app-create`、`hai-app-review`、`hai-app-tests`
- `hai-kit`、`hai-ui`、`hai-reldb`、`hai-cache`
- 其它 `hai-*` 模块按需读取
