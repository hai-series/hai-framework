# AI 指引与 skills 优化报告

日期：2026-09-12。目标优先级：准确理解和使用 → 修正错误 → 在不损失必要信息的前提下缩减上下文。

## 覆盖范围与实现

- 全部 35 个 `SKILL.md`：`.github/skills/` 8 个，CLI 模板 27 个；同步已有参考文件。
- 根 `AGENTS.md`、`LLMS.txt`、`.github/copilot-instructions.md` 和 5 个路径规范。
- CLI 通用入口及 admin、api、website、h5、mobile-app、fullstack 的 AGENTS / CLAUDE / Copilot 桥接文件。
- 检查根与 CLI 模板的 `opencode.json`，现有入口指向正确，保留配置。
- 为 16 个较长 skill 拆出相邻 `reference.md` 或 `guide.md`，入口保留适用条件、输入输出、关键限制和参考章节导航。参考内容仍随 CLI 完整目录复制到生成应用。
- 同步 CLI README；增强现有 CLI 生成测试，逐文件比较所选 skill 目录的交付内容，覆盖新增参考文件。

本次没有修改框架运行时代码或应用实现。代码变化仅位于 CLI 测试；文档和生成应用中的 AI 指引会变化。未提交、发布或部署。

## 准确性与可用性改进

入口现在区分“修改框架源码”和“使用已发布框架开发应用”。按任务读取对应 skill，长配置表和模式示例按需读取，避免不同环境、生命周期和返回类型互相干扰。

所有 skill 描述改为明确的任务触发条件，能力契约写明具体输入、输出与限制。删除重复问卷、强制规模标签、默认外部记忆路径和无条件写记忆等与项目 API 无关的要求。保留初始化依赖、错误处理、权限、环境和验收边界。

关键修正均与当前源码或公开导出核对：

| 问题                                   | 修正后的约定 / 示例                                                                     | 源码依据                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 给所有包套用 `init/close`、`HaiResult` | 区分生命周期模块、core、纯函数、serv 工厂、UI、流式及显式抛错 API                       | 各包入口及类型；[模块规范](../.github/instructions/module-conventions.instructions.md) 汇总 |
| 使用旧 IAM 命名或不存在的依赖注入      | 使用 `iam.auth`；reldb/cache 先初始化，IAM 使用单例，缺失 crypto 时自动初始化           | `packages/iam/src/iam-main.ts`、`iam-types.ts`                                              |
| kit 中臆造的认证与校验 API             | 使用 `kit.createHandle`、`kit.guard.require`、`kit.validate.body`；按实际 auth 配置接入 | `packages/kit/src/kit-main.ts`、`kit-types.ts`                                              |
| query 校验返回值写错                   | 返回校验后的数据，失败抛 Response；使用对应 handler 处理                                | `packages/kit/src/kit-validation.ts`                                                        |
| SvelteKit load 返回 API Response       | load 返回页面数据，重定向与页面错误走框架控制流                                         | 应用现有路由与 kit 类型                                                                     |
| API 错误码误用 HTTP 状态               | 传领域错误码，如 `result.error.code`，区分 HTTP status                                  | kit response 实现与类型                                                                     |
| 分页 schema / 字段不存在               | `PaginationQuerySchema`、`paginatedSchema`、`page/pageSize`                             | `packages/api-contract/src/common/pagination-schemas.ts`                                    |
| 常量、运行时依赖描述不准               | `voidResultSchema` 是常量；api-contract 有 schema 运行时代码                            | `packages/api-contract/src/api-contract-main.ts`                                            |
| reldb CRUD 方法 / 类型错误             | 经 `crud.table(...)` 创建 repository；使用 `findPage`、`ReldbTableDef` 等真实符号       | `packages/reldb/src/reldb-types.ts`、`reldb-crud-repository.ts`                             |
| CRUD create 被当成返回实体             | 返回 ExecuteResult；业务实体由示例显式构造                                              | reldb repository 类型                                                                       |
| ORM 字段映射 API 不存在                | 使用 `fields`，删除臆造的 `fieldMapping/toEntity/fromEntity`                            | reldb repository 类型                                                                       |
| `tx.wrap` 返回失败结果就回滚           | 正常返回仍提交；回调每步检查失败并抛错，或手动事务保留原错误                            | `packages/reldb/src/providers/reldb-tx-assembler.ts`                                        |
| 缓存锁 owner 可复用节点 ID             | 每次获锁尝试生成唯一 owner；释放与续期复用本次值                                        | cache Memory / Redis provider                                                               |
| 锁释放后续期、混淆错误与占用           | 在持有期间续期；区分失败 HaiResult 与成功但未获锁                                       | [hai-cache](../packages/cli/templates/skills/hai-cache/SKILL.md)                            |
| 只缓存命中却称防穿透                   | 明确未缓存空值，不承诺防穿透                                                            | hai-cache 示例实际控制流                                                                    |
| 未检查 AI manager 创建结果             | 先判断 `success` 再访问 `data`                                                          | AI context 类型与示例                                                                       |
| 提前捕获 IAM 占位操作对象              | kit auth 使用 `operations: () => iam.auth` 延迟获取                                     | kit HandleAuthConfig 与 IAM 初始化                                                          |
| Capacitor 初始化参数不存在             | `capacitor.init()` 无参数，状态栏单独配置                                               | `packages/capacitor/src/capacitor-main.ts`                                                  |
| 环境变量只能覆盖现有叶节点             | 根 / 对象 / 数组可整体替换，父节点覆盖优先；无父级覆盖时才遍历已有 YAML 节点            | `packages/core/src/functions/core-function-config.node.ts`                                  |
| 浏览器日志被描述为完全不脱敏           | 默认敏感上下文会脱敏，区分自定义 redact 配置支持范围                                    | `core-function-logger.browser.ts`                                                           |
| TDD 要求已有测试也失败                 | 仅新增目标用例在 Red 阶段因目标行为缺失而失败                                           | 创建、测试及开发流程 skills                                                                 |
| 严重审查问题自动授权修复               | 只读审查先交付证据，修改遵循用户授权范围                                                | 模块 / 应用 / PR 审查 skills                                                                |
| SQL 标识符也用参数占位符               | 值参数化；标识符、排序方向和片段须可信或白名单                                          | 数据库规范及示例                                                                            |
| 生命周期范本与实现漂移                 | 删除重复的大段生命周期伪实现，改为真实源码链接和必要验收条件                            | [模块创建参考](../.github/skills/hai-create-module/reference.md)                            |

