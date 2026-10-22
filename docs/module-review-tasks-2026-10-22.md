# 全模块审查与修正任务清单（2026-10-22）

审查起始基线：`320c9ddb15f938a9e40e44ca0ce17a83a70bcba9`，根版本 `0.1.0-alpha.67`。交付前 HEAD 更新为 `eb0f2216c20b63d2fdcea8600009736b248aa146`，已核对两者仅有 30 个 package 文件的版本同步，所引用运行时源码未变。范围覆盖 `packages/*` 的 21 个模块，并追踪受影响的应用、CLI 模板、配置、文档和 skills。按用户要求不考虑向后兼容：应直接修正契约并同步消费者，不保留已知不安全或错误的旧路径。

本清单保留审查基线并逐项记录实施结果；已修正项附定向验证证据，全部任务实施完成后再执行全量回归。初审发现 65 个行为/安全/分布式/规范任务；实施复核新增 VECDB-03、CORE-03、AI-06、VECDB-04、UI-02、CLI-03、AI-07、VECDB-05、DOC-02、AI-08，共 75 个，另有 21 个按模块拆分的 JSDoc 任务，共 96 项。清单是当前源码审查发现集合，不代表已穷尽所有运行环境和第三方服务缺陷。

实施进度：P1 47/47；P2 35/49（已通过定向验证；全量回归尚未执行）。

## 使用与验收规则

- P1：安全、授权、凭据、数据丢失、假成功或生产分布式正确性问题，优先于整理工作；P2：契约、可靠性、规范及维护改进。未据未经验证的部署推断标注 P0。
- “源码探针已复现”执行了原始 TypeScript 函数，基础设施依赖使用可控替身；SM4 探针使用真实算法实现。“源码确认”有可定位的代码路径；“按本次要求补强”包含现有明确限制与用户目标之间的差距，不冒充已发生的事故。
- 每项关闭条件包括：修复实现、补充行为回归、同步受影响公共契约与文档、执行门禁并记录真实验收证据。未做真实 provider/多进程验收不能仅凭单元测试勾选完成。
- 任务中的范围为最低修改集合，执行前重新 rg 查调用、测试、README/skills、模板与环境变量。只删除已确认冗余的代码；保留用户现有改动。
- 不把连接池、编译缓存、客户端 UI 状态、不可变配置、测试 memory provider 一律迁入 Redis；只协调跨节点共享业务状态。

## 覆盖与注释基线

以下为排除 Paraglide 生成目录的 `.ts/.svelte` 统计。导出统计只计算 TS 顶层 export 声明（函数、类型、接口、变量、类），包含内部文件导出，不等于 package 公开 API；不含 re-export、Svelte 组件 API、方法和私有结构体。缺示例包含完全缺 JSDoc 的声明，不应相加。

| 模块 | TS/Svelte 文件 | 导出声明 | 无 JSDoc | 无 @example | 行为/规范任务 | 注释任务 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| ai | 80 | 422 | 0 | 372 | AI-01、AI-02、AI-03、AI-04、AI-05、AI-06、AI-07、AI-08 | JSDOC-01 |
| api-client | 6 | 20 | 0 | 14 | CLIENT-01、CLIENT-02 | JSDOC-02 |
| api-contract | 20 | 145 | 49 | 141 | CONTRACT-01 | JSDOC-03 |
| audit | 7 | 16 | 1 | 11 | AUDIT-01 | JSDOC-04 |
| cache | 7 | 28 | 1 | 20 | CACHE-01、CACHE-02、CACHE-03、CACHE-04 | JSDOC-05 |
| capacitor | 9 | 31 | 1 | 18 | CAP-01、CAP-02 | JSDOC-06 |
| cli | 17 | 75 | 7 | 63 | CLI-01、CLI-02、CLI-03 | JSDOC-07 |
| core | 23 | 85 | 21 | 47 | CORE-01、CORE-02、CORE-03 | JSDOC-08 |
| crypto | 15 | 48 | 1 | 44 | CRYPTO-01、CRYPTO-02、CRYPTO-03、CRYPTO-04 | JSDOC-09 |
| datapipe | 8 | 23 | 0 | 14 | PIPE-01 | JSDOC-10 |
| deploy | 26 | 75 | 1 | 55 | DEPLOY-01、DEPLOY-02、DEPLOY-03 | JSDOC-11 |
| iam | 38 | 151 | 9 | 150 | IAM-01、IAM-02、IAM-03、IAM-04、IAM-05、IAM-06 | JSDOC-12 |
| kit | 44 | 151 | 3 | 91 | KIT-01、KIT-02 | JSDOC-13 |
| payment | 18 | 50 | 8 | 47 | PAY-01、PAY-02、PAY-03、PAY-04、PAY-05、PAY-06 | JSDOC-14 |
| reach | 13 | 51 | 1 | 42 | REACH-01、REACH-02、REACH-03、REACH-04 | JSDOC-15 |
| reldb | 17 | 84 | 4 | 57 | RELDB-01、RELDB-02 | JSDOC-16 |
| scheduler | 14 | 71 | 38 | 67 | SCHED-01、SCHED-02 | JSDOC-17 |
| serv | 28 | 106 | 3 | 98 | SERV-01、SERV-02、SERV-03、SERV-04、SERV-05 | JSDOC-18 |
| storage | 14 | 49 | 5 | 38 | STORAGE-01、STORAGE-02、STORAGE-03 | JSDOC-19 |
| ui | 162 | 297 | 63 | 284 | UI-01、UI-02 | JSDOC-20 |
| vecdb | 10 | 35 | 3 | 26 | VECDB-01、VECDB-02、VECDB-03、VECDB-04、VECDB-05 | JSDOC-21 |

全量逐文件/逐声明补齐清单见 [JSDoc 修正任务附件](module-review-jsdoc-2026-10-22.md)。跨模块任务 LIFE-01、STYLE-01/02、DOC-01、DIST-01 同时适用于受影响包。

## 建议执行批次

1. 先处理授权与传输：SERV-01～04、CRYPTO-01/02、CORE-01、RELDB-01；客户端退出/凭据任务与 IAM 会话任务一并收敛。
2. 修正共享原语和数据正确性：CACHE-01～04 → IAM-01～06/KIT-01/SCHED-01；REACH-01～04、支付全链路、AI 状态与知识发布并行推进不共享修改面的工作。
3. 补齐其余 provider/生命周期/CLI/UI 行为；按包同步类型、调用方、配置、README/skills 和示例。
4. 在 API 形状稳定后统一命名/exports，执行 21 项 JSDoc 任务；最后跑跨包、生成应用及真实双节点验收。

## 修正任务

