# 生产共享状态与故障恢复

本文记录框架各包的状态边界。共享数据库、Redis、对象存储和向量服务必须由所有应用实例连接到同一逻辑服务。连接池、不可变配置、编译缓存、浏览器组件状态和本机执行句柄属于各进程资源，不需要远程化。

## 启动与部署

`NODE_ENV=production` 或 `HAI_CORE_ENV=production` 任一成立时，框架要求共享生产后端。`HAI_E2E=1` 或 `HAI_E2E_MOCK=1` 仅为明确的自动化测试豁免，生产部署不得设置。其他值（包括 `true`）不绕过检查。

| 能力 | 生产支持 | 开发或明确测试模式 |
| --- | --- | --- |
| cache | Redis 单实例或 Cluster | memory |
| reldb | PostgreSQL、MySQL | SQLite（含磁盘文件） |
| storage | S3 或兼容对象服务 | local |
| vecdb | Qdrant、远端 Chroma、pgvector | LanceDB、嵌入式 Chroma |
| AI Store | `stateScope: 'shared'` 的 Provider；内置实现要求共享 RelDB 与共享 vecdb | 显式 memory 或本机 RelDB/vecdb |
| 传输公钥与 nonce | 基于真实 Redis 或 PostgreSQL/MySQL 的 registry，或满足同等原子契约的共享实现 | memory、包装 memory 的 Redis 工厂、包装 SQLite 的 RelDB 工厂 |
| Reach | SMTP、短信或真实 API Provider | console（仅写日志） |

这些检查在模块发布初始化成功状态前执行；配置不合格返回 `HaiResult` 失败。自定义 Provider 的 `stateScope` 是实现者的契约声明，框架无法根据字符串证明其基础设施、事务隔离或持久化是否正确。

推荐顺序为 core → reldb/cache/vecdb/storage → crypto → IAM/审计/调度/AI 等依赖模块 → HTTP 服务。启动失败逆序关闭已创建资源，关闭失败保留可重试的清理入口。应用必须检查每一步的 `success`，不能记录警告后把缺失的必需能力当作正常启动。

CLI 的 AI 特性依赖 db 与 vecdb。开发配置可使用 SQLite/LanceDB；生产环境覆盖为 PostgreSQL 或 MySQL、Redis、S3、Qdrant。Compose 网络内使用 `db`、`cache`、`storage`、`vecdb` 服务名；外部托管服务则覆盖为其实际地址。数据库、对象存储、Redis 和模型密钥通过私有环境文件或部署密钥注入，公开 YAML/文档不包含真实凭据。部署前用生成项目的配置检查及健康检查验证地址、权限和桶/集合配置。

## 21 包状态与一致性边界