fullstack 的 `.md.hbs` 桥接模板也已纳入：说明前端按选择生成、miniapp 目前为预留目录，不把尚未接入的认证存储描述为已有能力。另修正了加密测试命名、Svelte 状态与副作用边界、若干跨 skill 链接、示例环境说明和 datapipe 签名代码块，避免把签名速查表当作可执行 TypeScript。

## 内容规模

以下以本次修改前的 Git HEAD 为基线，统一 CRLF 为 LF 后统计 Unicode 字符数。83 份 AI 指引包括新增参考文件，排除本报告、CLI README 和测试。此数据是上下文体量的代理指标，不是某个模型的精确 token 数。

| 范围                     | 修改前字符 | 修改后字符 |  减少 |
| ------------------------ | ---------: | ---------: | ----: |
| 全部 AI 指引，含参考文件 |    470,200 |    417,935 | 11.1% |
| 35 个 SKILL.md 入口      |    349,217 |    124,150 | 64.4% |
| LLMS.txt                 |     31,753 |      6,258 | 80.3% |
| 仓库 Copilot 工作规范    |     12,057 |      2,637 | 78.1% |

后三行是第一行的子集，不能相加。最大的 SKILL.md 入口为 294 行。入口减少主要来自按需拆分；全部指引的净减少才反映整体内容压缩。长示例和 API 表仍可通过相邻文件找到。

## 验证结果

| 验证                                       | 结果与边界                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:skills`                        | 35 个 skill 契约通过                                                                                                                               |
| 本地 Markdown / frontmatter / 代码围栏检查 | 83 份文档、103 个本地引用通过                                                                                                                      |
| 错误码核对                                 | 对照 310 个源码定义，269 个明确错误键与 code 配对通过                                                                                              |
| 源码导出与示例静态检查                     | 21 个源码入口、196 个具名导入、241 条成员链、553 处调用参数数量通过；不等于全部片段完整类型检查                                                    |
| CLI `typecheck` / `lint` / `build`         | 通过                                                                                                                                               |
| CLI `test`                                 | 260 项通过；常规命令默认跳过 6 项完整脚手架门禁，单独运行见下行                                                                                    |
| CLI `test:scaffold-gates`                  | 6/6 通过，退出码 0；api、admin、website、h5、mobile-app、fullstack 均通过 install/typecheck/lint/build/test/test:e2e；脚手架测试阶段耗时约 23 分钟 |
| SQLite 文档示例实跑                        | 从测试参考文档提取示例，内存 SQLite 冒烟 1/1 通过；临时测试已移除                                                                                  |
| CLI 本地打包检查                           | tarball 包含全部 27 个 CLI SKILL.md 、13 个 guide/reference 文件和 3 个 fullstack 桥接模板；没有发布                                               |
| `git diff --check`                         | 通过                                                                                                                                               |

没有开展模型 A/B 任务集评测，因此不声称 AI 准确率提升了具体百分比。准确性证据来自源码核对、错误示例修正、静态检查及上述实际执行。原生端、外部付费模型、真实第三方服务和生产部署不在本次文档优化验收范围内。