### CORE-01 · P1 · 补齐 URL 查询参数脱敏，并统一重复的脱敏实现

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：新增统一 sanitizeUrl，覆盖 userinfo、敏感 query、重复/编码参数、OAuth fragment 与非法地址；移除三个模块重复实现。core 类型检查/构建、cache/storage/scheduler 类型检查、定向 ESLint、check:skills 通过；sanitize 与 Node/browser logger 共 3 文件 29 测试通过。无凭据暴露/外部服务操作；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/core/src/utils/core-util-sanitize.ts:120](../packages/core/src/utils/core-util-sanitize.ts#L120)。
- **证据与影响**：URL 分支只处理 userinfo，带 token/apiKey 的 query 原样保留。探针中的占位值 NOT_A_SECRET 未被遮蔽；这会影响使用该工具处理的配置、日志与 audit 详情。
- **修正内容**：对 URL 的敏感 query 名称和重复参数逐项遮蔽；明确 fragment、编码、非法 URL 和结构化错误的策略。归并 cache/storage/scheduler 中重复实现到适用的公共能力，保留真实差异。
- **验收标准**：覆盖 userinfo、大小写/百分号编码的 query、重复参数、嵌套对象；快照不得出现测试秘密。普通 URL 保持可诊断，不把所有错误一律抹空。
- **同步范围**：core/cache/storage/scheduler README、日志示例、audit 脱敏说明及对应 skill。

### CORE-02 · P1 · 隔离服务端请求的 locale 状态

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：Node 入口安装 AsyncLocalStorage 并新增 runWithLocale，消息按显式locale/请求上下文/启动默认值解析；UI SSR store与setter不写默认语言，serv自动绑定请求语言，四个应用hooks及CLI生成模板/开发skill/三语文档同步。core14、UI54、kit29、serv并发HTTP定向、CLI创建32与模板目标测试通过；core/ui/kit/serv及四应用typecheck、core/ui/kit build、ESLint/check:skills通过。scaffold-gates已执行但其前置全包构建被并行CRYPTO01新增消息key的中间态阻塞，未使用旧产物替代；完整scaffold与多进程部署集成在剩余任务稳定后复验；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/core/src/i18n/core-i18n-utils.ts:23](../packages/core/src/i18n/core-i18n-utils.ts#L23)；[packages/ui/src/lib/i18n.svelte.ts:108](../packages/ui/src/lib/i18n.svelte.ts#L108)。
- **证据与影响**：core locale 是模块级变量；UI createLocaleStore 初始化时直接写全局 locale。并行 SSR 创建不同语言 store 会互相覆盖后续全局翻译。客户端单实例 store 本身不属于分布式缺陷。
- **修正内容**：服务端翻译传递请求级 locale 或使用已有请求上下文；浏览器保持应用级 locale。禁止 SSR 初始化修改跨请求默认值。
- **验收标准**：交错执行 zh-CN/en-US 两个 SSR 请求及异步恢复，页面和错误消息保持各自语言；多进程行为一致，无跨请求污染。
- **同步范围**：core/UI i18n API、SSR 接入文档、kit/serv 调用方和生成模板。

### CACHE-01 · P1 · 移除无 owner 的解锁/续租路径

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：acquire每次生成唯一凭据并返回string或null，release/extend无凭据或旧凭据均拒绝；Memory/Redis及IAM、reach、scheduler、fullstack模板和三语文档/skill全部同步。原目录cache类型检查/构建、3消费者类型检查通过；新worktree定向lint、11测试通过（含真实Redis独立客户端过期接管）。final scaffold和故障矩阵留最终阶段；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/cache/src/providers/cache-provider-redis.ts:618](../packages/cache/src/providers/cache-provider-redis.ts#L618)。
- **证据与影响**：默认 owner 固定为 default；release 不传 owner 直接 DEL，extend 不传 owner 直接 EXPIRE。A 的锁过期、B 获锁后，A 的迟到释放/续租能操作 B 的锁。
- **修正内容**：每次获锁产生唯一所有权凭据，释放和续租强制比较凭据；更新 memory provider 的相同 API 契约。删除不安全可选参数形式，不保留兼容通道。
- **验收标准**：真实 Redis 双客户端执行过期→重获→旧 owner 释放/续租，后两者均失败且新锁存续；所有调用点携带正确凭据。
- **同步范围**：LockOperations、IAM/reach/scheduler 等全部消费者、README 三语言、LLMS 和 cache skill 示例。

### CACHE-02 · P1 · 把鉴权配置传入 Redis Cluster

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：共享redisOptions传入password，URL凭据优先；修复Cluster自身lazyConnect位置导致显式connect竞争，统一error事件日志。源码/config/envcatalog/README三语/skill同步。cache typecheck、定向ESLint和真实密码Redis Cluster定向测试通过（发现节点写读、错误密码拒绝、URL密码优先）。首轮Podman exec超时及IPv6不可达已定位为fixture并改真实IPv4网络配置/完成清理；check:skills通过，完整env生成留PAY03配置稳定后复验；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/cache/src/providers/cache-provider-redis.ts:684](../packages/cache/src/providers/cache-provider-redis.ts#L684)；[packages/cache/src/providers/cache-provider-redis.ts:714](../packages/cache/src/providers/cache-provider-redis.ts#L714)。
- **证据与影响**：公共 redisOptions 未包含 password，cluster 分支仅转发该对象；单机/sentinel 分支另行配置 password。声明的密码配置在 Cluster 下失效。
- **修正内容**：按支持的部署模式统一构造鉴权/TLS 配置，明确 URL 与字段配置优先级；不在日志输出凭据。
- **验收标准**：带密码的真实 Redis Cluster 连接成功，错误密码明确失败；校验重定向后的节点连接仍带鉴权。
- **同步范围**：cache-config、HAI_CACHE_* 环境变量映射、CLI 配置生成、README/skills。

### CACHE-03 · P1 · 定义并实现 Cluster 下多键与扫描契约

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：Cluster 的 MGET/DEL/EXISTS 按独立键有界执行，原子多键操作同 slot 并结构化返回 CROSS_SLOT；SCAN 使用含拓扑/slot 所有权/条件指纹的可跨应用节点字符串游标遍历全部 master，正确转义 keyPrefix 并返回逻辑 key，keys 改为 SCAN 去重。类型、实际调用方、三语 README、skill 和 LLMS 已同步。真实三主 Redis Cluster 与 KV 定向 54 项、cache typecheck/build、ESLint、check:skills 通过；夹具同容器运行三个 Redis 进程，未把跨主机故障转移标为已验证；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/cache/src/providers/cache-provider-redis.ts:177](../packages/cache/src/providers/cache-provider-redis.ts#L177)；[packages/cache/src/providers/cache-provider-redis.ts:246](../packages/cache/src/providers/cache-provider-redis.ts#L246)。
- **证据与影响**：多键命令直接下发，未处理跨 slot；scan/keys 直接调用单个 Cluster 客户端，没有跨主节点游标管理。当前公开 API 未限制 key 同 slot，也没有提供完整集群扫描模型。
- **修正内容**：明确多键操作哪些可分 slot、哪些要求原子同 slot；返回结构化约束错误，不能静默降级。实现跨主节点扫描、逻辑 keyPrefix 输入输出规则，或收缩不支持的 API。
- **验收标准**：在多主节点 Cluster 分散写入 keys，验证全量扫描、去重/终止、批量读取/删除、hash tag、keyPrefix；迁槽故障边界有文档。
- **同步范围**：cache 类型/实现、IAM 等多键消费者、README 与分布式示例。

### CACHE-04 · P2 · 修正零值过期与条件写入结果语义

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：统一 memory/Redis SET 正安全整数期限与互斥组合校验，非法输入不写永久键，过去绝对时间立即过期；返回 boolean applied，条件未命中保留值/TTL，保存 JSON 快照。同步 IAM 票据、crypto 公钥登记及企业站登录（会话未落库不设 cookie）、三语 README/skill/LLMS；HEAD 探针复现旧缺陷，新 cache 86 项含真实 Redis/三主 Cluster、IAM 8、crypto 1、企业站 6 项及目标严格类型/相关包与应用类型、cache build/lint/skills 通过，见 tmp/module-repair-20261022/CACHE-04；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/cache/src/providers/cache-provider-redis.ts:157](../packages/cache/src/providers/cache-provider-redis.ts#L157)；[packages/cache/src/providers/cache-provider-redis.ts:154](../packages/cache/src/providers/cache-provider-redis.ts#L154)。
- **证据与影响**：ex/px/exat/pxat 使用 truthy 判断，0 被当作没有过期策略；NX/XX 返回值丢弃，调用方不能从成功结果判断是否写入。
- **修正内容**：显式校验过期参数及互斥组合，零值不能变永久 key；条件写入返回 applied 状态或提供专用原子操作。同步 memory/Redis 行为。
- **验收标准**：覆盖 0、负数、过去绝对时间、NX 竞争及 XX 不存在；TTL 和条件命中结果在两种 provider 一致。
- **同步范围**：SetOptions、KvOperations、全部 NX/XX 调用方及 TTL 文档。

### IAM-01 · P1 · 让 refresh token 轮换和单设备登录原子化

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：增加单键compareAndSwap（含TTL/删除/不存在区分）并以用户SHA256分区文档原子管理会话、refresh消费与索引；轮换提交同时校验旧凭据和Session.version，单设备发布在同一CAS替换全部旧会话，失败不先撤销旧会话。令牌仍含256位随机值且调用方按不透明Bearer使用；简化分离映射/补偿代码，类型/三语README/skill/LLMS同步。cache最终3文件62项（真实三主Cluster CAS/独立客户端/TTL）通过，IAM会话3文件47项（含真实Redis两个Node进程快照屏障）通过，最终受影响2文件5项复验通过；cache/iam typecheck及build、ESLint、check:skills通过。网络响应丢失的未知提交按失败关闭/重新登录，不声称透明恢复；滑动TTL与refresh独立寿命分别留IAM03/04；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/iam/src/session/iam-session-functions.ts:243](../packages/iam/src/session/iam-session-functions.ts#L243)；[packages/iam/src/session/iam-session-functions.ts:131](../packages/iam/src/session/iam-session-functions.ts#L131)。
- **证据与影响**：refresh 先读取、再删旧 token、再保存新会话；同一个 refresh token 并发请求均能通过。探针产生两套不同的新 access token。singleDevice 也采用先删后建，存在同类竞争窗口。
- **修正内容**：用共享存储 CAS/脚本或事务完成消费、撤销与发布；按用户/会话维度原子更新索引。明确失败恢复与重放策略。
- **验收标准**：真实 Redis 上两个独立进程并发刷新同 token，只产生一个有效会话后继；并发单设备登录最终只有一个有效设备，失败注入不遗留可用孤儿 token。
- **同步范围**：session API、refresh Cookie/native 流程、serv/kit/api-client 及登录文档。

### IAM-02 · P1 · 防止退出后迟到更新复活会话

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：会话内容更新强制携带读取版本，条件提交拒绝旧版本；仅滑动时间戳不改变内容版本，正常并发读取可重试。批量权限更新绑定首次token/版本集合，不能把旧操作应用到后续登录或覆盖较新内容。同步profile调用方并传播同步失败、fullstack测试/README/skill/LLMS，补同模板锁结果success收窄。定向10项与真实SQLite/PG+Redis会话/双进程3文件49项通过，IAM/admin typecheck、IAM build、ESLint/check:skills通过；早期REACH03接口中间态类型失败已在其稳定后复验通过。完整scaffold此前5过3失败，已修已知API import/锁收窄，待后续协议任务稳定后复验失败场景；未声称跨系统业务事务保证；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/iam/src/session/iam-session-repository-cache.ts:226](../packages/iam/src/session/iam-session-repository-cache.ts#L226)；[packages/iam/src/session/iam-session-repository-cache.ts:419](../packages/iam/src/session/iam-session-repository-cache.ts#L419)。
- **证据与影响**：更新/批量补丁读取会话后无条件 SET。探针暂停读取结果，先退出删除，再恢复更新，已删除会话重新出现；并发更新也可能互相覆盖。
- **修正内容**：引入会话版本/撤销代际并条件写入；会话更新、TTL 与用户索引一并协调。注销结果不能被旧操作反转。
- **验收标准**：覆盖 logout、logoutAll、权限变更、滑动续期与刷新交错；被撤销 token 永远不能因旧写入恢复有效。
- **同步范围**：IAM 会话仓库接口、权限变更消费者、相关注释和双节点回归。

### IAM-03 · P1 · 修复滑动过期和自定义 TTL 的返回值

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：每会话固化maxAge并统一签发/刷新expiresIn；按最新快照单调滑动并返回已提交时间，完整应用日期补丁及验证非法时长/日期，显式更新产生新内容版本。同步类型/配置注释、三语README、仓库与模板skill/LLMS及客户端刷新说明。首轮20项及最终3文件53项通过（真实Redis TTL、双Node刷新竞争、迟到续期）；IAM typecheck/build、ESLint/check:skills通过。refresh独立寿命留IAM04；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/iam/src/session/iam-session-utils.ts:77](../packages/iam/src/session/iam-session-utils.ts#L77)；[packages/iam/src/session/iam-session-functions.ts:142](../packages/iam/src/session/iam-session-functions.ts#L142)。
- **证据与影响**：validate 传入 expiresAt 补丁，但 applySessionPatch 未应用该字段，滑动续期不延长有效期；create 的 expiresIn 取默认 maxAge，和 options.maxAge 不一致。
- **修正内容**：统一时间源、绝对过期时间、存储 TTL 和返回 expiresIn；补丁字段显式完整实现，和 IAM-02 的原子条件更新合并。
- **验收标准**：受控时钟测试跨越旧过期点仍有效、跨越新过期点失效；自定义 maxAge 与返回值及 Redis TTL 一致。
- **同步范围**：session-config、session 类型、README 的 sliding/maxAge 说明及客户端刷新时机。

### IAM-04 · P1 · 使 refresh 生命周期独立于 access key TTL

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：用户分区按access/refresh最大期限保留，认证仍独立检查access绝对到期；refresh查询不依赖access存活，轮换/单设备替换/各撤销入口保持同一CAS，refresh寿命从新会话签发起算。删除过期读取的冗余撤销分支，同步配置/类型、三语README、双侧skills、serv刷新契约注释和LLMS。4文件26项通过，含真实Redis access过期后重连刷新、竞争唯一后继及撤销、受控时钟refresh到期与长access；IAM typecheck/build、ESLint/check:skills通过。serv/kit消费者已核对无access前置验证；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/iam/src/session/iam-session-repository-cache.ts:350](../packages/iam/src/session/iam-session-repository-cache.ts#L350)；[packages/iam/src/session/iam-session-repository-cache.ts:195](../packages/iam/src/session/iam-session-repository-cache.ts#L195)。
- **证据与影响**：refresh 映射使用较长 TTL，但 getByRefreshToken 最终依赖短 TTL 的 access 会话记录。access key 过期后，即使 refresh 映射仍有效也不能刷新。
- **修正内容**：持久会话/refresh 记录按 refresh 生命周期保存，独立判断 access 是否有效；撤销与轮换保持原子，不能简单把 access 认证有效期一起延长。
- **验收标准**：access 过期而 refresh 未过期时刷新成功，旧 access 仍不可认证；refresh 过期/撤销后失败。
- **同步范围**：IAM 会话结构、配置默认值解释、serv/kit 刷新流程与认证 skills。

### IAM-05 · P1 · 区分缓存故障与过期会话，避免破坏用户 token 索引

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：用户单文档结构已消除逐token get/ttl及独立索引清理，读取或CAS基础设施失败原样失败关闭并保留整份分区；补强损坏文档验证（数组/空revision/不安全期限拒绝），未知授权状态不被空文档覆盖。同步三语仓库恢复说明及双侧skill，恢复后重新读取重试。3文件13项通过，真实Redis分别注入get及提交失败证明原值不变、双凭据仍纳入logoutAll、refresh全部撤销；损坏数据与读取故障不伪装不存在。IAM typecheck、ESLint/check:skills通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/iam/src/session/iam-session-repository-cache.ts:414](../packages/iam/src/session/iam-session-repository-cache.ts#L414)。
- **证据与影响**：patchUserSessions 将 get/ttl 的失败结果也归为 staleTokens，随后从用户 token 集合删除。临时故障会导致仍有效会话失去索引，后续权限同步/批量退出不完整。
- **修正内容**：只删除已确认不存在/过期的记录；基础设施失败向上返回，保留索引，并设计可恢复的索引校验。
- **验收标准**：对 get、ttl 注入 HaiResult 失败，操作必须失败且有效 token 仍在索引；恢复后 logoutAll 能撤销全部会话。
- **同步范围**：仓库错误契约、权限同步注释、失败处理示例。

### IAM-06 · P1 · 约束租约丢失后的业务提交

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：OTP单身份key CAS发布/消费；密码重置授权与最终改密同用户行SQL提交，resetVersion和credentialVersion分离；所有策略/会话/刷新绑定并核对持久凭据代，cache清理失败不能放行旧token。通知稳定幂等context、三语文档/双skill/应用及模板调用说明同步。真实45秒暂停双Node+Redis/SQLite、PG+Redis用户安全130项、会话71项、新凭据绑定4项、会话双Node1项通过；IAM typecheck/build/lint、kit/serv/api-client typecheck、skills/env通过，未实测MySQL及外部通知投递；全量回归按用户要求在全部任务实施后执行。
- **位置**：原 iam-security.ts 锁辅助层已移除，最终凭据提交见 [IAM 用户仓储](../packages/iam/src/user/iam-user-repository-user.ts)。
- **证据与影响**：安全操作的锁辅助函数会标记租约失效，但运行中的 operation 不会因此自动停止。最终返回失败不能证明旧节点没有写入；需要覆盖 GC 暂停、续租失败后的过期 owner。
- **修正内容**：对受保护的最终写入应用 fencing/CAS 或事务条件；外部副作用使用幂等键。仅取消 Promise/设置布尔值不足以保证互斥。
- **验收标准**：两个进程进行租约超时接管，恢复旧进程后其持久化提交被拒绝；记录各安全操作对外部副作用的实际保证。
- **同步范围**：IAM 安全注释、cache lock 契约及安全相关消费者。

### CRYPTO-01 · P1 · 共享服务端传输密钥，支持轮换与跨节点解密

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：服务端强制显式版本化serverKeyRing及keyStore，删除隐式进程密钥/内存回退与失效maxClients配置；握手和请求携带serverKeyId，校验密钥配对并复制不可变快照，未知版本拒绝。两真实manager与SQLite共享registry验证跨节点解密、数据库重启、分阶段轮换/撤销；registry读取失败结构化返回。serv/kit/api-client、应用、CLI私密开发密钥生成/配置/模板、三语文档/skill/env同步。定向139项、相关typecheck/build/渲染lint/skills/env589通过；scaffold为5过3失败，API import已修，锁结果收窄由IAM02同模板修复后复验；未执行真实SecretManager部署、根全量或真实跨进程传输；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/crypto/src/transport/crypto-transport-server.ts:45](../packages/crypto/src/transport/crypto-transport-server.ts#L45)；[packages/serv/src/serv-transport.ts:48](../packages/serv/src/serv-transport.ts#L48)。
- **证据与影响**：每个 manager 启动时生成不同服务端密钥；共享 keyStore 只保存客户端公钥。A 协商后的请求交给 B 仍不能解密，重启同样失效，和共享 keyStore 足够支持多节点的说明不符。
- **修正内容**：注入受管服务端密钥/版本化 key ring，协议携带 key id；共享客户端 registry，定义轮换、撤销与密钥保管，不把私钥写普通日志或公开配置。
- **验收标准**：两个真实 manager 共用 registry：A 协商、B 解密、A 重启、密钥轮换期间均按约定工作；无 sticky session 依赖。
- **同步范围**：crypto/serv/kit/api-client 协议、README、配置模板和 transport skills。

### CRYPTO-02 · P1 · 给传输密文增加完整性与请求绑定

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：仅支持v2：独立随机SM4/HMAC-SM3密钥、SM2发送方签名，先验签/MAC再CBC；认证版本/方向/服务端keyId/clientId/requestId/时间/method/实际路径摘要/响应status。5分钟时效+30秒未来偏差，共享registry原子消费nonce并保留6分钟，失败关闭；GET/HEAD、空请求/响应均认证，删除降级开关和旧格式。路径改64hex SM3摘要以绑定完整pathname+原始search而不重复放大HTTP头，实际URL8KiB上限；正文2129920字节、头16KiB与Nginx/CORS/模板/三语协议文档/skills/环境同步。250项定向及最后client错误脱敏复验通过，含真实算法篡改、双Node+SQLite防重放重启、实际serv.listen默认头限制下极限URL/1MiB非ASCII正文/GET/HEAD；六包typecheck、admin0错误警告、相关build/lint、skills和594项env通过。Redis需noeviction与可靠持久化且节点时钟同步，握手真实性依赖TLS；未验证Redis切换/PG/MySQL/Nginx部署和完整scaffold；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/crypto/src/transport/crypto-transport-server.ts:86](../packages/crypto/src/transport/crypto-transport-server.ts#L86)；[packages/crypto/src/crypto-sm4.ts:227](../packages/crypto/src/crypto-sm4.ts#L227)。
- **证据与影响**：传输 payload 只有 encryptedKey/ciphertext/iv，CBC 解密未验证 MAC/tag。使用真实 SM4 实现的本地探针仅改变 IV，就把合法 JSON 的 amount 从 10000 改为 90000 并成功解密；该证据不是 TLS 攻破证明。
- **修正内容**：采用受支持的认证加密或严格先验 MAC 的方案，认证版本、key id、client/request 上下文；明确重放窗口与跨节点去重。删除旧未认证传输格式，不保留兼容旁路。
- **验收标准**：任意修改 IV/密文/密钥封装/上下文字段均在业务处理前拒绝；重放和跨路径复制按协议拒绝；正常多节点往返通过。
- **同步范围**：EncryptedPayload、服务端/浏览器/移动端实现、API 适配器、协议文档与示例。

### CRYPTO-03 · P2 · 移除弱密码派生接口和无效兼容分支

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：删除单次 SM3 的 deriveKey 实现、公开类型及 4 个旧用例，全局核对无调用；同步三语 README、crypto skill 与 LLMS。crypto typecheck/lint/build、SM4 19 项测试、check:skills 与 diff-check 通过，证据见 tmp/module-repair-20261022/CRYPTO-03；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/crypto/src/crypto-sm4.ts:250](../packages/crypto/src/crypto-sm4.ts#L250)。
- **证据与影响**：deriveKey 对 password+salt 做单次 SM3，代码已标 deprecated，仍作为公开能力提供。不考虑兼容性时不应继续保留容易误用的密码派生接口。
- **修正内容**：全局核对使用者后删除该接口；有真实密钥派生需求时采用明确参数的标准 KDF，密码存储仍走现有 password API。
- **验收标准**：所有调用、类型和示例无旧接口；如提供替代 KDF，以已知测试向量和参数上下限验证。
- **同步范围**：crypto-types、README 安全说明、LLMS、crypto 使用示例。

### CRYPTO-04 · P2 · 修复公钥 DB 存储的失败恢复与过期清理

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：公钥统一校验SM2编码/曲线点并修无前缀04歧义，serv/kit握手先拒绝畸形输入；DB初始化失败复位、DB epoch时钟、共享容量行事务串行化注册/有界维护，每批公钥/nonce各100且不驱逐有效nonce；工厂TTL/容量校验，实际应用和模板使用3600秒TTL，同步协议/三语README/skills/LLMS/分布式表。crypto111/serv41/kit70/CLI模板1及最终45项（含真实SQLite/PG/MySQL双Node空库同时初始化、12并发容量、251+251过期清理、有效nonce与重启）、相关类型/构建/lint/admin零警告/skills通过；MySQL首轮清理锁冲突已修并三轮复验，见tmp/module-repair-20261022/CRYPTO-04；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/crypto/src/transport/store-provider/crypto-transport-store-reldb.ts:59](../packages/crypto/src/transport/store-provider/crypto-transport-store-reldb.ts#L59)。
- **证据与影响**：ensureTablePromise 缓存首次初始化结果，首次拒绝后无重试复位；过期记录主要在 get 时删除，长期不再访问的 handshake 记录不能靠该路径清理。
- **修正内容**：失败复位并发初始化 promise；提供有界、可跨节点协调的过期清理与容量策略，校验公钥格式/大小后才注册。
- **验收标准**：首次建表失败后恢复 DB 可重新注册；大量过期记录最终清理，双节点清理不删除有效记录，畸形公钥被拒绝。
- **同步范围**：TransportKeyStore 契约、maxClients/TTL 配置说明、serv 握手限制。

### KIT-01 · P1 · 把生产限流改为共享原子操作

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：限流强制显式原子store，删除get+set回退和隐式内存默认；共享Redis单键CAS计数且保留首次TTL，仅键实际到期可新建窗口，节点时钟差不提前清零。开发/显式E2E可选内存，生产失败关闭503；规范化IPv6/映射IPv4且不采信原始代理头。同步Handle参数/公开工厂、4应用与AI示例共享cache初始化/依赖、CLI有cache及无cache分支、三语README/skills/LLMS/环境示例。4文件29项最终通过，含真实两个HTTP Node+Redis 40次总放行5次（节点时钟差2小时）、窗口TTL/故障/代理/测试例外；4应用typecheck0错误警告，kit typecheck/build、75模板定向及2个实际hooks生成lint、ESLint/skills通过；offline首次缺跨平台metadata后online frozen及再次offline frozen安装通过，未变依赖版本。内存清理进一步简化留KIT02；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/kit/src/middleware/kit-ratelimit.ts:188](../packages/kit/src/middleware/kit-ratelimit.ts#L188)；[packages/kit/src/middleware/kit-ratelimit.ts:176](../packages/kit/src/middleware/kit-ratelimit.ts#L176)。
- **证据与影响**：默认 store 为进程内存，支持异步 get/set 的共享 store 在无 increment 时仍走读改写。探针在 maxRequests=1 下并发 10 次全部通过，最终计数为 1。
- **修正内容**：生产多实例必须选择原子共享计数器，移除不安全 get+set 回退；保留显式开发/测试 memory 模式。明确当前固定窗口与文档所称滑动窗口的区别并统一实现/说明。
- **验收标准**：两个进程并发命中相同 key，总放行不超过阈值；覆盖窗口边界、TTL、失败策略及 IPv6/代理配置，不把单进程 mock 当成分布式验收。
- **同步范围**：RateLimitStore、kit README、SvelteKit 模板及服务部署说明。

### KIT-02 · P2 · 释放默认限流 store 的定时器

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：删除内部定时器及无调用的 startCleanup/stopCleanup/get/set/delete 辅助接口，改为每请求最多扫描 64 项的持续游标惰性清理、10000 窗口容量；满容量对新 key 返回503且不驱逐有效计数，返回快照，外部 store 不被关闭。同步三语 README/kit skill/LLMS；旧 HEAD 探针证实100实例100定时器，新重复创建/容量/边界/所有权及真实双HTTP进程Redis共9项、source/严格测试类型、lint、fresh build、skills通过，见 tmp/module-repair-20261022/KIT-02；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/kit/src/middleware/kit-ratelimit.ts:100](../packages/kit/src/middleware/kit-ratelimit.ts#L100)。
- **证据与影响**：MemoryRateLimitStore 提供 stopCleanup，但 middleware 内部创建 store 后不向调用者暴露释放链路。热重载/重复创建会积累清理定时器。
- **修正内容**：让创建者可在应用生命周期释放内部资源，或改为无需常驻定时器的有界惰性清理；对外部注入 store 明确所有权。
- **验收标准**：重复创建/销毁后没有活跃计时器与 store 泄漏；外部 store 不被错误关闭。
- **同步范围**：kit 中间件组合/关闭示例及测试 teardown。

### SERV-01 · P1 · 默认存储 procedures 增加资源授权

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：必需authorize策略覆盖下载/上传签名、列表、元数据、单删和批删，缺失策略默认拒绝，批量先完整授权。同步演示API和模板用户命名空间策略、三语README、contract注释和skill。18项授权回归、serv typecheck/build、api-service typecheck、定向ESLint和check:skills通过；全量scaffold及真实S3授权联调待最终验收；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/serv/src/features/serv-feature-storage.ts:84](../packages/serv/src/features/serv-feature-storage.ts#L84)。
- **证据与影响**：默认实现仅要求登录，使用输入 key/prefix 进行读取、列举、上传签名和删除，没有用户/租户资源范围检查；文件头已承认这一边界，而现有应用/模板直接接入。
- **修正内容**：把服务端资源授权作为必需依赖或默认拒绝；按可信身份确定可访问范围，对所有单项/批量/签名操作一致执行。不能以客户端提供的前缀当授权依据。
- **验收标准**：用户 A 猜中 B 的 key 仍不能查看、下载、覆盖、删除或列举；批量混入一个未授权 key 也遵循明确失败策略，管理员路径单独验证。
- **同步范围**：api-contract、apps/api-service、CLI API/fullstack 模板、storage skills 与安全示例。

### SERV-02 · P1 · 默认 AI procedures 绑定用户和会话所有权

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：全部AI默认读写绑定可信session.userId，跨主体仅显式authorizeObject放行；历史复合scope、写入scope和memory最后覆盖可信objectId。schema/应用/模板/三语文档/两类skill同步。10授权回归、相关typecheck/build、api-service typecheck、定向ESLint、check:skills通过；新worktree缺dist阻塞已用定向依赖构建消除；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/serv/src/features/serv-feature-ai.ts:50](../packages/serv/src/features/serv-feature-ai.ts#L50)；[packages/serv/src/features/serv-feature-ai.ts:59](../packages/serv/src/features/serv-feature-ai.ts#L59)。
- **证据与影响**：历史、记忆、会话列表直接透传客户端 objectId/sessionId/options，仅检查已登录。默认接入方没有资源所有者的必需校验。
- **修正内容**：从 ServContext 绑定可信用户/租户，验证 session/object 归属；为跨用户管理提供独立授权路径，拒绝输入覆盖可信 scope。
- **验收标准**：两个用户的历史、记忆召回、列表及写入上下文全部隔离；伪造 objectId/sessionId 无法越权。
- **同步范围**：AI scope 类型、api-contract、应用/模板 procedures、AI/IAM 使用文档。

### SERV-03 · P1 · 禁止缺失 Content-Type 绕过传输解密

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：serv/kit以实际流内容判断空正文，缺头/伪造Content-Length=0及非标准方法不能绕过加密；响应同样不信任伪CL0。保留真实空流POST。同步三语文档/skills。先复现7处旁路，后serv14+kit22测试、两包typecheck/build、定向ESLint、check:skills通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/serv/src/serv-transport.ts:249](../packages/serv/src/serv-transport.ts#L249)。
- **证据与影响**：req.body 非空且缺 Content-Length/Content-Type 时被判断为空，跳过 encrypted 标记和解密验证。探针发送 Uint8Array JSON 正文，业务 next 已被调用。下游是否接受该正文取决于具体路由。
- **修正内容**：根据实际 body 流与协议判断空请求，带正文但不满足加密格式时拒绝；不能信任可省略的头推断没有正文。
- **验收标准**：覆盖无两个头、chunked、伪造 Content-Length、空流、合法无 input POST；未加密正文不会到达受保护业务 handler。
- **同步范围**：serv/kit 同协议实现、api-client、transport 注释与安全回归。

### SERV-04 · P1 · 在读取前限制传输请求和响应大小

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：抽取真实流有界读取，serv/kit/client 统一 UTF-8 字节限额（握手16KiB、公钥4KiB、明文1MiB、密文2MiB+4KiB），超限/取消释放流且清理异常不覆盖原因；保留 signal、重建缓存、移除过期长度与编码头。客户端握手30秒超时，独立调用取消不影响共享等待者；deploy API反代同步2101248字节和禁用请求缓冲。三语README/skill/LLMS/调用方同步，crypto26+serv23+kit31+deploy23定向103项、四包typecheck/build、ESLint和check:skills通过；未执行真实Nginx部署/浏览器网络或全量测试；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/serv/src/serv-transport.ts:161](../packages/serv/src/serv-transport.ts#L161)；[packages/serv/src/serv-transport.ts:119](../packages/serv/src/serv-transport.ts#L119)。
- **证据与影响**：握手/request.json 与密文 clone.json 没有流式大小限制；响应先完整读取再检查 string.length，既不能限制峰值内存，也不是 UTF-8 字节上限。
- **修正内容**：在解码/解密前按字节有界读取，限制握手、公钥、密文和响应；传播取消并释放 reader。统一边界配置，确认 app 与 adapter 的顺序。
- **验收标准**：无 Content-Length 的超限流提前终止；多字节字符按实际字节判定；正常边界值通过，受保护响应不会因异常明文透传。
- **同步范围**：serv/kit 的请求体配置、错误码、反向代理部署文档及客户端处理。

### SERV-05 · P2 · 实现或收缩被静默丢弃的 AI 请求字段

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：默认补全明确为非流式 JSON 并严格拒绝 stream，完整透传嵌套 JSON Schema/strict/全部 tool_choice/角色消息/name/图片/工具调用结果；同步三包三语 README、AI 与 HTTP skills、LLMS。55 项测试、三包 source/目标 test 类型与新 ESM/DTS 构建、两个应用类型、scoped lint 和 skills 通过；含 typed api-client→真实 Node serv HTTP→实际 OpenAI SDK→受控 HTTP provider 两轮工具往返，未调用付费模型；证据 tmp/serv05-files.json；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/serv/src/features/serv-feature-ai.ts:79](../packages/serv/src/features/serv-feature-ai.ts#L79)；[packages/api-contract/src/ai/ai-schemas.ts:86](../packages/api-contract/src/ai/ai-schemas.ts#L86)。
- **证据与影响**：api-contract 接受 tools/tool_choice/stream，toChatCompletionRequest 未映射这些字段；请求看似成功却不按声明行为执行。
- **修正内容**：使用一致的请求 schema 与适配器；工具调用完整传递，流式输出采用真实流协议；暂不支持的字段明确拒绝并从公开契约移除。
- **验收标准**：客户端工具调用传到 provider 并返回工具结果；stream 选择有对应输出类型；不支持组合在边界失败。
- **同步范围**：api-contract/api-client/serv、UI AI 调用方、README/LLMS 与 AI skills。

### PAY-01 · P1 · 修正 Stripe 回调支付状态与事件类型

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：Stripe通知严格按Checkout事件解析，unpaid completed为pending，异步成功/失败/过期正确映射，付费时间取稳定事件时间；公开eventId/currency并同步审计、三语文档和模板。新通知18/18、相关3文件70/70、payment typecheck和定向ESLint通过。真实Stripe交易未执行；宿主订单核验/持久幂等职责已明确；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/payment/src/providers/stripe/stripe-provider.ts:152](../packages/payment/src/providers/stripe/stripe-provider.ts#L152)。
- **证据与影响**：已签名的 checkout.session.completed 即使 payment_status=unpaid 仍映射 paid；不同事件对象共用 amount_total/metadata，可能得到空订单号/0 金额。探针已复现 unpaid→paid。
- **修正内容**：按事件 discriminated schema 解析并核验支付状态；处理异步成功/失败，拒绝或忽略无关事件；仅在实际支付成功时设置 paidAt。回调重复/乱序不应倒退订单状态。
- **验收标准**：unpaid completed 不触发履约，异步成功才转 paid；错误金额/币种/订单归属被业务核验拒绝；多节点重复回调仅履约一次。
- **同步范围**：PaymentNotifyResult、上层履约示例、serv 接口和支付 skill。依据：[Stripe Session 状态](https://docs.stripe.com/api/checkout/sessions/list)。

### PAY-02 · P1 · 持久化 Stripe 订单映射并保证创建/退款幂等

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：新增共享reldb渠道操作仓库，唯一预留/摘要/CAS结果发布、稳定Stripe幂等键、可信Session映射、账户test-live隔离与23h未知结果重试窗口；Stripe初始化先等DB。源码/配置/依赖lockfile/三语文档/skills/调用说明同步。payment typecheck/build/lint、127定向测试、26CLI配置用例、两个Node进程共享SQLite幂等回归、check:skills通过；Stripe HTTP为替身，真实交易与PG/MySQL集成未验；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/payment/src/providers/stripe/stripe-provider.ts:184](../packages/payment/src/providers/stripe/stripe-provider.ts#L184)；[packages/payment/src/providers/stripe/stripe-provider.ts:217](../packages/payment/src/providers/stripe/stripe-provider.ts#L217)。
- **证据与影响**：query/refund 使用 Checkout Sessions list 的 metadata 参数筛选，但该 API 未声明该筛选；limit=1 也没有核对返回订单。创建/退款未发送幂等键，metadata 又允许覆盖保留的 orderNo。
- **修正内容**：保存 orderNo→session/payment_intent 的可信映射，禁止覆盖保留字段；重试使用稳定创建/退款幂等键并记录执行结果，不能用列举首项猜订单。
- **验收标准**：两个不同订单查询/退款各自正确；并发同 refundNo 和响应丢失重试只退款一次；映射在进程重启/双节点间一致。
- **同步范围**：支付仓储/注入契约、类型、订单/退款文档。依据：[Stripe List 参数](https://docs.stripe.com/api/checkout/sessions/list)。

### PAY-03 · P1 · 实现 Stripe 主动关单并补齐 Checkout 创建参数

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：Stripe 收缩为 payment/hosted_page/h5，固定 API 版本并配置可信 successUrl/cancelUrl；实现 expire 关单和并发/响应丢失后的再确认，契约、客户端、三语 README、skill、CLI 与环境变量已同步。payment/api-contract typecheck 与 build、定向 payment 119 项/contract 19 项/CLI 26 项及最终受影响 47 项、ESLint、check:skills、check:env 通过；真实 SQLite/子进程覆盖通过，Stripe HTTP 为替身，未执行真实交易；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/payment/src/providers/stripe/stripe-provider.ts:256](../packages/payment/src/providers/stripe/stripe-provider.ts#L256)；[packages/payment/src/providers/stripe/stripe-provider.ts:84](../packages/payment/src/providers/stripe/stripe-provider.ts#L84)。
- **证据与影响**：closeOrder 无网络操作直接 ok；创建 Session 未提供跳转 URL 等 Checkout 模式相关参数，现有统一输入也未表达完整配置。
- **修正内容**：按 session id 调用 expire 并映射不可关闭状态；明确支持的 Checkout UI 模式，增加其必需配置并做输入校验。
- **验收标准**：Stripe 测试环境创建可完成的支付页面，主动关单后不能继续支付；已完成订单不能伪装关闭成功。
- **同步范围**：payment-config/types、CLI 环境变量映射、三语言文档。依据：[Stripe Expire API](https://docs.stripe.com/api/checkout/sessions/expire)。

### PAY-04 · P1 · 处理支付宝业务错误而非仅检查 HTTP 状态

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：支付宝创建/查询/退款/关单统一验证对应 envelope、字符串业务成功码10000、必需字段及订单号，HTTP200错误/畸形响应不能转成功，错误原因仅保留有界安全标识；拒绝未知支付状态/非法金额并按北京时间解析支付时间，fund_change=N或缺失保持processing。类型、三语README、skill/LLMS同步。UTC环境下3文件157项、payment typecheck/build、正常ESLint/check:skills通过；未执行真实支付宝调用；通常忽略的skill强制lint发现44项既有格式问题留规范任务处理；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/payment/src/providers/alipay/alipay-provider.ts:83](../packages/payment/src/providers/alipay/alipay-provider.ts#L83)；[packages/payment/src/providers/alipay/alipay-provider.ts:248](../packages/payment/src/providers/alipay/alipay-provider.ts#L248)。
- **证据与影响**：alipayRequest 只检查 HTTP；create/refund/close 未验证响应 code。探针返回 code=40004，createOrder 仍 success:true 并把错误对象当 clientParams。
- **修正内容**：校验每种响应 envelope、业务成功码和字段，再映射统一结果；查询不存在、余额/权限错误、退款失败均准确返回。
- **验收标准**：HTTP 200 的失败/畸形/缺失 envelope 在各操作均不能成功；成功响应使用真实格式 fixture，敏感原文不直接泄漏。
- **同步范围**：支付宝 provider/types、错误码、退款/关单示例与测试。

### PAY-05 · P1 · 核验回调商户身份并定义重放及幂等边界

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：微信按serial精确选择受信证书/公钥并验证有效期、300秒签名时钟及appid/mchid，支付宝核对app_id/seller_id/算法与严格日历，请求用北京时间和POST form body，Stripe核对严格时间/test-live/账户与多v1签名。三渠道eventId/currency必填，新增业务事务/去重/outbox示例；真实双Node进程共享SQLite完成验签与一次outbox、重启去重、乱序保护和失败回滚。payment/示例typecheck/build、11文件341项和补充35项、CLI配置31项、lint/skills/env589通过；scaffold22包前置build通过而8场景5过3失败，非支付API import与锁结果收窄已交对应任务集中修正。未执行真实渠道交易、PG/MySQL示例集成或根全量测试，不宣称外部exactly-once；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/payment/src/providers/alipay/alipay-provider.ts:145](../packages/payment/src/providers/alipay/alipay-provider.ts#L145)；[packages/payment/src/providers/wechat/wechat-pay-provider.ts:196](../packages/payment/src/providers/wechat/wechat-pay-provider.ts#L196)。
- **证据与影响**：当前验签/解密后未显式核对支付宝 app_id、微信 appid/mchid 与配置；微信回调头时间/证书 serial 的处理也未形成完整校验链。验签成功不能替代订单商户、金额、币种及重放核验。
- **修正内容**：按各平台协议校验身份与证书/公钥选择，严格解析时间；将 event/transaction id 提供给持久去重及业务订单核验，明确 provider 与业务履约各自职责。
- **验收标准**：有效签名但错误商户/应用的样本拒绝；过期/畸形通知和证书轮换有测试；同一通知跨两节点重复到达只产生一次业务副作用。
- **同步范围**：三个 provider、PaymentNotifyResult、通知接入 skill 和演示消费者。

### PAY-06 · P2 · 按平台实现 tradeType，删除表面支持的分支

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：内置渠道收敛为微信JSAPI、支付宝H5/WAP和StripeH5；微信强制openid/CNY并校验prepay_id再签完整桥参数，支付宝按官方SDK离线签名11字段并由浏览器POST固定网关、引入可信HTTPS returnUrl，移除未实现模式/伪预付ID/无效错误码。同步client安全检查、HTTP/CLI生成调用方、API契约、env、三语README/skill/LLMS。307支付与真实模板测试、31契约测试、6配置回归通过；Chrome真实表单提交拦截验证11字段和独立RSA校验，双Node通知消费者通过；严格类型、fresh payment/contract/CLI build、定向lint、skills/API/env门禁通过。未使用商户凭据、支付沙箱或手机，不声称真实渠道付款成功；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/payment/src/providers/wechat/wechat-pay-provider.ts:145](../packages/payment/src/providers/wechat/wechat-pay-provider.ts#L145)；[packages/payment/src/providers/alipay/alipay-provider.ts:108](../packages/payment/src/providers/alipay/alipay-provider.ts#L108)。
- **证据与影响**：微信 app 分支没有构造调起参数、h5 请求没有表达 scene_info；支付宝把 app/wap 等模式都送入相同 JSON 请求解析，且 JSAPI input.userId 未进入 buyer 参数。公开枚举超过实际完整实现。
- **修正内容**：逐平台列出支持矩阵并实现模式专属请求/响应；未实现模式明确 UNSUPPORTED，而不是回落到另一种模式或空 clientParams。
- **验收标准**：每个保留模式用官方测试环境/SDK 形状验证到客户端可调起；不支持组合在调用网络前拒绝。
- **同步范围**：CreateOrderInput、各平台配置、客户端支付入口、README/LLMS。

### REACH-01 · P1 · 延迟发送只有可靠入队后才返回成功

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：delay 启动要求数据库与队列表真正就绪，发送仅在确认插入一行后返回 deferred 与同批持久化的 UUID queueId；无DB、断连、返回错误、抛错或零行均失败。即时已发送后的可选日志故障不触发重发，删除冗余 DND_DEFERRED；三语README/配置/环境说明/skill/IAM接入同步。6定向文件79项、reach typecheck/lint/build、check:skills通过；真实A进程入队退出，B进程共享SQLite接管并向本地HTTP完成投递且queueId可查询sent，PG/MySQL及后续租约故障留对应任务验证；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/reach/src/reach-send.ts:127](../packages/reach/src/reach-send.ts#L127)；[packages/reach/src/reach-send.ts:460](../packages/reach/src/reach-send.ts#L460)。
- **证据与影响**：saveSendRecord 在无 repo 时直接返回，对 repo.create 的失败结果不传播；DND 延迟分支仍返回 deferred。数据库失败或未启用存储时消息可能没有保存却宣称已排队。
- **修正内容**：把队列持久化作为延迟发送的必需前置，检查 HaiResult 并向上返回失败；不可靠日志不能承担可靠消息队列语义。
- **验收标准**：未初始化/断连/插入失败时不能返回 deferred；成功入队后重启另一节点能发送，消费状态可追踪。
- **同步范围**：reach-main 初始化依赖、返回类型、DND 配置、README 与 reach skill。

### REACH-02 · P1 · 修正毫秒时间列的数据库类型

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：三个epoch毫秒列统一BIGINT，Reach的findById/getById/findAll/findPage统一将driver number/string/bigint归一化为安全number（含PG主键），非法或超安全范围明确失败；模板TIMESTAMP类型改Date。同步Reach/reldb三语说明、仓库规范和skill，reldb仅说明变化。真实SQLite/PG16.15/MySQL8.4.11新增18项及5文件68项、reach typecheck/lint/build、check:skills通过，容器已清理；testcontainers仅新增Reach devDependency和lock importer；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/reach/src/repositories/reach-repository-send-log.ts:204](../packages/reach/src/repositories/reach-repository-send-log.ts#L204)；[packages/reach/src/repositories/reach-repository-send-log.ts:220](../packages/reach/src/repositories/reach-repository-send-log.ts#L220)。
- **证据与影响**：lockedUntil/updatedAt 使用 INTEGER 存储 Date.now() 毫秒值；PostgreSQL 的 INTEGER 为 32 位，当前时间远超范围。SQLite 的宽整数测试不能验证 PostgreSQL/MySQL 行为。
- **修正内容**：统一使用可容纳毫秒的 BIGINT 或 timestamp，并明确 driver 返回字符串/数字转换；检查其它模块的 epoch 毫秒字段。
- **验收标准**：真实 PostgreSQL/MySQL 完成建表、写入、claim/过期接管与时间比较；毫秒精度保持且无范围错误。
- **同步范围**：reach schema、reldb 类型映射及时间单位注释。

### REACH-03 · P1 · 避免消息 claim 过期后的重复外部发送

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：队列逐条领取并以持久化sending门闩、owner+有效租约条件更新控制发送和提交；在途续租，API声明真实持久幂等能力后仅用稳定queueId重试。SMTP/短信/非幂等API在途超时或不明结果转unknown，停止自动重发，提供受输入验证和CAS保护的人工裁定接口。同步providers/模板/配置/环境、Reach及scheduler三语说明、skills/LLMS。7文件105项、真实三库24项和CLI配置/模板236项通过，类型/lint/build/skills通过；真实HTTP+文件SQLite证明晚归/丢响应/重开接收端唯一副作用，真实SMTP DATA后断连unknown；不宣称任意外部系统exactly-once。Reach环境33字段匹配，全局env待整体复验；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/reach/src/reach-send.ts:26](../packages/reach/src/reach-send.ts#L26)；[packages/reach/src/reach-send.ts:357](../packages/reach/src/reach-send.ts#L357)。
- **证据与影响**：整批领取后串行发送，没有为未处理/正在处理记录续租。慢 provider 下后排记录或当前发送可超过 lease；owner 条件更新只能阻止旧数据库提交，无法撤销重复短信/邮件。
- **修正内容**：按实际执行领取/续租，发送前核验当前所有权；提供稳定消息幂等键，对不支持幂等的 provider 明确至少一次语义与人工核对流程。
- **验收标准**：两个消费者、慢发送、节点暂停/重启和响应丢失下验证接管；支持幂等的 provider 无重复副作用，其他 provider 不宣称 exactly-once。
- **同步范围**：ReachMessage/Provider、队列仓库、reach/scheduler 说明及注释。

### REACH-04 · P1 · 限制毒消息重试，终止满批失败的自旋

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：入队持久保存领取次数上限及指数退避策略，claim原子递增次数含崩溃恢复，nextAttemptAt门禁及轮次快照禁止满批失败自旋；明确永久失败和耗尽进入dead，unknown不重排。提供有界查询与版本条件恢复dead，保留queueId；默认5次、60秒至1小时退避。同步Reach三语文档、skill、CLI生成配置/环境及调用方。Reach121项、真实SQLite/PG/MySQL30项、CLI236项通过，源码/测试/IAM typecheck、build/lint/skills及594项env通过；覆盖100坏消息后健康消息可投递、重启保留退避/次数、dead恢复冲突和unknown隔离；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/reach/src/reach-send.ts:377](../packages/reach/src/reach-send.ts#L377)。
- **证据与影响**：失败或缺 provider 的记录释放回 pending；当满一批都失败时 while 再次领取同批，没有退避/轮次上限，可持续占用工作进程并轰击上游。
- **修正内容**：持久化 nextAttemptAt、attemptCount 和终止/死信状态，区分不可重试错误；单轮有工作预算，失败消息不阻塞后续可发送消息。
- **验收标准**：至少 FLUSH_BATCH_SIZE 条坏消息时一轮有界结束；退避前不重发，正常消息仍可消费，重试上限与恢复入口有效。
- **同步范围**：reach 配置、错误分类、队列管理 API 与运维文档。

### SCHED-01 · P1 · 实现跨周期和手动触发的分布式执行约束

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：共享RelDB执行journal与active_task唯一槽统一约束cron/manual/跨周期；owner+有效租约条件提交和续期；真实幂等声明/持久尝试预算约束接管，非幂等结果unknown保留槽，先停旧runner并核对副作用再版本CAS裁定。三语README/skill/CLI配置和环境目录同步，移除cache运行依赖；scheduler typecheck/测试类型/lint/build、14文件89项含三库与真实4进程场景、CLI238项、skills/env/offline frozen install通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/scheduler/src/scheduler-runner.ts:33](../packages/scheduler/src/scheduler-runner.ts#L33)；[packages/scheduler/src/scheduler-runner.ts:185](../packages/scheduler/src/scheduler-runner.ts#L185)。
- **证据与影响**：现有本进程 runningTasks 加按分钟的 cache lock，只覆盖部分重复触发；README 也把跨周期互斥交给宿主。未使用共享 cache 时更无跨节点排他，不满足本次所有业务逻辑分布式要求。
- **修正内容**：把 task lease 与 occurrence 身份分开，统一 cron/manual 入口；持久记录领取与结果，提供租约续期和崩溃恢复，生产明确要求共享后端。
- **验收标准**：双节点同分钟、跨分钟长任务、手动+cron、重启/租约过期均符合配置的串并行语义；外部副作用用幂等而非承诺仅靠锁 exactly-once。
- **同步范围**：scheduler 类型/配置、cache、reach 使用者、README 与调度 skill。

### SCHED-02 · P2 · 公开调度执行记录的持久化失败

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：日志改稳定UUID及完整JSON载荷，persistence独立于业务status；共享journal终态通过owner/lease最终条件后才投影全部attempt，listLogFailures/repairLog可观测并发幂等补写且不重跑handler/业务Hook。真实提交后丢回执须重读内容一致才确认，无法确认保留pending/unknown；关闭拒绝新补写并等待在途释放。同步三语README、scheduler SKILL/reference与LLMS，调用测试改UUID。11指定文件69项通过，含真实SQLite/PG/MySQL独立多Node、原节点退出/双repair、业务账本计数1、大结果/3attempt、失租无成功投影及SCHED01回归；源/严格全scheduler测试类型、12文件lint、fresh ESM/DTS构建和skills通过，证据tmp/sched02-files.json；无旧表迁移，未宣称DB故障时外部效果自动可恢复；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/scheduler/src/repositories/scheduler-log-repository.ts:59](../packages/scheduler/src/repositories/scheduler-log-repository.ts#L59)。
- **证据与影响**：saveLog 捕获错误后仅记录日志，不把失败交给 runner，业务执行成功与执行记录已持久化无法区分，影响故障恢复/审计。
- **修正内容**：返回可观察的持久化结果，独立记录业务执行状态与记录提交状态；禁止因为补写日志失败就盲目重复业务任务。
- **验收标准**：日志 DB 失败可被调用方/监控识别，恢复后可补偿；不会因记录重试再次执行已完成业务副作用。
- **同步范围**：runner/repository 契约、可观测性文档、scheduler 错误码。

### AI-01 · P1 · 为 context 状态增加共享并发控制及故障恢复

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：共享 scope 聚合状态以版本 CAS、DB 时钟与最终 notAfter 条件提交，逐 delta 持久化、代际 reset/永久删除墓碑、跨节点 pending/turnId 幂等及目录 CAS 已同步实现/三语文档/双份 skill/调用方。8 个定向文件 147 项通过，含真实 PG/MySQL 并发 CAS 与行锁跨截止时间、独立双 Node 暂停 45 秒后接管和重启提交；取消/目录补充回归 2 文件 64 项通过。AI 与受影响 serv/kit/api-client 类型、严格测试类型、定向 lint、fresh ESM/DTS 构建及 check:skills 均通过；未声称外部模型/工具效果与数据库共同事务；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/ai/src/context/ai-context-functions.ts:154](../packages/ai/src/context/ai-context-functions.ts#L154)；[packages/ai/src/context/ai-context-functions.ts:1007](../packages/ai/src/context/ai-context-functions.ts#L1007)。
- **证据与影响**：context manager 使用本地 messages/生成锁/pendingCommits；持久化以整份状态覆盖，没有共享版本条件。两个节点同 scope 可基于旧状态写回，manual commit 在迁移节点后无本地 pending 记录。
- **修正内容**：定义 scope 状态版本、生成/提交身份和持久 pending 记录；用 CAS/事务协调，不把进程 Map 简单替换成远程 Map。明确流式取消/失败的最终状态。
- **验收标准**：双 manager 同 scope 并发不会丢消息；A 生成 B 提交、A 中途崩溃恢复、过期生成提交均可判定且不重复写入。
- **同步范围**：ContextStore/ContextManager API、DB provider、serv/UI 调用、AI context skill。

### AI-02 · P1 · 让知识重建具备版本发布和清理语义

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：Knowledge 完整 revision 以共享 manifest CAS 发布，正文/实体/元数据同版切换，未发布向量不可见；5 分钟 DB 暂存期限、永久迟到写墓碑、分页 repair 与集合撤销已同步公共类型/三语文档/双份 skill/调用方。4 文件 71 项通过（含真实 SQLite+Qdrant 发布补偿 9 场景），Qdrant CRUD/搜索 18 项及驱动错误 3 项通过；AI/vecdb 类型、严格测试类型、定向 lint、fresh 构建、check:skills 通过。Qdrant wait:true 与精确 count 已启用；未声称 SQL/向量服务跨库事务或独立跨主机验收；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/ai/src/knowledge/ai-knowledge-functions.ts:183](../packages/ai/src/knowledge/ai-knowledge-functions.ts#L183)；[packages/ai/src/knowledge/ai-knowledge-functions.ts:200](../packages/ai/src/knowledge/ai-knowledge-functions.ts#L200)。
- **证据与影响**：同 documentId 重灌按 chunk 序号 upsert，文档缩短时旧尾部 chunks 未清除；实体/关系跨存储多步写入，中途失败或并发版本没有整体发布边界。
- **修正内容**：按文档 revision 建立可见版本，完整写入后切换，清理旧 chunks/实体关系；复用现有 store 能力并记录失败补偿，不能仅全删再插造成空窗。
- **验收标准**：10 chunks 更新成 2 后只检索到新版本；并发更新和向量/SQL 中途失败时读到完整旧版或新版，恢复后无长期孤儿。
- **同步范围**：knowledge/store/vecdb 契约、文档删除逻辑、RAG README 和 skill。

### AI-03 · P2 · 统一返回 HaiResult 的异常及后台失败处理

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：Context收集同步异常/reject/失败HaiResult，flush同轮共享并报告后确认，save/reset(wait)/consolidate传播失败且不自动重试；A2A入站日志等待后重验共享代际/期限/取消，出站日志复用有界队列先持久化再发布，失败任务标需核对未知效果且同receipt不重执，查询固定984；IndexTTS统一同版本Undici fetch/Agent/FormData。同步三语README/REFERENCE/双AI skills/LLMS；130项定向（含6个实际受控Node HTTP）与三库真实双Node3项、source/严格test类型、freshAI构建、相关包类型/lint/skills通过，见tmp/ai03-files.json；无真实TTS模型推理或付费provider调用；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/ai/src/context/ai-context-functions.ts:1016](../packages/ai/src/context/ai-context-functions.ts#L1016)；[packages/ai/src/knowledge/ai-knowledge-functions.ts:145](../packages/ai/src/knowledge/ai-knowledge-functions.ts#L145)；[packages/ai/src/context/ai-context-functions.ts:127](../packages/ai/src/context/ai-context-functions.ts#L127)。
- **证据与影响**：restoreManager 的 store.get、knowledge 的就绪检查处在对应异常转换之外；memory extract 队列只处理 rejected Promise，业务 HaiResult 失败缺少同等处理。
- **修正内容**：按实际 API 契约补齐异常转换和 success 判断；后台任务提供可观察失败/flush 结果，流式 API 的抛错边界另行保留。
- **验收标准**：分别注入抛异常和 success:false，公开非流式 HaiResult API 不泄漏业务异常，后台失败不会被 flush 标成全部成功。
- **同步范围**：AI 错误契约、Store 接口注释、消费示例及故障测试。

### AI-04 · P1 · 限制厂商图片下载的地址和资源消耗

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：图片临时URL仅公网无凭证默认443 HTTPS，socket解析固定并校验全部IP和每跳重定向；独立Undici同版本fetch/Agent且不转发认证，实际流/Base64/解压及数量有界，整次生成下载deadline与取消清理；MIME/魔数匹配拒SVG。maxImageBytes/maxImages与066-068错误、三语README/双skill/应用/CLI/env同步；AI及CLI typecheck/build、图片84项（43真实受控TLS）、CLI31及应用5项、lint/skills/env596通过；完整scaffold待AI共享源码稳定统一验证；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/ai/src/image/providers/ai-image-provider.ts:79](../packages/ai/src/image/providers/ai-image-provider.ts#L79)；[packages/ai/src/image/providers/ai-image-provider.ts:91](../packages/ai/src/image/providers/ai-image-provider.ts#L91)。
- **证据与影响**：downloadImage 直接 fetch 上游返回 URL 并默认跟随重定向；readImageResponse 完整读入且无大小上限。受控/被攻破的上游可引导服务器访问非预期地址或返回无限大内容。
- **修正内容**：按信任边界校验协议、目标地址和每跳重定向，阻止不允许的内部地址；有界流式读取、超时/取消、内容类型与必要签名校验。复用已有网络安全能力。
- **验收标准**：拒绝私网/回环/重定向绕过样本；超限响应提前中止且释放连接；合法厂商临时 URL 正常生成。
- **同步范围**：image provider 公共辅助函数、相关配置、AI 图片文档与错误码。

### AI-05 · P2 · 使 MySQL store 初始化可并发执行

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：MySQL并发建索引仅明确ER_DUP_KEYNAME/1061后重查完整结构接受，索引列顺序/唯一性/前缀/类型/可见性不符及权限错误保持失败；等待全部在途DDL结束后返回原错误，调用方逆序清理。同步三语README、REFERENCE、双AI skill、部署说明和LLMS。35项定向测试通过（含真实双Node/MySQL空库竞争、权限失败与恢复、连接释放及PG/MySQL CAS）；源/严格测试类型、定向lint、fresh ESM/DTS构建和check:skills通过，证据tmp/ai05-files.json；未声称DDL事务回滚或跨宿主机故障转移；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/ai/src/store/providers/ai-store-provider-db.ts:115](../packages/ai/src/store/providers/ai-store-provider-db.ts#L115)。
- **证据与影响**：createIndex 先查询 information_schema 再 CREATE INDEX；两个节点同时首次启动可同时判断不存在，后一个创建失败。
- **修正内容**：使用可靠初始化协调，或对明确的重复对象错误重查结构后接受；不得吞掉其它权限/DDL 错误。
- **验收标准**：空库同时启动至少两进程均成功且结构相同；真正错误仍失败并释放资源。
- **同步范围**：AI DB store 初始化说明、MySQL 集成测试和部署 skill。

### STORAGE-01 · P1 · 检查 S3 批量删除的逐项错误并分批

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：S3每批最多1000键，逐项核验完整Deleted/Errors回执，仅明确瞬时错误有界重试；专属DeleteObjects客户端maxAttempts=1防SDK隐式重放。返回确认进度及error.ext.deleteMany（failed/unknown/notAttempted），目录删除传播失败，本地并发32且不吞rejection。同步契约/HTTP调用测试、三包三语README及storage skill/LLMS。新增16项、既有定向7项、serv19项和契约12项通过；四包typecheck、三包build、scoped ESLint/skills通过。真实MinIO/RustFS各1001键及回执中断证明unknown和请求恰好一次；权限部分失败为SDK模拟，未宣称并发上传隔离/历史版本清理；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/storage/src/providers/storage-provider-s3.ts:392](../packages/storage/src/providers/storage-provider-s3.ts#L392)。
- **证据与影响**：DeleteObjects 响应被忽略，HTTP 成功但部分 key 删除失败仍整体 ok；直接提交任意 keys 数量也超过服务端单请求上限的可能。
- **修正内容**：读取 Errors 并返回失败项/部分成功的明确结果；按上限有界分批，目录删除只在所有必要项完成后成功，重试仅处理可重试失败。
- **验收标准**：模拟 HTTP 200 + Errors、1001 个 key、权限失败和请求中断；再用真实 S3 兼容环境验证结果，不虚报删除完成。
- **同步范围**：StorageDelete 结果、serv/api-contract/UI 消费者。依据：[AWS DeleteObjects](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html)。

### STORAGE-02 · P2 · 移除 local provider 的伪签名 URL 成功结果

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：删除Local伪签名local://成功返回，getUrl/putUrl明确UNSUPPORTED_OPERATION(hai:storage:018/400)，publicUrl保持null；同步公共类型、client helper、三语README、storage skills/LLMS、admin模块展示及实际API调用方。红测复现旧成功语义；storage74含真实MinIO/RustFS预签名PUT/GET、serv20含真实Local文件→TCP HTTP→typed apiClient、实际API调用方2项均通过；相关包类型/admin零错误零警告/lint/freshbuild/skills通过，见tmp/module-repair-20261022/STORAGE-02；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/storage/src/providers/storage-provider-local.ts:624](../packages/storage/src/providers/storage-provider-local.ts#L624)。
- **证据与影响**：local 返回 local:// URL，signature 由公开字段散列得到且没有配套验证/访问 handler。文档承认其为伪 URL，但统一 presign 成功契约容易让消费者以为可下载/上传。
- **修正内容**：没有真实托管签名服务时明确返回不支持；若保留能力则实现具有秘密认证、期限和方法绑定的真实路由，不能把散列当授权。
- **验收标准**：保留方案能端到端访问并拒绝篡改/过期/错误方法；不支持方案由 UI/调用方清楚处理，无 success 携带不可用 URL。
- **同步范围**：storage/serv/api-client/UI 上传下载、README/LLMS。

### STORAGE-03 · P2 · 补齐 local list 的真实分页语义

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：Local列表按UTF-8完整key有序遍历，prefix为字符串前缀，delimiter折叠实际文件且files/commonPrefixes共用1..1000预算；多读一项才标truncated，游标绑定canonical root/prefix/delimiter且无进程状态，错误返回019。同步三语README、storage双skill文档和LLMS。Local分页5项（含独立Node续页）、真实TCP serv→apiClient1项及Local/MinIO/RustFS目录34项通过；storage/serv/api-client类型、定向源码测试/三语文档lint、fresh storage构建与check:skills通过，证据tmp/module-repair-20261022/STORAGE-03；游标非授权/非快照，仍扫描排序，canonical挂载路径需一致；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/storage/src/providers/storage-provider-local.ts:579](../packages/storage/src/providers/storage-provider-local.ts#L579)。
- **证据与影响**：continuationToken 被忽略且无 nextContinuationToken；恰好 maxKeys 条也标 truncated，消费者无法可靠遍历所有文件。
- **修正内容**：稳定排序和游标分页，目录前缀/delimiter 处理一致；如果明确不支持分页，不能伪装通用分页结果。
- **验收标准**：0、恰好一页、超过一页、目录混合数据完整遍历无重复/遗漏，最后一页 isTruncated=false。
- **同步范围**：storage API 与 local 能力矩阵、serv 列表消费者及示例。

### VECDB-01 · P1 · 持久化并正确恢复 LanceDB 集合元数据

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：LanceDB以Arrow固定长度vector字段和schema metadata原子持久集合维数/metric，删除进程Map及伪向量探测/占位记录；每次强一致打开真实schema，缺持久定义失败不猜默认值。查询按真实metric选distanceType，明确0..1分数/阈值映射并同步AI/vecdb三语文档及skills/配置注释/LLMS。真实新增3场景及既有定向30项通过，含6空/非空多维多metric集合、独立已连接Node见新建/重建、重启恢复和分数排序；vecdb/AI typecheck、vecdb build、ESLint/skills通过。没有现有metadataSchema API故未臆造；实施复核另增已真实复现的VECDB03过滤注入P1，留独立提交；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/vecdb/src/providers/vecdb-provider-lancedb.ts:97](../packages/vecdb/src/providers/vecdb-provider-lancedb.ts#L97)；[packages/vecdb/src/providers/vecdb-provider-lancedb.ts:440](../packages/vecdb/src/providers/vecdb-provider-lancedb.ts#L440)。
- **证据与影响**：dimension/metric 主要驻留本地 Map。重连通过 1 维查询探测已有表，维度不符或空表时跳过；集合级 metric 回落到配置，导致 info/校验/检索语义与创建时不同。
- **修正内容**：从真实 schema/持久 metadata 恢复维度及集合 metric，不用伪向量探测；多实例读取更新后的 schema，明确本地文件 provider 的部署边界。
- **验收标准**：创建不同维度/metric 的空表与非空表，重启和第二实例的 info、校验和距离排序一致；本地路径不被宣称为自动共享存储。
- **同步范围**：LanceDB provider/config、vecdb README、AI knowledge 接入说明。

### VECDB-02 · P1 · 删除 LanceDB 先删后增的 upsert 回退

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：删除delete/add回退；初始Arrow schema原子声明非空id主键，所有insert/upsert走原生严格键冲突merge，insert不覆盖已有id；每次写入校验主键flag/position/非空、merge能力及批内重复，缺失CONFIG_ERROR且无写入。同步AI持久Store的exists/create/upsert错误传播，删除进程维数提示。LanceDB38项及补严10项、AI12+1项通过；真实双Node4轮全新id唯一、混合insert/upsert和有序更新完整，真实引擎运行时CAST失败后manifest与旧数据不变、新id未发布；缺flag/false/缺能力均失败保留原数据。两包typecheck/build、ESLint/skills通过，三语文档/类型/双侧skills/LLMS同步并引用固定Lance13/SDK0.40.0官方契约；不声称跨多个merge或关系/向量分布式事务；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/vecdb/src/providers/vecdb-provider-lancedb.ts:319](../packages/vecdb/src/providers/vecdb-provider-lancedb.ts#L319)。
- **证据与影响**：mergeInsert 不存在时先 delete 再 add，第二步失败会丢旧数据，读者也能看到中间空窗。该兼容分支与本次不考虑兼容性要求冲突。
- **修正内容**：使用当前支持版本的原子 upsert/merge，缺能力时初始化或操作明确失败；删除本地仿造接口的过时兼容分支，采用上游类型。
- **验收标准**：注入 upsert 失败旧数据仍完整；并发相同 id 有确定最终状态，固定版本安装/构建通过。
- **同步范围**：vecdb 依赖版本、provider 类型、README 支持范围、AI 写入调用方。

### VECDB-03 · P1 · 修复 LanceDB 过滤表达式注入及类型匹配

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：LanceDB使用原生JSON字段及字面量顶层标量预过滤，修复注入/数值类型/缺失与null；旧表与不支持值失败关闭；AI Store传播搜索失败，三语README/skill同步。vecdb与AI typecheck/build、9文件lint、真实native42项（含双进程原子写与重启）、AI50项、check:skills通过；其它provider52项未在本轮执行；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/vecdb/src/providers/vecdb-provider-lancedb.ts](../packages/vecdb/src/providers/vecdb-provider-lancedb.ts)，escapeLanceFilterValue及metadata过滤构造。
- **证据与影响**：owner=alice正常仅返回alice；owner值为 `alice' OR TRUE --` 时返回alice和bob，单引号逃逸可绕过资源范围。数字page=1、布尔active=true被转换为字符串LIKE，均错误返回空。
- **修正内容**：使用安全的表达式/类型化精确匹配，禁止用户值拼接逃逸SQL字面量；明确JSON字段匹配和缺失/null语义，不能用后过滤漏检替代正确topK约束。
- **验收标准**：真实LanceDB覆盖每类引号/反斜线/通配符与注入、数字/布尔/null/嵌套结构；不能返回不属于filter范围的对象，阈值/topK正确。
- **同步范围**：provider、filter公开类型/说明、真实回归、vecdb及AI消费者文档/skill。

### RELDB-01 · P1 · 禁止操作日志输出原始 SQL 参数

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：日志仅保留SQL长度/参数数/批量数等数字摘要，不写SQL原文、绑定值、DDL默认值或驱动错误内容；同步安全摘要配置注释、三语README、skill、envcatalog和根env示例。reldb typecheck、定向ESLint、6项日志回归、check:env与check:skills通过。新worktree环境生成首次被缺dist阻塞，定向构建依赖后复验通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/reldb/src/providers/reldb-provider-base.ts:76](../packages/reldb/src/providers/reldb-provider-base.ts#L76)。
- **证据与影响**：操作日志序列化 sql/params；密码、token、OTP、个人资料等 SQL 参数会进入字符串日志，下游按字段名脱敏也无法识别已拼好的内容。
- **修正内容**：默认只记录 SQL 模板、耗时、行数和安全错误分类；需要诊断的参数必须显式白名单并脱敏，不用普通配置开关开启全部敏感参数。
- **验收标准**：以登录/会话/OTP 写入为例捕获所有日志，测试秘密不能出现；错误路径和慢查询同样满足。
- **同步范围**：reldb operationLog 配置说明、core sanitizer、audit 和运行诊断 skill。

### RELDB-02 · P2 · 落实 MySQL 连接池配置语义

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：MySQL连接池改为有界可取消FIFO，排队及建连共同受期限约束，迟到连接释放而不执行SQL；删除无消费timezone及min/idleTimeout，修正URL优先级和严格TLS实际参数，配置快照遮蔽TLS私钥。真实MySQL池/URI/TLS/生命周期54例、MySQL业务60例和最终mTLS6例通过，源码/测试类型、lint、fresh build、skills及594环境目录检查通过；SQL执行期限不在连接获取超时范围内；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/reldb/src/providers/reldb-provider-mysql.ts:384](../packages/reldb/src/providers/reldb-provider-mysql.ts#L384)。
- **证据与影响**：公共 pool 配置存在 min/idleTimeout/acquireTimeout 等，但 MySQL 创建 pool 主要转发 max，等待策略与其他 provider 不一致。
- **修正内容**：逐项映射当前驱动真正支持的配置；无对应语义的字段明确拒绝或从该 provider schema 删除，设置可控的等待上限。
- **验收标准**：占满连接池后等待在配置期限内结束；空闲释放/最小连接语义与文档一致，不支持项不再静默忽略。
- **同步范围**：reldb-config、HAI_RELDB_* 映射、CLI 配置 catalog、README/skills。

### LIFE-01 · P1 · 统一清理初始化失败时已创建的客户端和连接池

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：候选客户端健康检查后才发布，失败清理保留唯一资源所有权，close 等待初始化并合并并发，清理失败可重试且禁止创建替代连接；Redis fallback disconnect、PG/MySQL 在途事务排空、SQLite pragma/worker 握手两阶段和 S3 双 client 独立清理已落实。cache.close 改为 HaiResult 并同步调用方/API 模板/三语 README/skills。165 项定向测试通过，覆盖真实 Redis/PG/MySQL/SQLite/MinIO；独立 Node 真实 pg_terminate_backend 红绿证明空闲池故障不再退出且下次查询恢复。3 模块和 API/CLI 类型、fresh 构建、定向 lint、skills 通过；未声称云托管服务或外部 AWS 验收；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/reldb/src/providers/reldb-provider-postgres.ts:420](../packages/reldb/src/providers/reldb-provider-postgres.ts#L420)；[packages/reldb/src/providers/reldb-provider-mysql.ts:384](../packages/reldb/src/providers/reldb-provider-mysql.ts#L384)；[packages/storage/src/providers/storage-provider-s3.ts:616](../packages/storage/src/providers/storage-provider-s3.ts#L616)；[packages/cache/src/providers/cache-provider-redis.ts:736](../packages/cache/src/providers/cache-provider-redis.ts#L736)。
- **证据与影响**：连接池/SDK 客户端先创建、随后健康检查可能失败；若 catch 丢引用或外层 init 直接返回，未成功发布的资源缺少 end/destroy/disconnect 清理。
- **修正内容**：在局部 candidate 成功后才发布到模块状态，失败路径完整清理；close 幂等并在关闭失败时保留可诊断状态，避免失败重试累积连接。
- **验收标准**：逐个 provider 注入 connect/health-check 失败，验证 pool/客户端被关闭、isInitialized/isConnected 为 false，恢复后可重试，无计时器/连接泄漏。
- **同步范围**：cache/reldb/storage 生命周期实现、初始化注释、故障恢复示例。

### AUDIT-01 · P1 · 等待审计仓库真正就绪后再宣布初始化成功

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：audit.init等待候选仓库DDL就绪才发布，自定义JOIN/统计/清理共享屏障，close使迟到初始化失效；补实际发现的PostgreSQL并发首次建表catalog冲突，仅指定23505目录冲突重执行原IF NOT EXISTS一次。三语README、RelDB规范参考及audit skill同步；typecheck/lint/build、审计48项、三库双独立Node各3轮首次启动3项、RelDB三库DDL33项、skills及offline frozen install通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/audit/src/audit-main.ts:198](../packages/audit/src/audit-main.ts#L198)；[packages/audit/src/audit-repository-log.ts:166](../packages/audit/src/audit-repository-log.ts#L166)。
- **证据与影响**：init 构造 BaseReldbCrudRepository 后立即发布 currentRepo/返回成功；基类建表是异步流程，自定义查询也未统一等待 ready。首次查询可能早于建表，建表失败时 isInitialized 仍为 true。
- **修正内容**：暴露/复用仓库 readiness，init await 成功后发布；所有自定义查询遵守相同前置，失败清理 candidate 并准确返回。
- **验收标准**：延迟 DDL 时 init 不提前成功；DDL 失败时 isInitialized=false；立即查询和双节点首次启动在三种数据库按约定工作。
- **同步范围**：audit/reldb readiness 契约、生命周期文档和审计接入示例。

### CLIENT-01 · P1 · 移除与安全规范冲突的 localStorage token 适配器

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：删除api-client localStorage token工厂及kit同类createTokenStore入口，移除admin E2E写token残留；公开入口、三语README、skills、LLMS同步。api-client/kit typecheck通过，相关定向37+34测试通过，定向ESLint通过；浏览器E2E留最终阶段；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/api-client/src/api-client-auth.ts:65](../packages/api-client/src/api-client-auth.ts#L65)。
- **证据与影响**：公开工厂允许把敏感 token 写入 localStorage，与仓库硬约束直接冲突。默认 httpOnly 路径正确；问题是仍保留并推广另一条不符合规范的入口。
- **修正内容**：删除该工厂和引用，浏览器采用 httpOnly refresh Cookie + 内存 access token；原生客户端只使用安全 TokenStorage。
- **验收标准**：全仓含模板/示例不再持久化 token 到 localStorage；浏览器刷新、退出、跨页面重载流程通过。
- **同步范围**：api-client exports/README、认证 skill、UI/应用/CLI 模板。

### CLIENT-02 · P1 · 使退出或切换账号使在途刷新失效

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：认证代际、AbortController 和串行存储提交防止迟到刷新/401覆盖退出或新账号；setTokens替换完整凭据对。7个新增竞态/换账号回归先失败再通过，auth定向24/24，api-client typecheck及定向ESLint通过；跨manager/服务端Cookie撤销由明确边界处理；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/api-client/src/api-client-auth.ts:217](../packages/api-client/src/api-client-auth.ts#L217)。
- **证据与影响**：refresh 请求在 clear 之前开始、在 clear 之后返回时，仍会写回新 token。探针退出后恢复了 late-access；账号切换期间也可能被旧刷新覆盖。
- **修正内容**：维护认证代际并取消/丢弃旧代际结果，clear/setTokens 与 refresh 持久化顺序一致；不要只清空 refreshPromise。
- **验收标准**：refresh→logout→response 后 storage 为空；A refresh→登录 B→A response 后仍为 B，重试不会复活 A。
- **同步范围**：TokenManager、UI AuthPanel、Capacitor storage、认证流程测试。

### CAP-01 · P1 · 传播安全存储写入/清理失败并允许恢复

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：原生安全存储初始化/读写/删除失败明确传播并可重试，任一写入失败立即屏蔽整对凭据，clear 等待全部删除；移动端 login/register 部分保存失败调用 clear，二次失败显示独立 i18n 错误并清理 UI/loading，logout 同样收敛状态。类型、调用方、模板、三语 README、skill 已同步。真实 TokenManager 搭配原生插件替身验证 access 已落盘后 refresh/删除失败，存储 14 项与移动端 7 项、两包 typecheck、ESLint、check:skills 通过；真机插件与跨重启撤销未验证，实例屏蔽不冒充持久删除；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/capacitor/src/capacitor-token-storage.ts:144](../packages/capacitor/src/capacitor-token-storage.ts#L144)；[packages/capacitor/src/capacitor-token-storage.ts:43](../packages/capacitor/src/capacitor-token-storage.ts#L43)。
- **证据与影响**：安全存储操作捕获错误后只日志，插件不存在时也可能空返回；调用方不能确认 token 是否保存/删除。首次加载失败缓存为空会妨碍恢复。
- **修正内容**：按 TokenStorage 的异步契约传播失败，明确无插件时拒绝敏感持久化；清理失败使 UI/认证层可见并清除内存身份，允许后续重新加载插件。
- **验收标准**：写入/删除失败被调用方识别，退出后不自动复用旧身份；插件恢复后可重试，使用真实 Android/iOS 安全存储完成验收。
- **同步范围**：Capacitor/api-client 契约、移动应用模板、原生前置文档。

### CAP-02 · P2 · 清理 push 部分注册失败和超时后的监听器

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：以受管 scope 逐个记录推送句柄，权限/挂载/注册30秒总超时、AbortSignal与模块关闭立即停止旧回调并回收已知/迟到句柄；不使用 removeAllListeners。cleanup/close 返回 HaiResult，remove失败保留句柄重试且不重复移除成功项，初始化先处理遗留清理；同步类型、三语README/skills/LLMS和fullstack卸载调用。红测复现泄漏，39项控制时序回归、source/严格test类型、lint/build/skills及模板Svelte编译0warning通过，证据tmp/module-repair-20261022/CAP-02；无Android/iOS真机与FCM/APNs凭据，原生硬件验收未执行；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/capacitor/src/capacitor-push.ts:78](../packages/capacitor/src/capacitor-push.ts#L78)。
- **证据与影响**：registerPush 并行 addListener 后统一保存 handles，部分失败或超时早于完成时可能丢失已注册 handle；listenPush 后续监听注册失败也需处理前一个成功 handle。
- **修正内容**：逐项记录成功 handle，失败/超时/取消/关闭统一回收；迟到的注册完成也立即清理，返回 cleanup 幂等。
- **验收标准**：控制各 addListener 的成功/失败/迟到时序，结束后活跃监听数为零；真实设备反复注册不重复回调。
- **同步范围**：push 生命周期、Capacitor 关闭流程与移动模板。

### PIPE-01 · P2 · 修正分块上限、overlap 和计量单位

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：所有字符模式统一按Unicode codepoint滑窗，预算包含overlap/原始分隔符，严格0<=overlap<maxSize且默认0；word按非空白词且保留空白，Markdown section内同算法、忽略代码围栏标题，默认保留源文。Knowledge失败在embedding/版本发布前返回错误；AI仍markdown/1500/200，修环境生成器父对象默认继承并同步三项分块变量、三语README/RAG及datapipe skills/LLMS。红测复现旧缺陷，52分块/管线+39Knowledge+2环境默认回归、source/严格test类型、datapipe/AI fresh构建/lint/skills/generate与check env通过，见tmp/module-repair-20261022/PIPE-01；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/datapipe/src/datapipe-chunk.ts:216](../packages/datapipe/src/datapipe-chunk.ts#L216)。
- **证据与影响**：sentence/paragraph 拼接 overlap 后未计入 maxSize，探针 maxSize=6 得到长度 9；超长段落切割忽略 overlap。word 模式还需统一按词切分与按字符预算的定义。
- **修正内容**：明确每种模式的计量单位，先预留 overlap/分隔符预算，长段切片步长正确；markdown 路径复用同一边界能力。
- **验收标准**：短段/超长段/中英文/多字节/空白/markdown 覆盖最大长度、相邻重叠和全文内容保持；避免只测块数量。
- **同步范围**：datapipe-config/types、AI knowledge 调用、README 和 RAG skill。

### UI-01 · P2 · 修正浏览器语言候选列表提前回退

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：候选匹配只返回实际支持项，依完整navigator.languages及language顺序遍历后才回退；持久化值规范化，语言/区域/脚本与大小写匹配返回配置代码，默认值不在支持列表时选首项，SSR不读浏览器/不写全局。同步三语README、仓库/模板UI skills、LLMS；调用方检索未见手写应用直接使用该检测函数。红测复现旧缺陷，8项语言/SSR回归、真实Chrome155经Vite消费构建后公开入口3场景、source/严格test类型/lint/UI build/skills通过，见tmp/module-repair-20261022/UI-01；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/ui/src/lib/i18n.svelte.ts:44](../packages/ui/src/lib/i18n.svelte.ts#L44)。
- **证据与影响**：每个候选先回退到 DEFAULT_LOCALE，再检查是否支持，首个不支持语言就可能提前返回默认值，忽略后续 navigator.languages 的有效语言。
- **修正内容**：候选匹配只返回实际命中项，遍历结束后才执行默认回退；尊重传入 supportedLocales/defaultLocale。
- **验收标准**：fr-FR 后接 en-US 应选择 en-US；全部不支持、区域回退、自定义支持列表和 SSR 无 navigator 均正确。
- **同步范围**：UI i18n 注释/示例、各应用 locale 初始化。

### CONTRACT-01 · P2 · 统一 storage API 的输入限制与能力声明

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：新增仅依赖Zod的浏览器安全storage/schemas入口，API/serv共用UTF-8 1024字节key、prefix和HTTP原始数组1..1000约束；服务端继续逐资源授权和Provider防逃逸。签名期限整数1..604800、输入类型允许省略默认值，S3运行时校验；HTTP严格拒绝未消费contentLength及Node上传选项，客户端400/422映射VALIDATION_FAILED，默认refine错误按locale翻译。同步五包三语README、storage skill、LLMS、workspace依赖/lock/tsconfig及能力矩阵。32契约+26serv（真实TCP/typed client/1000文件删除）+16客户端+59Local/MinIO/RustFS签名+3core回归通过；Chrome公开双入口6检查/Vite生产构建、五包类型/fresh构建、严格测试类型、定向lint和skills通过，证据tmp/module-repair-20261022/CONTRACT-01；未宣称HTTP具备Node流/checksum或上传大小保证；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/api-contract/src/storage/storage-schemas.ts:60](../packages/api-contract/src/storage/storage-schemas.ts#L60)；[packages/api-contract/src/storage/storage-schemas.ts:65](../packages/api-contract/src/storage/storage-schemas.ts#L65)；[packages/serv/src/features/serv-feature-storage.ts:26](../packages/serv/src/features/serv-feature-storage.ts#L26)。
- **证据与影响**：公开 key schema 只有非空约束，而 serv 另有长度和路径规则；批量删除 keys 无总量上限。客户端契约与服务端边界分散，超出 provider 上限的处理需配合 STORAGE-01 明确。
- **修正内容**：复用可跨端的 key/批量输入约束，服务端继续执行资源授权和防逃逸；建立 storage→API→serv→client 的能力映射，明确哪些仅 Node 端支持。不要把 file.put 的选项误当 presign 已支持。
- **验收标准**：超长 key、非法路径、过大批量在约定边界失败；允许的批量有界完成。文档不再把仅 Node 的流式/checksum 能力描述成已有 HTTP 端点。
- **同步范围**：storage/api-contract/serv/api-client/UI、上传组件文档和模板。

### CLI-01 · P2 · 按项目架构生成可实际消费的代码

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：按实际workspace依赖识别SvelteKit文件路由与serv共享contract/procedure，--workspace处理歧义；纯Vite/未知聚合结构明确拒绝，serv只更新既有模板标注入口。全部文件预检/临时暂存/失败回滚，主错误与每项清理失败保留，避免半套路由；同步三语README/skill/CLI i18n及模板。347项回归/11架构与回滚场景、严格source/test类型/lint/skills通过；已有scaffold --generate定向子门禁真实生成3工程并lint/tsc/build/启动验证GET/POST/400与fullstack真实transport，通过且无残留JS/fixture；完整scaffold矩阵仍待全部任务后，见tmp/module-repair-20261022/CLI-01；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/cli/src/commands/cli-generate.ts:19](../packages/cli/src/commands/cli-generate.ts#L19)；[packages/cli/src/commands/cli-generate.ts:60](../packages/cli/src/commands/cli-generate.ts#L60)。
- **证据与影响**：page/api 默认固定到 SvelteKit src/routes，project 检测只用于警告和名称；在本仓库支持的 serv/Vite/fullstack 项目中可能生成不被路由消费的文件。
- **修正内容**：识别项目和目标 workspace，按现有架构生成 contract/procedure 或 SvelteKit 文件；未支持组合明确拒绝，不额外创建平行架构。
- **验收标准**：生成后真实启动并访问新路由；至少覆盖 SvelteKit、serv API、fullstack 多 workspace，路径/覆盖保护保持有效。
- **同步范围**：CLI help/README、generate 模板与 skills，执行 scaffold gates。

### CLI-02 · P2 · 把生成器硬编码用户文本接入 i18n

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：生成器描述延迟翻译，提示/进度/结果/错误/取消统一现有中英字典，聚合失败保留子错误；按HAI_CORE_DEFAULTLOCALE>LC_ALL>LC_MESSAGES>LANG选择首个非空环境语言，C/POSIX映射英文，未知保留core语言，不新增i18n体系；取消不写文件。同步三语README/应用skill/LLMS及LC_MESSAGES环境说明；19专项（含9组构建后真实独立CLI进程）+145命令回归、source/严格test类型、lint/freshCLI build、env601/skills通过，见tmp/module-repair-20261022/CLI-02；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/cli/src/commands/cli-generate.ts:25](../packages/cli/src/commands/cli-generate.ts#L25)；[packages/cli/src/commands/cli-generate.ts:139](../packages/cli/src/commands/cli-generate.ts#L139)。
- **证据与影响**：描述、提示、spinner 成功/失败消息和错误仍有直接中文文本，绕过现有 cliM，英语环境不能完整切换。
- **修正内容**：复用现有 locale 消息并同步所有已有语言；代码注释中文、日志英文，生成给用户的文本按既有 locale 合同处理。
- **验收标准**：中英文交互和非交互成功/失败分支无未翻译提示；不手改生成的 Paraglide 文件。
- **同步范围**：CLI messages、help 截例、README 与生成器文档。

### DEPLOY-01 · P2 · 让部署锁在异常退出后可安全恢复

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：部署与恢复改固定.deploy.lock + Linux util-linux flock FD9，活跃子进程继承内核锁，锁文件不删不换且不按时间抢占；缺工具/不支持文件系统与busy均明确失败。同步三语README/usage、生成部署README、skill与LLMS。5项真实Linux容器门禁验证并发、父SIGKILL后子FD继续排他、全kill及容器restart同inode恢复、既有成功基线/health失败和预检错误；部署26项、CLI122回归、严格source/test类型、lint、fresh双构建及skills/env/111本地链接通过。Windows GitBash缺flock的1项跳过，其等价语义已在Linux跑过；Compose/HTTP为明确夹具，未声称宿主OS重启或真实远程发布验收，证据tmp/module-repair-20261022/DEPLOY-01；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/deploy/src/container/deploy-scripts.ts:136](../packages/deploy/src/container/deploy-scripts.ts#L136)。
- **证据与影响**：部署脚本采用 mkdir 锁加 trap 删除；SIGKILL/主机重启不会执行 trap，遗留目录使后续部署永久拒绝，单凭目录也不能可靠判断活跃 owner。
- **修正内容**：使用远端进程级锁或具备 owner/启动代际和安全失效判定的锁协议；保留并发部署互斥，不无条件删除旧目录。
- **验收标准**：并发部署只允许一个；强杀/重启后可恢复；活跃长部署的锁不被另一个进程误删。
- **同步范围**：Docker-SSH 脚本、回滚说明、deploy README/skill。

### DEPLOY-02 · P2 · 限制命令输出并准确结束超时执行

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：Windows以挂起创建→Job分配→恢复管理整个进程树，POSIX使用独立进程组并验证退出；输出回调失败/悬挂也进入有界终止核验，未确认返回unknown。SSH失败显式区分本地终止与远端状态，只有匹配可信终态才标finished；CLI/三语文档/skill同步。49 SDK、12 CLI与9真实Linux/SSH/dist/锁用例通过（另1 Windows缺flock跳过已由Linux覆盖），types/严格测试tsc/lint/fresh build/skills与88链接通过；未声称实际生产部署；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/deploy/src/container/deploy-command.ts:67](../packages/deploy/src/container/deploy-command.ts#L67)。
- **证据与影响**：stdout/stderr 在内存持续累积，超时触发 kill 后需要区分子进程真正退出与仍在清理；SSH 断开也不能据此宣称远端部署已停止。
- **修正内容**：设置有界输出/落盘策略，明确进程树终止和关闭等待；远端执行记录状态，超时返回结果包含是否已确认终止。
- **验收标准**：大输出峰值有上限，超时无本地孤儿子进程；远端继续运行/已停止两种情况报告准确，可继续核对和恢复。
- **同步范围**：runCommand 类型、deploy/CLI 状态显示、日志和故障恢复文档。

### DEPLOY-03 · P1 · 避免跨数据块秘密绕过流式脱敏

- [x] 已修正并通过定向验证（2026-10-22）。
- **实施与验证**：UTF-8逻辑流跨块精确脱敏，成功捕获/回调/错误均覆盖；有界尾部捕获附截断标志，异步回调背压且失败不泄漏cause，进度按行有界；三语README、deploy skill和LLMS同步。deploy typecheck、scoped lint/build、4文件41项定向测试及check:skills通过；远端执行终止另由DEPLOY-02处理；全量回归按用户要求在全部任务实施后执行。
- **位置**：[packages/deploy/src/container/deploy-command.ts:22](../packages/deploy/src/container/deploy-command.ts#L22)。
- **证据与影响**：流式 onOutput 按 chunk 脱敏，秘密被拆成两个数据块时各块都不含完整匹配；下游拼接显示可能泄漏完整秘密。
- **修正内容**：对敏感值匹配保留必要跨块尾部或使用安全的流式日志分帧；定义返回 stdout/stderr 与回调的相同保密边界。
- **验收标准**：每个可能切分点拆分测试秘密，回调/异常/最终结果均不泄漏；正常输出顺序完整且内存有界。
- **同步范围**：deploy-command、CLI 进度展示、core 脱敏辅助与日志规范。

### STYLE-01 · P2 · 统一公开入口和内部导出规则

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：建立21包真实exports/构建声明清单、生成检查及实际消费冒烟；内置Provider/Deps迁回实现边界，保留真实Payment/AI扩展点；修复IAM缺失browser产物、Kit不存在vite入口、UI任意内部通配路径，Node/browser分别提供真实声明并显式类型转发以避免打包器伪造运行时出口。21包实际导入、Node/Browser公开d.ts正负消费与29浏览器完整打包通过，7包及最新AI/Kit fresh build、Reach52例/测试类型、inventory3例、lint/skills及5调用方类型检查通过；admin由DOC01另验证通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[.agents/instructions/module-conventions.md:9](../.agents/instructions/module-conventions.md#L9)；[packages/kit/src/index.ts:13](../packages/kit/src/index.ts#L13)；[packages/cache/src/cache-types.ts:398](../packages/cache/src/cache-types.ts#L398)；[packages/storage/src/storage-types.ts:424](../packages/storage/src/storage-types.ts#L424)；[packages/payment/src/payment-types.ts:150](../packages/payment/src/payment-types.ts#L150)。
- **证据与影响**：规范中的 barrel 导出要求与 kit 显式导出、UI Svelte 默认组件导出存在不同实践；多个内部 Provider 类型放在公共 types 并随入口暴露。不能为形式统一把所有内部函数公开。
- **修正内容**：明确包入口/子路径/内部文件三层规则，给 Svelte 和 client/server 隔离保留必要例外；内部 Provider 类型迁回真实实现边界，删除无消费者的公开符号和纯转发层。
- **验收标准**：逐包生成 package.json.exports 可达 API 表；浏览器入口不带服务端依赖，导入冒烟通过；规则与源码一致且无新增私有类型泄漏。
- **同步范围**：全部 21 包 index/exports、module-conventions、LLMS、模块开发/审查 skills 与 CLI 模板。

### STYLE-02 · P2 · 统一文件命名并删除重复/过时实现

- [ ] 待修正（按本次要求补强；范围：cross）。
- **位置**：[packages/payment/src/providers/wechat/wechat-pay-provider.ts:5](../packages/payment/src/providers/wechat/wechat-pay-provider.ts#L5)；[packages/scheduler/src/repositories/scheduler-log-repository.ts:5](../packages/scheduler/src/repositories/scheduler-log-repository.ts#L5)；[packages/iam/src/session/iam-session-repository-cache.ts:9](../packages/iam/src/session/iam-session-repository-cache.ts#L9)；[packages/vecdb/src/providers/vecdb-provider-lancedb.ts:33](../packages/vecdb/src/providers/vecdb-provider-lancedb.ts#L33)。
- **证据与影响**：wechat-pay、scheduler-*-repository、iam-*-repository-* 等命名顺序不同；LanceDB 本地仿造接口与兼容回退、多个 URL sanitizer 是已定位的精简入口。
- **修正内容**：建立模块前缀/职责后缀规则并保留框架固定文件名例外；统一 repository/provider 命名。先查全仓消费者，再删除无用 export、deprecated API、重复包装，不为拆文件新增抽象。
- **验收标准**：大小写敏感环境构建/导入通过，package exports 和模板引用无旧路径；删掉的分支有来源/无使用证据，保留行为回归通过。
- **同步范围**：全部模块命名清单、tsconfig/package exports、README/skills 链接和测试。

### DOC-01 · P2 · 按实现重建配置、环境变量及文档对应表

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：建立21包Schema→默认值/单位→实际消费→环境/CLI/README/skill配置对应表；删除Core无消费debug/id及示例features/supportedLocales，严格拒绝未知配置；修正Windows TTY Logger覆盖语言/子进程环境、SQL日志说明及Schema spread注释丢失。kit生产限流与kit/serv Secure Cookie识别HAI_CORE_ENV，测试开关不降低Cookie安全；admin仅对SQLite文件创建目录。5应用和2种真实CLI生成配置校验、Core52/CLI31/kit16/serv20例、环境目录4例、真实TTY导入与英文CLI探针通过；源码/测试类型、admin Svelte检查、lint/fresh build、594环境/skills与443本地链接通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[scripts/generate-env-catalog.mjs:1](../scripts/generate-env-catalog.mjs#L1)；[scripts/generate-app-env.mjs:1](../scripts/generate-app-env.mjs#L1)；[LLMS.txt:1](../LLMS.txt#L1)；[packages/cli/src/commands/cli-config-catalog.json:1](../packages/cli/src/commands/cli-config-catalog.json#L1)。
- **证据与影响**：现有 check:env/check:skills 通过，不能发现 Cluster password 未转发、MySQL pool 参数未消费、transport 共享存储承诺错误或 unsupported 能力伪成功等语义漂移。
- **修正内容**：逐包列出 schema→默认值/单位→初始化消费→环境变量→CLI 生成→README/skill 的映射；修正本报告所有对应条目，删除无消费配置和过时示例，核验三语言一致。
- **验收标准**：每个声明的配置至少有真实消费点；示例可编译并能执行到所述行为；CLI 生成应用与仓库配置一致；check:env/check:skills 和相关 scaffold gates 通过。
- **同步范围**：根/模块 README、LLMS、.agents/skills、packages/cli/templates/skills、.env 示例、配置文件和源码注释。

### DIST-01 · P1 · 明确所有生产共享状态及 provider 部署能力

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：新增21包状态/持久化/并发/幂等/恢复矩阵，生产拒绝实际本机后端和console假投递，CLI crypto→db、AI→db+vecdb依赖、生产共享配置与实际应用/模板启动回滚已同步。A2A使用共享journal/context CAS、DB时钟与最终领取/写入期限，跨节点订阅、真实owner取消、续接和未知效果中断；未确认取消禁止下一代，事件写失败停止后续发布，流显式交付失败Task。AI源码5文件48项、生产原语guard20项通过；fresh bundle独立双Node在SQLite/LanceDB、真实PG/Qdrant、MySQL/Qdrant三组通过（后两组production且无测试豁免）。CLI6文件287项及生产生成12项、实际API3项、Playground22项、h5/corporate各13项与相关类型/构建/lint通过；清洁环境已复验API/CLI编译和源码解析。check:skills37/318、check:env600、355本地文档链接通过。全部P1完成后继续P2，不把同宿主容器证明扩展为跨地域HA、真实支付/邮件或外部效果exactly-once；全量回归按用户要求在全部任务实施后执行。
- **位置**：[.agents/instructions/workspace.md:30](../.agents/instructions/workspace.md#L30)；[packages/ai/src/context/ai-context-functions.ts:154](../packages/ai/src/context/ai-context-functions.ts#L154)；[packages/kit/src/middleware/kit-ratelimit.ts:176](../packages/kit/src/middleware/kit-ratelimit.ts#L176)。
- **证据与影响**：不能仅凭接入 Redis/DB 声称支持分布式。本报告已定位会话、传输密钥、限流、队列、任务领取、context 和集合元数据的不同状态问题；测试替身、不可变配置和连接池无需远程化。
- **修正内容**：为所有模块记录状态所有者、持久化位置、并发控制、失效策略、幂等键和故障恢复。补验 AI A2A 默认 event bus 下的跨节点订阅/取消与任务续接，任务入 DB 不等于执行中状态可迁移。生产配置拒绝将 memory、本地文件/SQLite/LanceDB 单节点能力误当跨主机共享保障；允许明确的单机开发/测试模式。
- **验收标准**：两独立进程且无粘性路由完成下文分布式验收矩阵；涵盖 Redis Cluster、DB 断连、节点重启和延迟恢复；逐能力写明一致性保证与限制。
- **同步范围**：21 包能力表、应用启动校验、CLI 生产配置、部署文档及全部相关 skills。

### CORE-03 · P1 · 服务端凭证比较使用原生恒时原语

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：Node入口以原生timingSafeEqual比较UTF-16LE等长字节，保留孤立代理项和NUL精确相等；浏览器保持无内容提前返回的工具但不承诺引擎恒时，长度与外围控制流边界已同步三语README/应用skill。新增原生调用可观察测试及字符串回归21例、密码/SM3/认证封装63例、Stripe37例、内部RPC6例通过；types/严格测试tsc/lint/fresh core build与21包导入/29浏览器打包通过，UUID删除Math.random降级，缺少密码学随机源明确抛错；新增UUID环境回归红→绿，最终Core34例及新代码类型/构建通过；未以耗时统计宣称安全；全量回归按用户要求在全部任务实施后执行。
- **位置**：[Node Core](../packages/core/src/core-main.node.ts)、[字符串工具](../packages/core/src/utils/core-util-string.ts)。
- **证据与影响**：JavaScript 异或循环被用于 OTP、密码摘要、MAC、Stripe 和内部 RPC 凭证校验，源码和文档把它当作恒时安全边界，但 JavaScript 引擎不提供该保证。
- **修正内容**：Node 入口使用原生 timingSafeEqual，保留原始 UTF-16 字符串精确相等语义；浏览器说明其能力边界，不把长度或外围处理宣称为受保护。UUID同时删除不安全随机降级，缺随机源直接失败；同步所有三语说明与应用 skill。
- **验收**：验证等长实际调用原生原语、首尾差异/NUL/孤立代理项/不同长度语义和浏览器隔离；执行受影响安全消费者回归及构建声明/浏览器入口验证。
- **依据**：[Node 官方 timingSafeEqual 契约](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)。

### AI-06 · P1 · 核验 Mem0 实际 SDK 存储与查询契约

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：按真实 Mem03.3.1 公共接口修复生产持久化检查、初始化 barrier、主体 filters.user_id、过期过滤/1001哨兵完整性、保留ID原地更新及未知写入核对；拒绝无公开close的PG组合，禁用history并实证未建资源，锁定Qdrant1.18兼容公开search；双AI skill/三语README/reference/错误码/env/catalog/LLMS同步。3文件57测试通过含4个实际SDK+共享Qdrant场景，Qdrant原生26项、AI/serv类型、严格测试类型、fresh ESM/DTS、定向lint、skills37/324、env595和API21检查通过。embedding为本地真实HTTP受控服务，未调用商业LLM或验证跨主机故障切换；全量回归按用户要求在全部任务实施后执行。
- **位置**：[Mem0 OSS Provider](../packages/ai/src/memory/providers/ai-memory-provider-mem0-oss.ts)。
- **证据与影响**：外层共享标签不能防止 Mem0 对不支持后端解析为内存；生产显式 fallback 仍可能返回 persistent:false。安装 SDK 实际查询的身份过滤字段与模拟测试固定的字段不同，默认候选上限也不能冒充完整列表。
- **修正内容**：在实际解析边界拒绝生产非持久后端，修正真实身份过滤、候选/分页与错误契约；同步调用方、配置说明、skills 和分布式矩阵。
- **验收**：两种生产环境标志拒绝实际内存解析；真实支持后端正例、开发/E2E例外和实际 SDK 查询语义均验证；不以 provider 名称或 mock 成功替代证据。

### VECDB-04 · P1 · Chroma 认证参数按真实 SDK 发送

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：按chromadb3.5真实构造参数发送Authorization Bearer；根URL约束/通道专属env元数据同步，公开heartbeat之后以受保护countCollections作就绪校验，初始化deadline中止挂起连接，成功后清timer不影响后续请求；CLI/三语README/skill/LLMS同步。29定向测试、真实Chroma1.5.5+严格Bearer网关3项、Qdrant1.18原生26项、env元数据1项通过；source/重点test严格类型、fresh ESM/DTS、lint、skills37/324和env595通过。未证明Chroma Cloud、真实TLS或内嵌CLI，认证是显式代理协议不是服务器绕过；全量回归按用户要求在全部任务实施后执行。
- **位置**：[Chroma Provider](../packages/vecdb/src/providers/vecdb-provider-chroma.ts)。
- **证据与影响**：当前 SDK 不处理旧 AUTHORIZATION auth 配置，配置 apiKey 不等于实际发送凭证；匿名容器 CRUD 不能验证受保护部署认证。
- **修正内容**：按安装 SDK 的真实构造和请求参数发送应用约定的 Bearer 认证，拒绝实际被忽略的 URL 成分；同步真实类型、配置、文档与 skill，不声称已验证 Chroma Cloud 或服务端鉴权绕过。
- **验收**：真实 HTTP 捕获/保护代理验证 Authorization 传递和错误凭据拒绝；保留真实 Chroma CRUD、类型、构建及配置检查。

### UI-02 · P2 · 受限浏览器存储 getter 失败按契约降级

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：把localStorage可用性检测移入read/write的try块，受限浏览器global getter抛错时按现有null/false语义降级；公共theme恢复也稳定。3个真实getter回归在旧实现失败，修复后3文件70测试通过；严格测试类型、UI类型、定向lint和freshbuild通过。与142文件JSDoc注释独立隔离，运行时仅两个guard移动；全量回归按用户要求在全部任务实施后执行。
- **位置**：[浏览器安全工具](../packages/ui/src/lib/internal/browser-safety.ts)。
- **证据与影响**：读取 localStorage 全局 getter 本身可抛 SecurityError；在 try 外执行 typeof 会穿透安全读写封装，公开主题存储不能按默认值降级。
- **修正内容**：把全局访问与读写操作放入同一异常边界，保留 SSR 与用户禁用存储时的行为，修正过度保证的注释。
- **验收**：真实抛错 getter 验证内部读/写及公开主题入口均不抛，正常持久化/locale/主题回归通过，运行逻辑和 JSDoc 分开提交。

## JSDoc 任务（21 项）

以下每项独立跟踪。补齐位置与声明名见附件；已有 @example 仍需人工核验有效性，不能只统计标签。所有 export 函数、关键算法/授权/并发/事务逻辑，以及 type/interface（含内部类型）应有中文规范 JSDoc 和有意义的示例。属性需说明单位、可选含义、默认值、约束；函数说明参数、返回值、失败/抛错边界和生命周期。简单内部结构可以共享邻近完整示例，但必须明确关联，不能批量填充无意义占位示例。

- [ ] **JSDOC-01 / ai / P2**：核对 422 个 TS 顶层导出声明，修正 0 个无 JSDoc、372 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [ ] **JSDOC-02 / api-client / P2**：核对 20 个 TS 顶层导出声明，修正 0 个无 JSDoc、14 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [x] **JSDOC-03 / api-contract / P2**：核对 145 个 TS 顶层导出声明，修正 49 个无 JSDoc、141 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：15源码文件145声明145个真实发布入口类型示例补齐；84种公开Schema示例先用真实Zod运行校验，类型别名展示有效请求/响应，组合工厂与路由使用apiContract命名空间而非虚构顶层export，HaiResult示例先收窄；三语README接入统一规范。契约类型、fresh ESM/DTS、定向lint、145示例编译、去注释代码等价及skills通过；PAY06运行时此前单独提交，本项仅注释和文档；全量回归在全部任务实施后执行。
- [x] **JSDOC-04 / audit / P2**：核对 16 个 TS 顶层导出声明，修正 1 个无 JSDoc、11 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：6源码文件18声明18个实际类型示例覆盖公开操作、内部factory/仓储ready与类型；生命周期示例检查reldb/audit初始化和逆序关闭，不假造仓储close，三语README接入统一规范。audit类型、freshbuild、定向lint、18示例编译及skills通过；6个目标文件去注释代码等价，另由STYLE02收口的index导出不包含本提交，无运行时代码变化；全量回归在全部任务实施后执行。
- [x] **JSDOC-05 / cache / P2**：核对 28 个 TS 顶层导出声明，修正 1 个无 JSDoc、20 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：9源码文件35声明35个实际类型示例补齐，关键SET applied/CAS冲突/SCAN游标示例检查success并解释状态；三语README快速示例补初始化、读写失败与关闭检查，指向统一JSDoc规范。cache类型、freshbuild、定向lint、35示例编译、去注释代码等价及skills通过。仅注释与文档变动，无运行时或消费者契约变化；全量回归在全部任务实施后执行。
- [x] **JSDOC-06 / capacitor / P2**：核对 31 个 TS 顶层导出声明，修正 1 个无 JSDoc、18 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：8源码文件36声明36个实际类型示例覆盖公开原生操作、内部推送所有权和结构，业务检查HaiResult并回收模块，安全TokenStorage明确Promise拒绝与禁止Web回退；PhotoResult格式说明改为插件扩展名，修正三语README异步接口失败表述并标记设备验证边界。类型、freshbuild、定向lint、36示例编译、去注释代码等价及skills通过；未宣称真实设备FCM/APNs权限或配置信道验收，本项无运行时代码变化；全量回归在全部任务实施后执行。
- [x] **JSDOC-07 / cli / P2**：核对 75 个 TS 顶层导出声明，修正 7 个无 JSDoc、63 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：16源码文件补齐89声明及8处生成提交/路径边界/硬依赖/语言主题归一化关键逻辑，共97个实际编译示例；原生成模板字符串包含在去注释AST16/16等价证明中。CLI类型、16路径lint零警告、fresh ESM/DTS、skills37/324与真实独立Node语言优先级/生成成功失败36测试均通过；保留PAY06/VECDB04已提交配置实现，无新增运行时代码、API或消费者契约变动；全量回归在全部任务实施后执行。
- [x] **JSDOC-08 / core / P2**：核对 85 个 TS 顶层导出声明，修正 21 个无 JSDoc、47 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：21源码文件94声明94个真实类型示例补齐，区分Node core.init同步void/抛错与业务HaiResult、浏览器文件配置不可用、真实随机数与日志脱敏契约；三语README/模块规范及创建审查skill同步。新增公共JSDoc门禁，按真实发布声明编译公开示例、在词法上下文编译内部示例，Svelte使用真实转换及Props，禁止源码emit；4个有意义的门禁回归通过，core类型/freshbuild/定向lint/94示例编译/去注释代码等价及skills37/324通过，注释不改变运行时代码；全量回归在全部任务实施后执行。
- [ ] **JSDOC-09 / crypto / P2**：核对 48 个 TS 顶层导出声明，修正 1 个无 JSDoc、44 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [x] **JSDOC-10 / datapipe / P2**：核对 23 个 TS 顶层导出声明，修正 0 个无 JSDoc、14 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：7源码文件25声明与25个真实类型示例补齐，说明分块单位、overlap边界、同步/异步HaiResult及纯模块无init/close；三语README快速示例先判断清洗/分块/流水线结果，并修正中文word表述。类型、freshbuild、定向lint、示例编译、去注释代码等价及skills通过；仅注释与文档变更，不改变运行时代码或公共契约；全量回归在全部任务实施后执行。
- [x] **JSDOC-11 / deploy / P2**：核对 75 个 TS 顶层导出声明，修正 1 个无 JSDoc、55 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：28源码文件90声明90个示例及9个公开方法示例共99个真实类型示例补齐；说明制品打包不等于上线、Windows本地树确认不等于SSH远端finished，以及未知云资源先核对。凭据示例使用现有HAI_DEPLOY叶入口并检查初始化结果，内嵌shell/C#/PowerShell模板在28文件去注释AST等价证明中均保持原样。deploy类型、freshbuild、lint28零警告、99示例编译、command/env/credentials定向23测试和skills37/328均通过；纯注释，无运行时代码、公开API、配置或文档契约变动，不声称真实云验收；全量回归在全部任务实施后执行。
- [ ] **JSDOC-12 / iam / P2**：核对 151 个 TS 顶层导出声明，修正 9 个无 JSDoc、150 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [x] **JSDOC-13 / kit / P2**：核对 151 个 TS 顶层导出声明，修正 3 个无 JSDoc、91 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：34源码文件159声明159个真实类型示例覆盖服务端/浏览器入口、配置、认证、客户端、守卫、CRUD、共享限流和加密依赖结构；移除虚构kit.guard.auth等示例，业务/Client/框架控制流按实际返回或抛错使用。三语README把非空token即放行示例改为实际iam.auth.verifyToken，修正异步adapter await及无统一生命周期说明。kit类型、fresh ESM/DTS、定向lint零警告、159示例编译、34文件去注释代码等价、skills37/324与env检查通过；无运行时代码或公共契约变化；全量回归在全部任务实施后执行。
- [ ] **JSDOC-14 / payment / P2**：核对 50 个 TS 顶层导出声明，修正 8 个无 JSDoc、47 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [ ] **JSDOC-15 / reach / P2**：核对 51 个 TS 顶层导出声明，修正 1 个无 JSDoc、42 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [ ] **JSDOC-16 / reldb / P2**：核对 84 个 TS 顶层导出声明，修正 4 个无 JSDoc、57 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [ ] **JSDOC-17 / scheduler / P2**：核对 71 个 TS 顶层导出声明，修正 38 个无 JSDoc、67 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [ ] **JSDOC-18 / serv / P2**：核对 106 个 TS 顶层导出声明，修正 3 个无 JSDoc、98 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [ ] **JSDOC-19 / storage / P2**：核对 49 个 TS 顶层导出声明，修正 5 个无 JSDoc、38 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。
- [x] **JSDOC-20 / ui / P2**：核对 297 个 TS 顶层导出声明，修正 63 个无 JSDoc、284 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。 **实施与验证**：142个文件仅修改注释，376声明全部配有示例，并覆盖95个公开组件头部和24个方法/重导出/模块说明，共495个实际类型编译示例；修正Accordion普通content、MessageBox真实默认值和clipboard权限说明。TS与Svelte去注释执行语义142/142等价（UI02两处独立运行修正已单独提交）；UI类型与svelte-check零错误零警告、lint142文件、fresh svelte-package、skills及示例编译均通过。公开入口/配置/调用方契约未变，无额外运行时代码影响；全量回归在全部任务实施后执行。
- [ ] **JSDOC-21 / vecdb / P2**：核对 35 个 TS 顶层导出声明，修正 3 个无 JSDoc、26 个无 @example 的声明；同时覆盖附件中的内部结构体、Svelte API 和关键逻辑。验收：示例使用真实入口、可类型检查，HaiResult 先判断 success，生命周期按实际类型处理；废弃/无消费的 export 先删除再统计。

## 分布式验收矩阵

| 状态/操作 | 必须验证的场景 | 对应任务 |
| --- | --- | --- |
| Redis 原子操作和锁 | 不同进程/slot、旧 owner 恢复、TTL、scan/keyPrefix、错误鉴权 | CACHE-01～04、DIST-01 |
| 登录/刷新/退出/权限同步 | 同 token 双刷新、注销后迟到写、access 过期刷新、单设备并发、缓存短暂故障 | IAM-01～06、CLIENT-02 |
| 传输协议 | A 协商 B 解密、重启/轮换、篡改、重放、chunked 超限与缺头 | CRYPTO-01/02、SERV-03/04 |
| 限流/调度 | 两进程共享计数、跨周期长任务、cron+manual、暂停接管 | KIT-01、SCHED-01 |
| 通知/支付 | 入队失败、领取后崩溃、慢 provider、毒消息、回调重复乱序、退款响应丢失重试 | REACH-01～04、PAY-01～06 |
| AI 状态/知识 | 同 scope 并发、跨节点 commit、不同文档版本发布、中断恢复、MySQL 同时初始化 | AI-01～05 |
| 存储/数据库 | 部分删除失败、多页遍历、连接失败清理、DB ready、集合重启元信息 | STORAGE、VECDB、RELDB、AUDIT、LIFE-01 |
| 请求级语言 | 两个 locale 请求交错 SSR，不修改进程共享默认值 | CORE-02、UI-01 |

本地磁盘、SQLite、LanceDB、console reach 等开发/单机 provider 不必伪装成跨主机服务；其限制必须进入生产配置校验和能力说明。对邮件等不支持幂等的外部系统不能承诺绝对 exactly-once，应提供至少一次投递、去重能力或可核对的补偿边界。

## 已执行检查及证据边界

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| `pnpm.cmd exec turbo run typecheck --continue=dependencies-successful --force` | 通过，62.1 秒 | Turbo 汇总 49/49，实际重新执行，包含依赖构建 |
| `pnpm.cmd check:skills` | 通过，1.9 秒 | 现有 skill 合同与本地引用检查 |
| `pnpm.cmd exec turbo run lint --continue=dependencies-successful --force` | 通过，97.9 秒 | 按根 lint 的 Turbo 部分单独调度 |
| `pnpm.cmd check:env` | 通过，8.5 秒 | 环境变量 catalog/引用静态检查 |
| 原始源码探针 | 12 个场景复现问题 | 对应 11 个任务，见下表；没有发起真实支付/短信等操作 |

根 lint 的 skill 前置与 Turbo lint 分开记录；没有声称额外执行过完整根 build/test/E2E。typecheck 引发的依赖构建不替代完整发布构建。门禁通过只能证明其覆盖的静态规则，不能排除本清单中的行为问题。

| 探针 | 实际结果 | 任务 |
| --- | --- | --- |
| 共享 get/set 限流，max=1，并发 10 | 全部 10 个请求通过，最终 count=1 | KIT-01 |
| session expiresAt 补丁 | 请求 200000，结果仍 100000 | IAM-03 |
| 同 refresh token 并发 | 两次 success，产生两套不同 access token | IAM-01 |
| 退出与会话更新交错 | 删除后会话被迟到 SET 恢复 | IAM-02 |
| clear 与客户端 refresh 交错 | clear 后写回 late-access | CLIENT-02 |
| maxSize=6、overlap=2 | 生成长度 9 的块 | PIPE-01 |
| 长段 overlap=2 | 块直接连续切割，没有重叠 | PIPE-01 |
| 签名正确的 Stripe completed+unpaid | 返回 paid | PAY-01 |
| URL 中 token/apiKey | query 测试值未脱敏 | CORE-01 |
| SM4 IV 修改 | amount 10000→90000，解密 success | CRYPTO-02 |
| POST 有 body，无 Content-Type/Length | 未解密即进入业务 next | SERV-03 |
| 支付宝 HTTP 200 + code=40004 | createOrder 返回 success | PAY-04 |

复现脚本、结构化结果与原始门禁日志保存在本地被忽略的 `tmp/module-audit-20261022/`，不提交验收产物。探针使用源文件即时转译，缓存/网络/时序依赖为替身，不能替代真实 Redis Cluster、PostgreSQL/MySQL、S3、支付平台、原生设备及跨主机测试。

审查基线阶段未运行完整 test/build/E2E/scaffold-gates，当时仅生成任务。后续实施结果以各项“实施与验证”和进度为准；全量门禁按用户要求等全部任务实施后再运行。真实 provider、容器、发布安装及原生流程的具体证据和边界记录在对应任务中。新增两份 Markdown 的定向 ESLint 检查被仓库 `**/docs/**/*.md` 规则忽略（2 个 warning），不记为通过。独立校验已验证 605 个本地链接、1920 处声明行号及 86 个唯一任务编号；另执行 Git whitespace 检查。

## 全部修正完成的交付门槛

- 所有任务具备修复 commit/文件位置、行为测试和同步文档证据；要求不适用时记录源码依据，不直接删除问题。
- 按工作规范先收集门禁结果、归并根因、集中修复，再跑失败与受影响项：`pnpm.cmd typecheck` → `pnpm.cmd lint` → `pnpm.cmd build` → `pnpm.cmd test`，优先按包，跨包最终提升根门禁。
- 公共 API/模板变更执行 `pnpm.cmd --filter @h-ai/cli test:scaffold-gates`；UI/路由改动补真实浏览器 E2E。
- `pnpm.cmd check:skills`、`pnpm.cmd check:env`、JSDoc 示例类型检查、公开导出面和所有本地文档链接通过。
- 真实分布式及 provider 测试单独列结果；不可用前置记录阻塞，禁止用旧产物、fixture 或单进程测试补成通过。

### CLI-03 · P2 · 本地化创建、初始化和模块安装命令

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：create/add/init复用现有cliM新增146中英同键同参数词条，目录名称/说明以getter延迟解析，选择/校验/确认/进度/失败/取消/完成均跟随终端语言；语言优先级不改变目标应用zh-CN或中文工程注释。三语README/应用创建skill双入口/LLMS同步，JSDOC07源码注释保持不变。旧实现3英文场景先失败，最终4文件165测试无skip通过；Windows真实TTY中英文引导与Enter生成service退出0、类型/严格测试noEmit、定向lint零警告、freshCLI build、89示例和skills37/328通过；全量回归按用户要求在全部任务实施后执行。
- **位置**：`packages/cli/src/commands/cli-add.ts`、`cli-init.ts`、`cli-create.ts`。
- **证据与影响**：CLI-02 的生成器提示已本地化，现有 add/init/create 仍有硬编码中文错误、选择提示和模块描述；英文终端无法保持语言一致。直接 stdout 输出交互提示是既有正确行为。
- **修正内容**：复用现有 locale 与消息字典，统一本地化现有命令及模块名称/说明，保持实际生成内容与配置契约。
- **验收标准**：中英环境下真实命令的提示、失败、取消和结果语言正确；调用方、文档与 skill 同步。

### AI-07 · P2 · 移除无消费且协议失配的遗留 AI 客户端

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：全仓确认旧AIClient/A2AClient、路径适配器与重复不完整SSE helper仅自测/示例消费后移除，保留独立createAudioClient及真实协议；浏览器不导出Node ai单例，HTTP使用api-client typed契约。同步AI/serv三语README、双AI skill/reference/guide、LLMS、公开API清单与删除声明附件；API清单仅移除本任务11符号，TaskStore/audit工厂留STYLE02。4文件29测试通过含真实TCP/标准WebSocket4场景与删除出口负例，严格测试类型、AI类型/fresh ESM+DTS、21 Node导入/29完整浏览器bundle与DTS正负例、lint/API/skills通过。未验证物理麦克风或商业语音供应商，真实LLM SSE解码另在AI08修正；全量回归按用户要求在全部任务实施后执行。
- **位置**：`packages/ai/src/client/ai-client.ts`、`ai-a2a-client.ts` 及浏览器入口。
- **证据与影响**：旧SSE helper不完整处理多行事件、尾部缓冲及取消；旧AIApiAdapter声称兼容api-client，但后者现仅公开typed oRPC，无post/stream接口。遗留客户端目前仅由本包自测和示例消费，端点与serv契约不同。
- **修正内容**：确认全仓消费者后删除无实际业务消费的遗留客户端和重复SSE helper，保留真实AudioClient及其必要协议；同步导出、测试、文档、skills与API门禁。
- **验收标准**：apps/模板真实调用不丢失，发布入口及浏览器构建通过；保留语音客户端使用真实协议，示例不再声称可把typed apiClient传给旧适配器。

### VECDB-05 · P1 · 保留失败清理资源并确认内嵌服务器退出

- [x] 已修正并通过定向验证（2026-10-23）。
- **实施与验证**：主层按已发布/待清理资源保留唯一所有权，失败候选清理、合并close、初始化屏障和旧操作稳定转发均修复，清理确认后移除过期cleanupPending；Chroma等待实际spawn，kill拒绝/抛错/退出未确认返回失败并保留句柄，普通/强制终止各1.5秒有界等待，SDK就绪后再检查初始化信号。新主层6例和真实Node4例先红，最终7文件60测试通过含真实Chroma1.5.5/Bearer网关，最终类型修正后12核心复验通过；source/严格测试/独立纯P1快照类型、fresh ESM/DTS、lint、skills37/328和env595通过。三语README/应用skill/LLMS同步，现有应用/模板的逆序关闭已检查HaiResult，无需改调用契约；只证明直接子进程退出，未宣称真实Chroma CLI或完整进程树验收；全量回归按用户要求在全部任务实施后执行。
- **位置**：`packages/vecdb/src/vecdb-main.ts` 与 `providers/vecdb-provider-chroma.ts`。
- **证据与影响**：主层close在finally无条件丢弃provider，连接失败候选没有清理；Chroma忽略kill(false)/throw和exit确认，可能关闭伪成功且无法重试。初始化与关闭交错还可能迟到发布资源。主层6例和真实Node子进程4例均已在旧实现复现失败。
- **修正内容**：区分活跃资源和仅待清理资源，关闭期间停止当前/已取得操作引用，合并关闭并等待初始化，清理失败保留所有权；内嵌服务器等待spawn/exit并在有界截止内升级终止，失败可重试。
- **验收标准**：异常、失败结果、候选清理、并发close/init及真实子进程拒绝信号/延迟退出均通过；未确认退出不得报告成功，README/skill/分布式边界同步。

### DOC-02 · P2 · 环境变量清单排除源码 JSDoc 的伪入口

- [ ] 待修正。
- **位置**：`scripts/generate-env-catalog.mjs` 的JS/TS扫描。
- **证据与影响**：扫描整段源码的raw regex也读取JSDoc中的process.env示例，把文档变量误认为真实运行时配置入口。
- **修正内容**：按实际源码语法排除JSDoc，保留真实JS/TS入口、模板及YAML可选配置注释的识别，不通过删示例掩盖问题。
- **验收标准**：同一fixture的仅文档变量不入清单、真实入口仍存在，模板/YAML行为保持；生成/check及skills通过。

### AI-08 · P2 · 修正真实 LLM 流使用的 SSE 解码语义

- [ ] 待修正。
- **位置**：`packages/ai/src/llm/ai-llm-stream.ts` 的 createSSEDecoder，Anthropic/MiMo 等实际消费者。
- **证据与影响**：以双LF分段无法处理标准CRLF事件；data.trim丢失有意义空格，多行data与id/retry状态不符合流协议。CRLF单事件已确认返回空数组。与AI07删除的无消费legacy客户端不是同一代码。
- **修正内容**：维护实际共享解码器，正确处理流式换行、data拼接及事件状态；同步真实provider调用与示例。
- **验收标准**：CRLF/LF/CR、多行与空格、UTF8和网络分片、尾部/取消均有定向回归，真实HTTP传输验证；公共/内部契约和文档一致。
