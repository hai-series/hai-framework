# VecDB 配置

[English](vecdb.en.md) · [日本語](vecdb.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目把向量数据库连接设置放在 `config/_vecdb.yml`。应用启动时从 `core.config.get('vecdb')` 读取并传给 `vecdb.init()`。用环境变量覆盖时使用 `HAI_VECDB_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

`type` 选择 LanceDB、pgvector、Qdrant 或 Chroma。连接成功后，再用 `vecdb.collection.create()` 设置集合名、每条向量的数字个数和计算相似度的方法。共用数据库的多个应用应为各自的数据使用不同的集合名。

## 配置示例

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: lancedb
path: ./data/vectors
```

## 配置清单

如果选 `type: qdrant`，就必须填写 `url`，其他后端的连接字段不适用。需要记录向量操作时，可以填写 `operationLog`，例如 `operationLog: { write: true }` 会打开写入日志，读取日志仍关闭。

| 配置项                   | 适用条件        | 默认值/必填               | 说明                                                                                            |
| ------------------------ | --------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `type`                   | `type=lancedb`  | 必填                      | 此处填写 `"lancedb"`                                                                            |
| `path`                   | `type=lancedb`  | 必填                      | 嵌入式 LanceDB 的本地持久化目录。多节点的同名目录彼此独立                                       |
| `metric`                 | `type=lancedb`  | `"cosine"`                | 距离度量。可填 `"cosine"`、`"euclidean"`、`"dot"`                                               |
| `operationLog`           | `type=lancedb`  | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=lancedb`  | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=lancedb`  | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=lancedb`  | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=lancedb`  | `"debug"`                 | 操作日志的输出级别。可填 `"info"`、`"debug"`、`"trace"`                                         |
| `type`                   | `type=pgvector` | 必填                      | 此处填写 `"pgvector"`                                                                           |
| `url`                    | `type=pgvector` | 可省略                    | PostgreSQL 连接串，优先于分开填写的连接参数                                                     |
| `host`                   | `type=pgvector` | `"localhost"`             | 主机                                                                                            |
| `port`                   | `type=pgvector` | `5432`                    | 端口。可填整数，1–65535                                                                         |
| `database`               | `type=pgvector` | 必填                      | 数据库名称。可填字符串，至少 1 个字符                                                           |
| `user`                   | `type=pgvector` | 可省略                    | 用户名                                                                                          |
| `password`               | `type=pgvector` | 可省略                    | 密码                                                                                            |
| `indexType`              | `type=pgvector` | `"hnsw"`                  | 索引类型。可填 `"ivfflat"`、`"hnsw"`                                                            |
| `metric`                 | `type=pgvector` | `"cosine"`                | 距离度量。可填 `"cosine"`、`"euclidean"`、`"dot"`                                               |
| `tablePrefix`            | `type=pgvector` | `"vec_"`                  | 表名前缀                                                                                        |
| `operationLog`           | `type=pgvector` | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=pgvector` | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=pgvector` | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=pgvector` | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=pgvector` | `"debug"`                 | 操作日志的输出级别。可填 `"info"`、`"debug"`、`"trace"`                                         |
| `type`                   | `type=qdrant`   | 必填                      | 此处填写 `"qdrant"`                                                                             |
| `url`                    | `type=qdrant`   | `"http://localhost:6333"` | Qdrant 的 HTTP(S) 服务地址                                                                      |
| `apiKey`                 | `type=qdrant`   | 可省略                    | Qdrant 的 API 密钥                                                                              |
| `metric`                 | `type=qdrant`   | `"cosine"`                | 距离度量。可填 `"cosine"`、`"euclidean"`、`"dot"`                                               |
| `operationLog`           | `type=qdrant`   | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=qdrant`   | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=qdrant`   | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=qdrant`   | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=qdrant`   | `"debug"`                 | 操作日志的输出级别。可填 `"info"`、`"debug"`、`"trace"`                                         |
| `type`                   | `type=chroma`   | 必填                      | 此处填写 `"chroma"`                                                                             |
| `path`                   | `type=chroma`   | 可省略                    | 本地持久化路径（嵌入式模式：提供且无 url 时自动拉起本地服务）                                   |
| `url`                    | `type=chroma`   | 可省略                    | Chroma 的 HTTP(S) 根端点，优先于 `host` 和 `port`。填写服务地址，不带凭据、路径前缀、查询或片段 |
| `host`                   | `type=chroma`   | `"localhost"`             | 主机                                                                                            |
| `port`                   | `type=chroma`   | `8000`                    | 端口。可填整数，1–65535                                                                         |
| `apiKey`                 | `type=chroma`   | 可省略                    | 自托管 Chroma 或兼容网关使用的 `Authorization` Bearer token，空串表示未配置                     |
| `serverCommand`          | `type=chroma`   | `"chroma"`                | 拉起本地服务的可执行命令                                                                        |
| `startupTimeout`         | `type=chroma`   | `30000`                   | 拉起本地服务的就绪等待超时（毫秒，默认 30000）。正整数                                          |
| `metric`                 | `type=chroma`   | `"cosine"`                | 距离度量。可填 `"cosine"`、`"euclidean"`、`"dot"`                                               |
| `operationLog`           | `type=chroma`   | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=chroma`   | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=chroma`   | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=chroma`   | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=chroma`   | `"debug"`                 | 操作日志的输出级别。可填 `"info"`、`"debug"`、`"trace"`                                         |

## 生效与核对

向量后端只保存调用方提供的向量。切换嵌入模型或集合参数时，先核对维度和历史索引兼容性，再以一条已知文档验证写入和检索。[向量存储](ai.md#向量存储)
