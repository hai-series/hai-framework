# AGENTS.md

> API 服务项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`apps/*-contract/src/**`、`apps/*-service/src/**` 与测试工作。

## 行为契约

1. 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
2. 任务规模 ≥ M 时，先回顾现有 contract、service、配置、测试与 `.agents/skills/*/SKILL.md`。
3. 在写第一行新代码前，用 1 行回答 Q1-Q7 必要性自检。
4. 任务规模 ≥ M 时，说明将影响的 contract、procedures、配置、README 和调用方。

## 必要性自检（M / L 任务必须输出）

- Q1：已有 contract / procedure / module API 是否可复用？
- Q2：能否扩展现有 schema、config、procedure，而不是新增抽象层？
- Q3：当前真实调用点是哪些测试、客户端或 service 入口？
- Q4：能否用更少的 contract 节点、middleware 或配置解决？
- Q5：是否把 provider、DB 行结构或内部错误细节泄漏给调用方？
- Q6：是否与现有 workspace 目录结构、脚本和质量门禁一致？
- Q7：是否比较过更安全的输入校验、安全头和密钥处理方案？

## 影响分析（M / L 任务必须输出）

- 直接影响：哪些 `apps/*-contract`、`apps/*-service`、config、README、测试会变。
- 间接影响：哪些 typed client、部署脚本、环境变量说明和断言需要同步。

## 项目定位

本项目是 hai-framework API workspace：`apps/<project>-contract` 提供 typed contract，`apps/<project>-service` 提供 `@h-ai/serv` 实现，无 UI 页面和前端 i18n。

## 架构边界

- API 输入输出必须由 `apps/*-contract/src/**` 中的 Zod schema 与 contract 定义统一约束。
- Service 通过 `@h-ai/serv` + `@h-ai/api-contract` 装配 HTTP App；不要退回到 SvelteKit API routes 架构。
- Typed client / contract / service 三者保持同一份路径与类型定义，不要复制粘贴接口。
- 公共模块 API 返回 `HaiResult<T>`；业务错误不要直接 `throw`。
- 不生成用户页面；不要引入 UI 专属依赖或页面文案。
- 配置和密钥来自 `apps/*-service/config/` 与环境变量，禁止硬编码。

## 工作流程

1. 先搜索现有 contract、procedures、init、config 和测试。
2. 修改 contract、响应格式、安全策略或配置时，同步 README、typed client 调用方与测试。
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

- 修改 contract、procedure、配置或环境变量说明后，同步测试、README 和调用方。
- 最终回复说明门禁状态、已更新 contract / service / 配置 / 文档与未完成项。

## 优先 Skills

- `hai-build`、`hai-app-create`、`hai-app-review`、`hai-app-tests`
- `hai-serv`、`hai-api-contract`、`hai-api-client`
- `hai-core`、`hai-reldb`、`hai-cache`、`hai-iam`、`hai-crypto`
