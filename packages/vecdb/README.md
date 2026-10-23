# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

## 简介

向量数据库模块，通过统一的 `vecdb` 对象访问 LanceDB、pgvector、Qdrant、Chroma。

## 核心功能清单

- 创建和管理固定向量维度的集合。
- 写入文档向量，按相似度检索并过滤元数据。
- 支持 LanceDB、pgvector、Qdrant 与 Chroma；后端准备方式见下方配置。

## 使用入门

### 快速开始

```ts
import { HaiVecdbError, vecdb } from '@h-ai/vecdb'

// 初始化（LanceDB）
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

// 创建集合
await vecdb.collection.create('docs', { dimension: 1536 })

// 插入向量
await vecdb.vector.insert('docs', [
  { id: 'doc-1', vector: Array.from({ length: 1536 }).fill(0.1), content: '文档内容', metadata: { source: 'wiki' } },
])

// 搜索
const searchResult = await vecdb.vector.search('docs', Array.from({ length: 1536 }).fill(0.2), { topK: 5, minScore: 0.7 })
if (searchResult.success) {
  for (const item of searchResult.data) {
    // item.id, item.score, item.content
  }
}

// 关闭
const closeResult = await vecdb.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

### 配置

```ts
// LanceDB（默认，嵌入式本地存储）
await vecdb.init({ type: 'lancedb', path: './data/vecdb' })

// pgvector（连接字符串）
await vecdb.init({ type: 'pgvector', url: 'postgres://user:pass@localhost:5432/mydb' })

// pgvector（分字段）
await vecdb.init({
  type: 'pgvector',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  indexType: 'hnsw',
  tablePrefix: 'vec_',
})

// Qdrant
await vecdb.init({ type: 'qdrant', url: 'http://localhost:6333', apiKey: 'optional-key' })

// Chroma（嵌入式：自动拉起本地 `chroma run` 服务并持久化到 path）
await vecdb.init({ type: 'chroma', path: './data/chroma' })

// Chroma（直连已有服务，不拉起进程）
await vecdb.init({ type: 'chroma', url: 'http://localhost:8000' })
```

> Chroma 在 Node 端只有 HTTP 客户端（无进程内嵌入式）。嵌入式模式下 `vecdb.init` 会
> 通过 `serverCommand`（默认 `chroma`）拉起本地服务，`vecdb.close` 时关闭进程。
> npm 可选依赖 `chromadb` 提供 HTTP 客户端；服务端 CLI 需另行安装，命令不可用时 `init` 返回 `CONNECTION_FAILED`。

Chroma 直连 `url` 仅接受 HTTP(S) 根端点（例如 `https://chroma.example.com:8443/`），优先于 `host/port`；不接受 URL 凭据、路径前缀、query 或 fragment。未提供 `url` 时使用 `host/port` 的 HTTP 连接。配置使用 `chromadb 3.5.0` 的 `host/port/ssl/headers` 参数，依据：[官方 TypeScript 客户端](https://docs.trychroma.com/reference/typescript/client)。

Chroma 的可选 `apiKey` 按本模块约定发送 `Authorization: Bearer <apiKey>`，仅用于采用该认证协议的自托管服务或网关；远程凭据传输应使用 HTTPS。空串表示不带凭据，非空值不得包含空白、控制字符或非 ASCII 字符。本接口使用默认 tenant/database，不提供 Chroma Cloud 的客户端与租户配置。初始化在心跳后验证集合计数数据端点；认证/权限失败返回 `CONNECTION_FAILED`，不会发布已连接状态，调用方必须检查 `success`。

直连初始化的总截止为 5 秒，本地服务拉起使用 `startupTimeout`。超时中止候选 HTTP 请求；成功后清除初始化 timer，此截止不限制后续业务请求。

