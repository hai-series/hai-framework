# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

向量数据库模块，通过统一的 `vecdb` 对象访问 LanceDB、pgvector、Qdrant、Chroma。

## 快速开始

所有 Provider 的 `score` 都为 0–1，越大越相似；`minScore` 在转换后过滤。余弦使用 `(1 + cosine) / 2`，内积使用 `sigmoid(dotProduct)`，欧氏使用 `1 / (1 + distance)`；LanceDB/Chroma 的 distance 是原生 squared L2，其余后端使用原生 L2。不同 metric/后端的阈值仍需按业务校准，score 不代表概率。Qdrant 的公开 minScore 使用统一相似度，而非原生距离阈值。

```ts
import { vecdb } from '@h-ai/vecdb'

// 打开本地 LanceDB 连接。
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

try {
  // 创建余弦相似度集合，每个向量有 3 个数值。
  const created = await vecdb.collection.create('docs', { dimension: 3, metric: 'cosine' })
  if (!created.success)
    throw new Error(created.error.message)

  // 写入一条文档向量，content 和 metadata 会随结果返回。
  const inserted = await vecdb.vector.insert('docs', [
    {
      id: 'doc-1',
      vector: [1, 0, 0],
      content: '安装说明',
      metadata: { source: 'wiki' }
    },
  ])
  if (!inserted.success)
    throw new Error(inserted.error.message)

  // 用接近已写入向量的查询值，返回最多 5 条命中。
  const matches = await vecdb.vector.search('docs', [0.9, 0.1, 0], { topK: 5, minScore: 0.7 })
  if (!matches.success)
    throw new Error(matches.error.message)
  // 命中项包含 id、score、content 和 metadata。
  const firstMatch = matches.data[0]
  process.stdout.write(`${JSON.stringify(firstMatch)}\n`)
}
finally {
  // 释放连接，即使创建、写入或搜索失败也执行。
  const closed = await vecdb.close()
  if (!closed.success)
    process.stderr.write(`Vecdb close failed: ${closed.error.code}\n`)
}
```

## 配置清单

生成项目使用 `config/_vecdb.yml`。应用可以通过 `vecdb.init(config)` 接入配置。

在[模块配置清单](../../docs/usage/configuration/vecdb.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/vecdb.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `config` / `isInitialized` / `rawConnection` — 管理 Provider 连接与底层连接访问
- `collection` — 创建、列出和删除集合
- `vector` — 写入、检索、分页扫描和删除向量

## 数据结构

查看[数据结构](../../docs/usage/data/vecdb.md)，了解集合、向量、元数据、过滤条件与各 Provider 的物理结构。

## 开发测试

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant 测试需要 Docker。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package vecdb`；示例编译不代替真实后端行为验证。

## 许可证

Apache-2.0
