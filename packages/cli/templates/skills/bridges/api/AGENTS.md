# AGENTS.md

> API 服务项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`apps/*-contract/src/**`、`apps/*-service/src/**` 与测试工作。

## 行为契约

普通新增、修改、修复任务开始前，先读 [应用开发 Skill](.agents/skills/hai-app-create/SKILL.md) 和 [开发规范与框架能力路由](.agents/skills/hai-app-create/development.md)；再按任务读取模块 Skill 及其相邻参考文件。架构/构建、审查、测试分别读取 hai-build、hai-app-review、hai-app-tests，不加载整个 skill 树。

- 对当前需求逐项检索 hai-framework 能力和已有实现，确认适用的公开 API 后优先复用；未安装模块先核对依赖与配置，不能因 Skill 已存在就假定已启用。框架不适用时说明具体限制与选用方案，不为覆盖清单引入无关模块。
- 按已安装版本的公开类型确认模块契约：生命周期模块按 init → use → close；core/serv/kit、纯函数/工厂与流按实际签名处理。返回 HaiResult 的操作先检查 success，不以 try/catch 代替判断；事务失败明确触发回滚。
- 边界输入做 schema 校验，服务端验证身份、租户与资源权限；SQL 动态值参数化，文件路径防逃逸。密钥不进入 PUBLIC_/VITE_ 变量、客户端代码和日志；敏感 token 不写 localStorage。
- 禁止 any、无说明的 as unknown as、console.log 和硬编码密钥；从包公开入口导入。注释中文、结构化日志英文并脱敏，用户文本走现有 i18n 并同步所有 locale。
- 完成时说明实际复用的框架能力、未采用的相关能力及原因、门禁结果；跨边界同步类型、配置、调用方、文档和测试。

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

- 直接影响：哪些 `apps/*-contract`、`apps/*-service`、config、README、测试会变。
- 间接影响：哪些 typed client、部署脚本、环境变量说明和断言需要同步。

## 项目定位

本项目是 hai-framework API workspace：`apps/<project>-contract` 提供 typed contract，`apps/<project>-service` 提供 `@h-ai/serv` 实现，无 UI 页面和前端 i18n。

## 架构边界

- API 输入输出必须由 `apps/*-contract/src/**` 中的 Zod schema 与 contract 定义统一约束。
- Service 通过 `@h-ai/serv` + `@h-ai/api-contract` 装配 HTTP App；不要退回到 SvelteKit API routes 架构。
- Typed client / contract / service 三者保持同一份路径与类型定义，不要复制粘贴接口。
- 不生成用户页面；不要引入 UI 专属依赖或页面文案。
- 配置和密钥来自 `apps/*-service/config/` 与环境变量，禁止硬编码。

## 工作流程

1. 先搜索现有 contract、procedures、init、config 和测试。
2. 修改 contract、响应格式、安全策略或配置时，同步 README、typed client 调用方与测试。
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

- 修改 contract、procedure、配置或环境变量说明后，同步测试、README 和调用方。
- 最终回复说明门禁状态、已更新 contract / service / 配置 / 文档与未完成项。

## 优先 Skills

- `hai-build`、`hai-app-create`、`hai-app-review`、`hai-app-tests`
- `hai-serv`、`hai-api-contract`、`hai-api-client`
- `hai-core`、`hai-reldb`、`hai-cache`、`hai-iam`、`hai-crypto`
