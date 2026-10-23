# 框架模块审查参考

## §0 如何使用本文档

> 先读 §1-§3，按问题类型读取对应小节。完整审查必须覆盖 §3-§9，不能只做基础 checklist 就结束。

## §1 审查契约

1. **先搜再判**：用 `rg` 确认引用点、依赖方、测试与文档，禁止靠猜。
2. **先删后加**：冗余、死代码、纯转发、未来预留优先删除/折叠。
3. **成套更新**：代码 / 类型 / 测试 / README / Skill / 注释同步，禁止只改一处。
4. **P0/P1 优先报告**：给出证据和影响；用户已授权修复时优先修到通过。
5. **质量门禁**：按 [工作规范](../../instructions/workspace.md#验证与交付) 分轮收集适用门禁，汇总后集中修复、再验证；涉及 UI/路由运行 E2E 或说明未执行原因。
6. **输出未完成项**：未运行、豁免或保留建议必须写明原因和后续动作。

## §2 核心原则

### 最小知识（Law of Demeter）

- 调用方只需要知道公共服务对象、必要配置、业务返回值。
- 若普通业务调用被迫理解内置 Provider、Repository、目录结构、DB 行、中间态或转发链，判为问题。已明确支持的 Provider/Store 注入扩展按真实公开契约保留，不与内部实现混为一谈。
- 上游能力顶层注入一次，模块内部派生回调；禁止要求使用方写 `{ verifyToken: t => iam.auth.verifyToken(t) }` 这类样板。

### 反过度设计（YAGNI）

- 没有 ≥2 个真实实现：不加 Provider / Strategy / Factory / Base。
- 没有真实调用点：不加配置项、开关、扩展点、兼容层。
- 没有跨文件复用：不拆 utils / constants / helper。
- 没有实际消费或扩展契约：不增加公共导出；普通源文件可为内部跨文件复用 export，但包入口不能顺带转发全部实现。

### 简单与整洁

- 正确性 > 简单性 > 可读性 > 可扩展性。
- 主流程应可顺读，优先 early return；复杂度、函数长度与嵌套限制以当前 ESLint 规则为准。
- 命名直白，禁止 `data` / `info` / `handle` / `process` / `manager` 等含糊名。

## §3 架构与最小知识审查

对照 `hai-create-module 的架构决策与目录规则`：

- [ ] 模块类型正确（生命周期单例 / 工厂 / 纯函数 / 基础设施）
- [ ] API 风格统一（扁平方法 vs 子操作对象），无混用
- [ ] `xx-main.ts` 仅生命周期管理 + API 编排，不写具体业务逻辑
- [ ] package.exports/公开 barrel/内部实现三层边界清晰；允许有依据的 selective/type-only/别名、Svelte 默认组件和 client/server 分隔
- [ ] 所有 exports 条件/子路径有真实构建文件与声明；generate:api/check:api/test:api 验证通过，浏览器不含 Node 依赖
- [ ] 目录结构符合基础 / 子功能 / Client / API 契约约定
- [ ] 常见操作不需要调用方跨多层对象、内部目录或中间态
- [ ] 没有单实现 Provider / 单子类 Base / 单用途 Factory / 未来预留配置
- [ ] 模块间只依赖公共类型，不 import 对方内部文件

## §4 命名与可读性审查

对照 `module-conventions` 命名表：

- [ ] 服务对象、Functions、Operations、Error、Req/Resp、Repository 命名一致
- [ ] 文件名 / 类型名 / 变量名职责一致；重命名已同步引用、测试、文档、注释
- [ ] 表名 `hai_<module>_<feature>`；缓存 key `hai:<module>:<feature>`；就近定义且不可配置
- [ ] import 顺序正确，type-only import 合规
- [ ] 无死代码、注释代码、调试输出、未使用 import / 变量 / 类型
- [ ] 无 A→B→C→D 纯转发链、一次性包装层或重复样板

## §5 类型、错误与生命周期审查

- [ ] 先区分生命周期操作、纯函数、getter、工厂与流；返回 HaiResult 的业务 API 不抛业务异常
- [ ] 内部 SDK 异常在约定的公共边界转 HaiResult；显式抛错 API 与框架控制流另按契约审查
- [ ] async generator / Client / CLI / `getOrThrow()` 等例外已由命名或 JSDoc 明确说明
- [ ] 错误码命名空间与注册表一致；新模块 `NOT_INITIALIZED` 使用 `hai:<module>:010`；文档错误码与源码一致
- [ ] 错误消息用错误码 + i18n key，禁止硬编码用户可见文本
- [ ] 禁止 `any`、禁止无注释 `as unknown as T`；已有依赖类型直接 import
- [ ] 对外类型集中在 `xx-types.ts`，不泄漏 DB 行、Provider 状态或内部中间态
- [ ] NotInitializedKit 完整：顶层 proxy、close 后切回、未初始化调用返回 NOT_INITIALIZED
- [ ] `init()` 有 `initInProgress` + `try/finally`；并发 init 返回 HaiResult 错误，不抛异常

## §6 性能与分布式审查

- [ ] 独立查询优先批量或有界并发；事务、顺序依赖与限流任务允许串行，不把循环 await 一律判为 N+1
- [ ] 大数据集按实际内存和延迟要求分页/流式处理，不套用固定条数阈值
- [ ] 热路径不重复创建 Provider / Client / 连接池
- [ ] 运行时无同步 I/O；`readFileSync` / `writeFileSync` 仅限 CLI 或 init 一次性路径
- [ ] DB/HTTP/Redis/event listener/timer 在 `close()` 和异常路径释放
- [ ] 模块级 Map/Set 不缓存跨节点一致业务数据；允许 SDK client、不可变配置、连接池、单节点 provider 内部状态
- [ ] 写操作幂等，失败重试不会重复写入；事务中途失败能回滚

## §7 安全、日志与 i18n 审查

- [ ] SQL 动态值参数化；where/order/raw 片段只来自白名单或可信代码，用户输入必须走 params
- [ ] API 边界 Zod 校验后才进入业务层
- [ ] 文件路径防遍历；外部 URL 防 SSRF；无 eval / Function / 未消毒 innerHTML
- [ ] 认证令牌：Web 用 httpOnly cookie，移动/桌面安全 TokenStore，禁止 localStorage
- [ ] 无硬编码密钥；password/token/apiKey/隐私字段不进日志
- [ ] URL/连接串/配置对象先 `sanitize*` 再记录
- [ ] 无 `console.log`；日志消息英文、代码注释中文、用户可见文本走 i18n key

## §8 测试与文档审查

### 测试

- [ ] 测试通过统一公共入口（`xx.operation()`），不直接调用内部实现
- [ ] 正常路径、边界路径、参数选项、多实现均覆盖
- [ ] HaiResult 断言：`result.success` + `error.code`
- [ ] 流式/AsyncIterable API 用 `for await...of` 验证关键 chunk、结束和异常
- [ ] 测试稳定，无随机/时序依赖；外部依赖使用 mock 或 Testcontainers
- [ ] 重复且不能验证独立风险的用例应合并；覆盖率不变不能作为删除不同边界测试的理由

### 文档

- [ ] README 面向使用者，按简介、核心功能、使用入门、开发测试、许可证组织；仅有生命周期时展示 init → use → close
- [ ] README 不写完整类型清单、内部目录、Provider/Repository 细节
- [ ] 公共 API JSDoc 有 `@param` / `@returns` / 常见 `@example`
- [ ] `.agents/skills/` 与对应 CLI skill 模板（如存在）同步
- [ ] 错误码、配置项、API 签名、示例代码与源码一致

## §9 完整审查流程

1. **定范围**：列出将审查的模块、入口文件、测试、README、skill/template。
2. **查引用**：搜索 public API、错误码、配置项、导出路径的所有引用。
3. **逐项审查**：按 §3-§8 打勾；先报告发现；已授权修复时按优先级实施，不顺手扩大范围。
4. **反向质疑**：再问一遍“能删吗？能复用吗？是否让调用方知道太多？是否为未来假设？”
5. **跑门禁**：按影响范围收集一轮 typecheck/lint/build/test/E2E 结果，普通失败不中断独立检查，归并后集中修复并开启下一轮。
6. **完成报告**：列出已修复、保留建议、门禁状态、未完成项。

### 优先级

| 等级 | 含义 | 处理 |
| --- | --- | --- |
| P0 | 数据损坏 / 安全漏洞 / 服务崩溃 / 死锁 / OOM | 优先报告；已授权时立即修复 |
| P1 | 连接泄漏 / 竞态 / 权限绕过 / 错误吞没 / 非幂等写入 | 已授权修复时优先处理 |
| P2 | 性能瓶颈 / 可读性差 / 冗余抽象 / 测试缺口 | 优先修复或明确保留 |
| P3 | 风格 / 命名 / 注释 / 文档小问题 | 按授权范围处理 |

### 输出格式

```
## 变更汇总

### 已修复（N 项）
| # | 等级 | 文件 | 改动摘要 |
|---|------|------|---------|

### 保留建议（M 项）
| # | 等级 | 位置 | 建议 / 未修原因 |
|---|------|------|----------------|

### 门禁
- typecheck / lint / build / test / e2e：通过 / 失败 / 阻塞 / 未执行 / 不适用（写明范围、结果来源和原因）

### 未完成项
- <项目>：<原因> → <后续动作>
```

## §10 合规模式速查（避免误报）

- raw SQL 片段：动态值必须 params；列名/排序/where 片段必须白名单或可信代码，并有 JSDoc 警告。
- Provider helper throw：仅当所有调用点被外层 catch 转 HaiResult，且公共 API 不泄漏异常时合规。
- `createProvider` default throw：配置 schema 已枚举所有合法类型且位于 init 内部时合规。
- 模块级 Map/Set：SDK client、不可变配置、连接池、单节点 memory provider 内部状态合规；跨节点业务数据不合规。
- 同步 I/O：仅 CLI 或 init 一次性路径合规；请求/任务热路径不合规。

模块注释与示例按 [JSDoc 验证约定](../../../docs/module-jsdoc.md) 检查；使用真实公共入口和数据，内部类型示例标明词法上下文。受影响包构建后执行 `node scripts/check-module-jsdoc.mjs --package <模块>`；该仓库命令不复制到应用模板。