| 包 | 状态所有者与位置 | 并发、幂等、失效与恢复 |
| --- | --- | --- |
| core | 各节点的配置、日志句柄；请求内 locale | 请求 locale 在请求上下文内隔离；节点启动加载相同业务配置。日志脱敏不构成业务持久化。 |
| cache | Redis 的 KV、计数、锁与集合 | 条件写、计数、owner 解锁/续租由 Redis 原子操作完成。Cluster 多键按实际 slot 约束，scan 遍历主节点并处理 keyPrefix。网络故障返回失败，不回退本机 memory。锁只协调领取，不能单独阻止失租后外部副作用。 |
| reldb | 共享数据库的业务行、事务和索引 | 事务与唯一约束是权威提交边界；连接池属于进程。断连/超时不能推断事务是否已提交，调用方须按稳定业务键查询和核对。初始化失败和关闭保留未清理资源供重试。 |
| crypto | 统一受管版本化服务端密钥环；共享 registry 的客户端公钥和 nonce | 所有节点加载同一密钥 ID/密钥对，轮换期间保留解密窗口内旧钥。请求认证绑定方法、路径、请求 ID、签发时间与响应状态；共享原子 nonce claim 拒绝重放。公钥先验 SM2 编码/曲线点；DB 注册与清理事务锁定持久容量行，各节点容量配置一致，pruneExpired 有界维护过期记录且不驱逐有效 nonce。registry 故障拒绝明文进入业务，不生成本机替代密钥。 |
| iam | 用户/凭据版本在 RelDB；会话、refresh lineage、用户 token 索引和 OTP 在 Redis | 刷新/单设备登录原子化；退出后的迟到写通过版本约束拒绝。OTP 为单 key CAS；重置密码通过 DB 行条件与 DB 时钟提交。密码变更推进 credentialVersion，旧会话不能重新绑定新版本。节点丢租、缓存或 DB 故障不能视为成功。 |
| kit | 请求对象与服务端适配器；限流计数在 Redis | 生产限流使用共享原子递增/过期。HTTP 身份来自可信认证上下文；传输加密共享 crypto registry。开发内存限流只适用于单进程测试。 |
| serv | 各节点 HTTP server/procedure 配置；用户、会话、对象和 AI 状态在依赖模块 | procedure 授权在调用层约束，资源标识不能替代主体身份。传输层读取前限制流量，大小/认证失败不进入业务。HTTP server 可无粘性扩容；应用自定义 handler 的幂等及副作用仍由应用实现。 |
| api-contract | 版本化 schema、输入限制与能力声明，无运行时共享业务状态 | 所有生产节点与客户端部署相同契约版本；schema 校验不代替资源授权、事务或真实 Provider 能力。 |
| api-client | 每个用户客户端的 token 与刷新代际 | 同客户端合并刷新，退出/切换账号使在途刷新失效。客户端状态无需跨服务端共享；服务端仍须校验会话与 credentialVersion。禁止把 localStorage 用作默认安全 token 适配器。 |
| storage | S3 桶与对象版本，客户端连接归各节点 | 批量删除分批并检查逐项错误；失败不能返回全成功。对象 key 归属由应用/procedure 授权。需要读改写的业务使用对象服务条件写或 DB 版本；普通上传不自动提供跨节点事务。local 无生产共享或真实签名能力。 |
| vecdb | 共享向量服务的集合、向量、元数据 | Qdrant 写入等待服务端完成；Provider 原生 upsert/过滤能力须按契约使用。LanceDB 元信息仅支持本机恢复，不能跨主机协调。多系统发布由 AI 知识 manifest 负责，向量 upsert 自身不等于发布事务。 |
| ai | context/会话目录/A2A journal/知识 manifest 在共享 RelDB；向量在共享 vecdb | Context 用 scope、owner、epoch、turn 和版本 CAS，每个生成增量先持久化再交付；manual commit 按 turn ID 幂等。reset/delete 留代际或墓碑以拒绝旧 owner。知识以版本 manifest 发布，当前正文/实体/元数据一次切换；未发布/旧版本向量不能参与可见结果，垃圾可重试清理。模型、工具与外部系统不因 CAS 获得 exactly-once。A2A 详见下文。 |
| audit | 共享 RelDB 的审计行与索引 | ready 包括建表/索引完成后才发布模块状态；多节点并发 DDL 使用数据库约束处理。写失败返回失败，审计不补成成功。业务事务与审计若分开提交，不承诺共同原子性。 |
| reach | 共享 RelDB 的队列、发送日志、模板；各节点不可变代码模板 | delay 只有可靠入队后成功。claim token/代际约束回写；有界重试、死信和 unknown 状态禁止无限自旋。API 只有接收端按稳定 Idempotency-Key 原子持久去重才可声明 idempotent；邮件/普通短信未知结果须人工核对，不能自动重发证明 exactly-once。本机扫描锁仅减轻争用。 |
| scheduler | 共享 RelDB 的 occurrence、active task gate 与 execution journal | cron 和手动使用同一任务槽位；稳定 occurrence/手动 idempotencyKey、owner、sequence 与 DB 租约约束领取/完成。非幂等过期执行留 unknown 并占槽，先停止旧执行、核对效果再人工裁定；幂等任务只在接收端真实去重且未耗尽总尝试预算时重试。 |
| payment | 共享 RelDB 的业务订单、Stripe 映射与外部请求幂等记录；平台订单为外部权威 | 创建/退款使用稳定业务键与平台幂等键；超时后查记录/平台结果。回调校验签名和商户身份，应用须事务性去重业务订单状态转换、处理乱序。接收回调与履约不是跨平台分布式事务。 |
| datapipe | 当前调用的输入、分块和转换结果 | 纯转换无需共享锁；并行任务的结果由调用方按输入标识/版本持久化。外部读取器及 sink 的重试、权限、事务由对应适配层负责。 |
| deploy | 部署控制进程、工作目录、目标平台资源 | 部署锁协调同一控制目录；不把本机文件锁当跨主机选主。多控制节点应使用外部 CI/平台共享互斥与稳定部署 ID。中断后检查远端实际状态，不能仅依据本地进程结果认定发布成功。 |
| capacitor | 单台设备的安全存储、权限和原生监听器 | 设备本地数据由设备拥有；安全写入/清理失败向调用方传播。登录代际服从服务端 IAM。推送 token 的服务端登记和去重由应用共享后端维护，不通过原生监听器实现集群状态。 |
| ui | 浏览器/SSR 请求的组件、表单与展示状态 | 浏览器状态由当前用户拥有；SSR 不修改跨请求默认语言。授权、分页、保存和幂等由服务端公共能力实现，组件隐藏按钮不能代替授权。 |
| cli | 生成时的文件与模板上下文；生成应用状态使用上述模块 | 特性依赖、安装依赖、配置及启动必须一致。生产模板选择共享服务并检查初始化结果。CLI 单次生成过程无需 Redis；生成成功不证明生产凭据、外部网络或供应商可用。 |

