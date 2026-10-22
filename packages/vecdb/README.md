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
> 通过 `serverCommand`（默认 `chroma`，来自 `chromadb` 包）拉起本地服务，`vecdb.close`
> 时关闭进程。需安装可选依赖 `chromadb`；服务命令不可用时 `init` 返回 `CONNECTION_FAILED`。

LanceDB 将向量维度存于 Arrow 固定长度 vector 字段，将集合 metric 存于同一 schema 的 metadata；空表也可正确恢复。`collection.create` 中的 metric 优先于连接配置，连接 metric 仅是新集合的默认值。重启或更换默认值不会改变已有集合。每次操作读取持久 schema，并检查其它连接的提交；缺少有效集合定义时返回 `CONFIG_ERROR`，不探测假向量或猜测 metric。旧表/外部表如缺少该定义，需要重建集合，不提供兼容推断。

LanceDB 是嵌入式本地文件后端。只有访问相同持久目录、且底层文件系统支持 LanceDB 并发提交的进程才能共享数据；不同节点各自的同名本地路径互不共享。分布式服务优先选择 pgvector、Qdrant 或 Chroma 服务端。AI Knowledge 的 reldb 与 vecdb 都须持久化并指向同一业务数据集，替换 embedding 维度时须重建匹配的集合。

搜索始终使用集合 metric，`euclidean` 映射 LanceDB 的 `l2`。`score` 延续公开 API 的 0–1、越大越相似约定：cosine 为 `clamp(1 - distance / 2, 0, 1)`；euclidean 为 `1 / (1 + squaredL2)`；dot 为 `sigmoid(dotProduct)`，用于保持内积排序而非概率。`minScore` 在该转换后过滤；不同 metric/后端的阈值不应视为通用校准值。

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

## 开发测试

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant 测试需要 Docker。

## 许可证

Apache-2.0
