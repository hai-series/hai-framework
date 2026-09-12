---
name: hai-vecdb
description: "使用 @h-ai/vecdb 管理 LanceDB/pgvector/Qdrant/Chroma 集合与向量检索。"
---

# hai-vecdb

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/vecdb 管理 LanceDB/pgvector/Qdrant/Chroma 集合与向量检索 |
| 适用场景 | 向量持久化、集合管理或相似度搜索 |
| 输入 | VecdbConfigInput、集合、固定维度向量、查询过滤条件 |
| 输出 | 集合/向量操作的 HaiResult |
| 限制 | 仅服务端；向量维度须匹配集合。Chroma 是 HTTP 服务，本地 path 模式需可用服务命令；init 失败不得当成空库。 |

## 使用路径

- `_vecdb.yml` 选择实际后端；init 后检查连接结果，再创建集合并写入相同维度向量。
- Chroma 本地服务不可用返回连接错误；Qdrant 只有 404 代表集合不存在。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- 运行环境
- 适用场景
- 使用步骤
- 核心 API
- 错误码 — `HaiVecdbError`
- 常见模式
- 相关 Skills
