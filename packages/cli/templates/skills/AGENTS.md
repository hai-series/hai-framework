# AGENTS.md

> 通用 AI 编程助手入口。优先阅读 `README.md`、现有测试与 `.agents/skills/`；本文件同时作为 `hai add` / AI 支持回填时的 generic fallback。

## 需求与模板

- 业务行为以用户当前明确要求及其指定的需求/设计文档为准。本文件、README、skills、示例、生成代码及其测试中的模板默认行为是起点，不是不可变的业务约束；角色代码、权限模型、页面流程、字段、限额、存储方式与架构均可按实际需求调整。
- 需求与模板不同，审查时记录为模板适配项，不据此判定需求错误或阻塞审查，也不要求用户额外授权“覆盖模板”；实施时在已有授权范围内修改或移除冲突逻辑，并同步 contract、鉴权、数据迁移、界面、配置、测试、文档及本文件中的过期规则。
- 未说明的行为可参考现有实现并注明假设，不能升级为强制需求。只有业务要求自身矛盾、与已确认项目决策的优先级不明，或存在真实技术/安全障碍时才提出具体问题；已明确的规则不重复要求选择。
- 业务规则与技术契约分别判断：可用 API 以当前安装版本的公开类型为准；输入校验、服务端授权、资源隔离和密钥保护仍须落实。需求涉及替换技术方案时说明影响并同步迁移，不能用保留模板默认值代替解决问题。

## 行为契约

需求/设计文档审查或从文档生成代码时，读取 [hai-spec-review](.agents/skills/hai-spec-review/SKILL.md)，严格确认完备性、歧义、技术正确性与命名一致性；影响行为的问题未解决前不判定文档可生成。普通小改动不重审无关文档。

升级 hai-framework 到最新/指定版本、比较版本差异或同步框架 skills 时，先读 [框架升级与同步 Skill](.agents/skills/hai-framework-sync/SKILL.md)，执行版本发现、差异分析、用户选择/阻塞处理、迁移与验证；仅要求比较时不修改应用。

根据文档规划、实施、继续、返修或按已提交文档变更同步实现时，读取 [hai-spec-implement](.agents/skills/hai-spec-implement/SKILL.md)：维护 docs 清单与任务记录，比较已验收与目标文档 Git 快照，更新原任务或新建任务，每项独立分支 TDD、验证并本地合并；全部差异与整体验收通过后才推进基线。返修复用原任务与分支。仅规划不实施，指定任务先核验依赖。

普通新增、修改、修复任务开始前，先读 [应用开发 Skill](.agents/skills/hai-app-create/SKILL.md) 和 [开发规范与框架能力路由](.agents/skills/hai-app-create/development.md)；再按任务读取模块 Skill 及其相邻参考文件。架构/构建、审查、测试分别读取 hai-build、hai-app-review、hai-app-tests，不加载整个 skill 树。

- 对当前需求逐项检索 hai-framework 能力和已有实现，确认适用的公开 API 后优先复用；未安装模块先核对依赖与配置，不能因 Skill 已存在就假定已启用。框架不适用时说明具体限制与选用方案，不为覆盖清单引入无关模块。
- 按已安装版本的公开类型确认模块契约：生命周期模块按 init → use → close；core/serv/kit、纯函数/工厂与流按实际签名处理。返回 HaiResult 的操作先检查 success，不以 try/catch 代替判断；事务失败明确触发回滚。
- 边界输入做 schema 校验，服务端验证身份、租户与资源权限；SQL 动态值参数化，文件路径防逃逸。密钥不进入 PUBLIC_/VITE_ 变量、客户端代码和日志；敏感 token 不写 localStorage。
- 禁止 any、无说明的 as unknown as、console.log 和硬编码密钥；从包公开入口导入。注释中文、结构化日志英文并脱敏，用户文本走现有 i18n 并同步所有 locale。
- 完成时说明实际复用的框架能力、未采用的相关能力及原因、门禁结果；跨边界同步类型、配置、调用方、文档和测试。

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

- 直接影响：修改 / 新建 / 删除哪些文件；哪些脚本、类型、配置或路由会变。
- 间接影响：哪些测试、README、i18n、示例、共享类型、依赖方需要同步更新。

## 项目概述

本项目由 hai-framework CLI 生成。单应用工程通常在 `src/` 下开发；多包工程会同时包含 `packages/*` 与 `apps/*`。实际结构以当前项目目录为准。

如项目使用 SvelteKit，`+server.ts` 只能导出 HTTP handler 与 SvelteKit 允许的配置项；辅助函数放到 `src/lib/**`。

## 工作流程

1. 先搜索现有实现、引用点、测试和 README。
2. 小步修改，优先保持目录结构、公开 API 和脚本稳定。
3. 改动公共类型、配置、模板或共享逻辑时，同步更新所有调用方与文档。
4. 一轮修改完成后按影响范围收集全部可执行门禁结果，汇总问题再集中修复、复测；普通失败不立即从头重跑。

## 代码注释与示例

- 尽可能补充有信息量的中文 JSDoc：所有 export 的函数/类/方法、核心算法与业务流程、所有数据库表/列、接口/type/schema 及其字段都必须说明用途、单位、约束和关联关系。核心逻辑解释决策原因、边界、权限与失败路径，不逐行复述代码。
- 函数按实际契约写 @param、@returns，仅确实抛错时写 @throws；异步、HaiResult 与事务失败行为须说明。类型/表结构说明字段含义、可空性、默认值、主外键和唯一约束。
- 上述函数和结构的 JSDoc 均提供可理解的 @example：函数给调用及结果判断，结构给合法数据，表给典型行或查询示例。省略上下文要标明，不使用真实凭据。示例随实现同步，不能只堆叠没有信息量的注释。
- 调用及结构示例见 [.agents/skills/hai-app-create/development.md](.agents/skills/hai-app-create/development.md) 的 JSDoc 注释一节。

## 质量门禁

AI 先分析差异、调用方和受影响流程，默认只选择相关 test/E2E 与必要门禁，用户明确要求时才全量。核对 package.json，按 [分轮验证与集中修复](.agents/skills/hai-app-tests/validation.md) 收集所选检查与日志，再归并修复、复测失败及受影响项；普通失败不中断独立检查，真实前置阻塞才暂停依赖项。文档检查引用，UI/路由变更加相关 E2E，未运行项说明原因。

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- typecheck / lint / build / test / test:e2e 状态明确；整轮收集后集中修复，最终必需门禁对最终代码有效通过，未执行或阻塞明确原因，不能宣称完成。
- README、i18n、测试、代码注释与实现保持一致。
- 最终回复说明执行过的门禁、已同步的文档 / 依赖方，以及未完成项。

## Skills 路由

- `.agents/skills/hai-build/SKILL.md`：架构、构建和质量门禁。
- `.agents/skills/hai-app-create/SKILL.md`：应用骨架、路由、页面与 API 模板。
- `.agents/skills/hai-app-review/SKILL.md`：应用代码审查。
- `.agents/skills/hai-app-tests/SKILL.md`：Vitest / Playwright 测试策略。
- 具体模块按需读取对应 `hai-*` Skill。

前端项目已交付对应技能时，先按 hai-ui-design 确定任务、布局、状态与组件映射，使用 hai-ui 实现，再由 hai-ui-review 检查真实页面。窄范围修改复用已有设计；按实际语言/主题/尺寸验证。

工作流技能按 hai-领域-动作 命名，能力使用类沿用领域名。需求、验收、发现与当前版本证据按 [工作交接契约](.agents/skills/hai-spec-implement/handoff.md) 传递，沿既有清单恢复任务。