## A2A 跨节点协议

Task、当前执行事件、稳定 message ID 回执和当前执行结果保存在同一 `hai_ai_a2a_journal` CAS 文档；context 的身份归属保存在 `hai_ai_a2a_contexts`。本机 Map 只跟踪本进程执行句柄，不是 Task 或事件的权威状态。

- 同一已认证主体、context 和首次 message ID 派生稳定 Task ID。相同 message ID/内容重试不再次执行；同 ID 内容改变会失败。后续消息仅能继续 `input-required` 等明确等待输入的状态；终态或中断的未知效果不能自动重新执行。匿名请求共用匿名主体，生产服务应在可信传输层认证并传入 `agentId`。
- 每个事件先与 Task 一起 CAS 持久化，然后才供订阅者读取。首个事件持久化失败后，后续排队事件停止发布，不再发送完成通知；流结束前交付持久化的失败 Task。订阅者在任意节点按自身游标读取共享 journal；订阅断开不表示执行已取消。当前执行已切换到后续消息时，旧订阅明确失败，不拼接两轮事件。
- `tasks/cancel` 在共享状态登记取消请求。实际 owner 的续租循环调用真实 executor.cancelTask；只有执行器确认的状态才作为取消完成。取消未确认期间禁止同一 Task 启动新消息，即使旧执行已返回 input-required，也不能让迟到取消回调作用于新一代执行。其他节点不调用其本机执行器来伪造远端取消。执行器必须实现真实取消，业务不配合时最终进入中断/需要核对状态。
- 领取、租约、执行绝对期限和最终写入条件使用共享 DB 时钟；调用执行器前再次检查是否已过期或关闭，已知失效的领取不得启动业务。失租或超过期限后，旧 owner 即使恢复也无法 CAS 写入。节点崩溃、DB 断连或执行器只留下 working 就返回时，结果为 failed/interrupted，`metadata.haiExecution.requiresEffectReconciliation=true`；此状态表示必须核对外部效果，不表示外部副作用已经撤销。检查后任意暂停与外部调用之间不存在共同事务，执行器仍须按稳定业务键保护副作用。
- `a2a.execution.leaseMs` 默认 30 秒（最小 1 秒），`pollIntervalMs` 默认 250 毫秒（10～5000），`maxExecutionMs` 默认 5 分钟（1 秒～24 小时）。单消息上限 1 MiB，journal 上限 8 MiB，单轮事件最多 2048，Task 回执最多 256，reference tasks 最多 32。超限明确失败；不要把大文件正文作为连续事件长期堆积。
- 已完成 Task 的稳定回执不自动过期；删除数据库记录会失去历史幂等保障。应按业务保留窗口归档/清理，清理前确保调用方不再重试。配置和代码的 executor 必须在每个节点注册；替换执行器须关闭并重新初始化 AI。