Qdrant 使用 `@qdrant/js-client-rest 1.18.0` 的实际类型与 Query API，支持未命名向量字段的 cosine/euclidean/dot 集合。外部 named-vector 或 Manhattan 集合的 info/写入/搜索返回 `CONFIG_ERROR`，不猜测为零维或默认 cosine；仅 HTTP 404 表示集合不存在。Provider 的 URL 日志复用 core 的统一脱敏。

Chroma 的 metadata/filter 遵循 `chromadb 3.5.0` 原生校验，非法值返回操作错误，不丢弃过滤或回退为无过滤查询。可省略文档 content，搜索仍返回 `undefined`；内部按 SDK 的字符串字段传递。各后端的 null、复杂元数据与过滤语义需单独核对。

LanceDB 将向量维度存于 Arrow 固定长度 vector 字段，将集合 metric 存于同一 schema 的 metadata；空表也可正确恢复。`collection.create` 中的 metric 优先于连接配置，连接 metric 仅是新集合的默认值。重启或更换默认值不会改变已有集合。每次操作读取持久 schema，并检查其它连接的提交；缺少有效集合定义时返回 `CONFIG_ERROR`，不探测假向量或猜测 metric。旧表/外部表如缺少该定义，需要重建集合，不提供兼容推断。

LanceDB 是嵌入式本地文件后端。只有访问相同持久目录、且底层文件系统支持 LanceDB 并发提交的进程才能共享数据；不同节点各自的同名本地路径互不共享。分布式服务优先选择 pgvector、Qdrant 或 Chroma 服务端。AI Knowledge 的 reldb 与 vecdb 都须持久化并指向同一业务数据集，替换 embedding 维度时须重建匹配的集合。

搜索始终使用集合 metric，`euclidean` 映射 LanceDB 的 `l2`。`score` 延续公开 API 的 0–1、越大越相似约定：cosine 为 `clamp(1 - distance / 2, 0, 1)`；euclidean 为 `1 / (1 + squaredL2)`；dot 为 `sigmoid(dotProduct)`，用于保持内积排序而非概率。`minScore` 在该转换后过滤；不同 metric/后端的阈值不应视为通用校准值。

