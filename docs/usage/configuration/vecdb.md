# VecDB 配置

[配置手册](README.md)

## 配置入口

生成项目使用 `config/_vecdb.yml`，配置注册名为 `vecdb`，环境覆盖前缀为 `HAI_VECDB_`。覆盖顺序和无敏感值示例见[运行配置](runtime.md#配置从哪里来)。

`vecdb.init(config)` 使用 `VecdbConfigSchema` 选择向量后端。各后端连接方式不同，使用独立集合的应用应明确其命名空间。集合名、向量维度和距离度量在创建集合时设置。

## 配置示例

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: lancedb
path: ./data/vectors
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

| 配置项                   | 适用条件        | 默认值/必填               | 说明                                                                                            |
| ------------------------ | --------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `type`                   | `type=lancedb`  | 必填                      | 后端或功能类型，按枚举选择。可填`"lancedb"`                                                     |
| `path`                   | `type=lancedb`  | 必填                      | 嵌入式 LanceDB 的本地持久化目录。多节点的同名目录彼此独立                                       |
| `metric`                 | `type=lancedb`  | `"cosine"`                | 距离度量。可填`"cosine"`、`"euclidean"`、`"dot"`                                                |
| `operationLog`           | `type=lancedb`  | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=lancedb`  | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=lancedb`  | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=lancedb`  | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=lancedb`  | `"debug"`                 | 操作日志的输出级别。可填`"info"`、`"debug"`、`"trace"`                                          |
| `type`                   | `type=pgvector` | 必填                      | 后端或功能类型，按枚举选择。可填`"pgvector"`                                                    |
| `url`                    | `type=pgvector` | 可省略                    | PostgreSQL 连接串，优先于分开填写的连接参数                                                     |
| `host`                   | `type=pgvector` | `"localhost"`             | 主机                                                                                            |
| `port`                   | `type=pgvector` | `5432`                    | 端口。可填整数，1–65535                                                                         |
| `database`               | `type=pgvector` | 必填                      | 数据库名称。可填字符串，至少 1 个字符                                                           |
| `user`                   | `type=pgvector` | 可省略                    | 用户名                                                                                          |
| `password`               | `type=pgvector` | 可省略                    | 密码                                                                                            |
| `indexType`              | `type=pgvector` | `"hnsw"`                  | 索引类型。可填`"ivfflat"`、`"hnsw"`                                                             |
| `metric`                 | `type=pgvector` | `"cosine"`                | 距离度量。可填`"cosine"`、`"euclidean"`、`"dot"`                                                |
| `tablePrefix`            | `type=pgvector` | `"vec_"`                  | 表名前缀                                                                                        |
| `operationLog`           | `type=pgvector` | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=pgvector` | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=pgvector` | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=pgvector` | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=pgvector` | `"debug"`                 | 操作日志的输出级别。可填`"info"`、`"debug"`、`"trace"`                                          |
| `type`                   | `type=qdrant`   | 必填                      | 后端或功能类型，按枚举选择。可填`"qdrant"`                                                      |
| `url`                    | `type=qdrant`   | `"http://localhost:6333"` | Qdrant 的 HTTP(S) 服务地址                                                                      |
| `apiKey`                 | `type=qdrant`   | 可省略                    | Qdrant 的 API 密钥                                                                              |
| `metric`                 | `type=qdrant`   | `"cosine"`                | 距离度量。可填`"cosine"`、`"euclidean"`、`"dot"`                                                |
| `operationLog`           | `type=qdrant`   | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=qdrant`   | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=qdrant`   | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=qdrant`   | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=qdrant`   | `"debug"`                 | 操作日志的输出级别。可填`"info"`、`"debug"`、`"trace"`                                          |
| `type`                   | `type=chroma`   | 必填                      | 后端或功能类型，按枚举选择。可填`"chroma"`                                                      |
| `path`                   | `type=chroma`   | 可省略                    | 本地持久化路径（嵌入式模式：提供且无 url 时自动拉起本地服务）                                   |
| `url`                    | `type=chroma`   | 可省略                    | Chroma 的 HTTP(S) 根端点，优先于 `host` 和 `port`。填写服务地址，不带凭据、路径前缀、查询或片段 |
| `host`                   | `type=chroma`   | `"localhost"`             | 主机                                                                                            |
| `port`                   | `type=chroma`   | `8000`                    | 端口。可填整数，1–65535                                                                         |
| `apiKey`                 | `type=chroma`   | 可省略                    | 自托管 Chroma 或兼容网关使用的 `Authorization` Bearer token，空串表示未配置                     |
| `serverCommand`          | `type=chroma`   | `"chroma"`                | 拉起本地服务的可执行命令                                                                        |
| `startupTimeout`         | `type=chroma`   | `30000`                   | 拉起本地服务的就绪等待超时（毫秒，默认 30000）。正整数                                          |
| `metric`                 | `type=chroma`   | `"cosine"`                | 距离度量。可填`"cosine"`、`"euclidean"`、`"dot"`                                                |
| `operationLog`           | `type=chroma`   | 可省略                    | vecdb 操作日志的读写开关、级别与字段截断规则                                                    |
| `operationLog.read`      | `type=chroma`   | `false`                   | 是否记录读取操作                                                                                |
| `operationLog.write`     | `type=chroma`   | `false`                   | 是否记录写入操作                                                                                |
| `operationLog.maxLength` | `type=chroma`   | `1000`                    | 安全摘要的最大字符数，0 省略摘要。非负整数                                                      |
| `operationLog.level`     | `type=chroma`   | `"debug"`                 | 操作日志的输出级别。可填`"info"`、`"debug"`、`"trace"`                                          |

## 生效与核对

向量后端只保存调用方提供的向量。切换嵌入模型或集合参数时，先核对维度和历史索引兼容性，再以一条已知文档验证写入和检索。[向量存储](ai.md#向量存储)