外部模型请求、邮件、支付或工具调用没有与 journal 共享事务。执行器应向外部系统传递稳定业务幂等键，并在未知结果时查询或人工核对。框架不对不支持幂等的外部系统承诺 exactly-once，也不自动迁移一段正在运行的 JavaScript 调用栈。

## 验证记录与限制

修正任务中的各项状态记录对应的定向验证；全量回归在全部修正任务完成后统一执行。真实证明与替身边界如下：

| 能力 | 已执行的定向验证 | 边界 |
| --- | --- | --- |
| Redis | 真实 Redis/Cluster 的鉴权、slot、多 key、scan/keyPrefix 与 owner 约束；独立 Node 的限流、会话及 nonce 竞争 | 同宿主容器/进程测试，不等于跨地域 Redis 故障转移演练 |
| Context/Store | Memory、文件 SQLite；真实 PG/MySQL 并发创建、旧版本拒绝、锁等待跨截止时间；双 Node 原进程暂停 45 秒后新 owner 接管、manual pending 重启提交幂等 | 不含真实模型供应商计费/工具副作用回滚 |
| A2A | 公开 JSON-RPC 的双实例测试；独立双 Node 在文件 SQLite/LanceDB、PG/Qdrant、MySQL/Qdrant 三组完成跨节点订阅/真实 owner 取消、节点重启后续接、原进程实际暂停越租后迟到写拒绝。PG/MySQL 子进程开启 production 且无 E2E 豁免；共享状态异常不泄漏连接凭据 | 两个进程与网络数据库/向量容器位于同宿主；真实 CAS/DB 时钟另有 PG/MySQL 行锁跨截止时间验证。尚未演练跨主机网络分区、数据库主从切换或 Qdrant 副本故障 |
| 知识发布 | 真实 SQLite+Qdrant 的并发重建、发布失败、迟到写、重试清理与跨页删除；真实 Qdrant CRUD/检索 | 两套存储无共同事务，以 manifest 可见性与补偿清理收敛；不承诺向量服务故障时仍可检索 |
| 审计/生命周期 | PG/MySQL/SQLite 的并发 ready；Redis、DB、S3 真实连接失败/清理以及迟到初始化、重复关闭 | 不等于云托管服务、网络代理、所有 SDK 版本和所有原生 SQLite 运行时验收 |
| 队列/调度/支付 | 共享队列和 occurrence 的定向并发/进程测试，平台签名及回调契约测试 | 真实邮件/短信/支付扣款与退款、外部系统幂等能力须在各部署沙箱单独验收 |
| 生产校验 | core 的两种生产标记/显式测试豁免；cache/reldb/storage/vecdb/AI/crypto/Reach 拒绝实际本地或假投递后端 | 配置通过不证明凭据正确、服务容量足够、备份可恢复或已达到可用性目标 |

故障处置时保留稳定业务 ID、execution/turn/occurrence ID 与脱敏日志；先查共享权威状态，再核对外部系统。恢复共享连接后重试查询或安全清理，不因请求超时就生成新的业务 ID 绕过幂等记录。