LanceDB 原子写入的验证基线为 `@lancedb/lancedb 0.40.0 / Lance 13`。新集合在初始 Arrow schema 声明 id 为不可空主键；insert/upsert 均使用原生 merge，以 id 参与严格键冲突检测。依据：[Lance 13 table format](https://github.com/lance-format/lance/blob/v13.0.0/docs/src/format/table/index.md#unenforced-primary-key)、[Lance 13 transaction](https://github.com/lance-format/lance/blob/v13.0.0/protos/transaction.proto)、[Node binding 0.40.0](https://github.com/lancedb/lancedb/blob/v0.40.0/nodejs/lancedb/table.ts)。

LanceDB 的 `insert` 仅插入新 ID，已有 ID 保留不覆盖；`upsert` 新增或整体替换。同批重复 ID、缺失 merge 能力/持久主键均返回 `CONFIG_ERROR`，不执行写入。旧表需重建，不自动迁移或清空。每个 merge 独立原子提交；并发胜者由提交顺序决定，不提供多个 merge 或 reldb/vecdb 间的共同事务。框架不会回退到 delete/add；写入结果不明时按 ID 核对。直接使用原生 add 的外部写入会绕过该保护，不属于本接口保证。

LanceDB 的 `metadata` 使用原生 JSON 字段，仍可存储嵌套 JSON 对象，搜索结果还原为对象。写入时显式使用 Arrow JSON schema，确保 insert/upsert 都经过 JSONB 编码；旧 Utf8 metadata 表写入或过滤返回 `CONFIG_ERROR`，须重建，不自动迁移。

LanceDB 的 `filter` 仅支持顶层键的 AND 精确匹配，例如 `{ tenant: 'acme', page: 1, active: true, removedAt: null }`。值支持字符串、有限数值、布尔和 null，严格区分 `1`/`'1'`、`true`/`'true'`；null 只匹配显式 JSON null，不匹配缺失字段。键是字面量，点号/括号不代表嵌套路径，引号、反斜线、`%`、`_` 均无 SQL/通配符含义。空对象不筛选；对象、数组、undefined、非有限数值返回 `CONFIG_ERROR`，不会执行无过滤查询。过滤在向量 topK 选取前执行，随后应用 minScore。其它 Provider 沿用各自原生过滤约束，不保证相同 null、复杂值或路径语义；跨后端时须核对实际能力。JSON 查询依据：[Lance 13 JSON UDF](https://github.com/lance-format/lance/blob/v13.0.0/rust/lance-datafusion/src/udf/json.rs)、[Node 0.40.0 JSON field](https://github.com/lancedb/lancedb/blob/v0.40.0/nodejs/lancedb/arrow.ts)。

#### 操作日志

可在向量数据库配置中通过 `operationLog` 开启操作日志。日志在集合/向量操作进入真实 Provider 前输出，不在 `vecdb-main.ts` 中做统一包装。

```yaml
# config/_vecdb.yml
type: lancedb
path: ./data/vecdb
operationLog:
  read: false # collection.exists/info/list, vector.search/count
  write: false # collection.create/drop, vector.insert/upsert/delete
  maxLength: 1000 # 参数序列化后的最大输出长度，超出会截断
  level: debug # info | debug | trace，默认 debug
```

```ts
await vecdb.init({
  type: 'lancedb',
  path: './data/vecdb',
  operationLog: {
    read: true,
    write: true,
    maxLength: 500,
    level: 'debug',
  },
})
```

> 注意：`vecdb.config` 返回的是**脱敏配置快照**；连接字符串中的用户名/密码、独立 `password` 字段和 `apiKey` 会被替换为 `[REDACTED]`。

> 行为说明：空批量 `insert/upsert/delete` 会被视为 no-op；写入与搜索会校验向量维度，不匹配时返回 `HaiVecdbError.DIMENSION_MISMATCH`；缺少可选驱动时返回 `HaiVecdbError.DRIVER_NOT_FOUND`。

Qdrant 的 `insert/upsert/delete` 使用 `wait: true`，成功表示服务端已应用该操作；`vector.count` 使用精确计数，不使用集合信息的近似 points_count。多个操作之间仍不构成事务。

### 错误处理

所有操作返回 `HaiResult<T>`，通过 `result.success` 判断成功或失败。

```ts
const result = await vecdb.collection.create('docs', { dimension: 1536 })
if (!result.success) {
  switch (result.error.code) {
    case HaiVecdbError.NOT_INITIALIZED.code:
      // 请先调用 vecdb.init()
      break
    case HaiVecdbError.COLLECTION_ALREADY_EXISTS.code:
      // 集合已存在
      break
    case HaiVecdbError.CONNECTION_FAILED.code:
      // 连接失败
      break
  }
}
```

## 生产共享状态

生产使用 Qdrant、pgvector 或远端 Chroma；LanceDB 和嵌入式 Chroma 只用于开发/明确测试。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../docs/distributed-state.md)。

## 关闭与失败恢复

close 立即停止当前操作与此前取得的操作引用；连接失败候选和关闭失败资源仅作为待清理所有权保留，不再提供业务服务。并发 close 合并，进行中的 init 先确定资源归属再关闭。失败结果的 error.ext.cleanupPending 表示仍须用同一模块的 close 重试；清理成功前 init 不创建替代资源。内嵌 Chroma 等待实际 spawn，终止直接启动的服务器后等待 exit；普通终止超过 1.5 秒后升级强制终止，再等待 1.5 秒，未确认退出返回失败并保留句柄。该验证覆盖直接子进程，不把信号回执等同于进程树退出或真实 Chroma CLI 上线验收。

## 开发测试

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant 测试需要 Docker。

源码 JSDoc 遵循[统一规范](../../docs/module-jsdoc.md)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package vecdb`；示例编译不代替真实后端行为验证。

## 许可证

Apache-2.0
