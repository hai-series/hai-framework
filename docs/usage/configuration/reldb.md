# RelDB 配置

[English](reldb.en.md) · [日本語](reldb.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目把数据库连接设置放在 `config/_db.yml`。应用启动时从 `core.config.get('db')` 读取并传给 `reldb.init()`。用环境变量覆盖时使用 `HAI_DB_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

数据库连接成功后，再启动需要保存数据的模块，例如 IAM 和 Audit。测试可用 `database: ":memory:"` 创建随进程退出而消失的 SQLite 数据库。多台服务需要看到同一批业务数据时，应连接同一个 PostgreSQL 或 MySQL 数据库。

<a id="configuration-fields"></a>

## 配置清单

先看 `type` 对应的行。例如，SQLite 的 `database` 是文件路径或 `:memory:`，MySQL 的 `database` 是数据库名称。如果省略整个 `operationLog`，应用不会启用这里列出的 SQL 操作日志选项。

| 配置项                          | 适用条件                | 默认值/必填   | 说明                                                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                          | `type=sqlite`           | 必填          | 此处填写 `"sqlite"`                                                                                                                                                                                                                                                 |
| `database`                      | `type=sqlite`           | 必填          | 数据库：SQLite文件路径或:memory:；PostgreSQL必填名称；MySQL无URL时必填，URL模式从URL读取                                                                                                                                                                            |
| `sqlite`                        | `type=sqlite`           | 可省略        | SQLite 特定选项                                                                                                                                                                                                                                                     |
| `sqlite.walMode`                | `type=sqlite`           | `true`        | 是否启用 WAL 模式（默认 true），可提高并发读写性能                                                                                                                                                                                                                  |
| `sqlite.readonly`               | `type=sqlite`           | `false`       | 是否只读模式                                                                                                                                                                                                                                                        |
| `sqlite.executor`               | `type=sqlite`           | `"sync"`      | 执行方式（默认 sync）。 - `sync`：主线程直接执行 better-sqlite3（同步阻塞主线程事件循环）。 - `worker`：在专用 worker 线程持有唯一连接执行，把阻塞移出主线程。 注意 WAL 只改善数据库锁并发，无法避免 better-sqlite3 同步调用占用调用线程。可填 `"sync"`、`"worker"` |
| `sqlite.workerConnectTimeoutMs` | `type=sqlite`           | `10000`       | worker 执行方式下等待连接打开的超时（毫秒，默认 10000）。正整数                                                                                                                                                                                                     |
| `operationLog`                  | `type=sqlite`           | 可省略        | db 操作日志的读写开关、级别与字段截断规则                                                                                                                                                                                                                           |
| `operationLog.read`             | `type=sqlite`           | `false`       | 是否记录读取操作                                                                                                                                                                                                                                                    |
| `operationLog.write`            | `type=sqlite`           | `false`       | 是否记录写入操作                                                                                                                                                                                                                                                    |
| `operationLog.maxLength`        | `type=sqlite`           | `1000`        | 安全数量摘要的最大字符数；0 表示省略摘要，永不记录 SQL 原文或参数值。非负整数                                                                                                                                                                                       |
| `operationLog.level`            | `type=sqlite`           | `"debug"`     | 操作日志的输出级别。可填 `"info"`、`"debug"`、`"trace"`                                                                                                                                                                                                             |
| `url`                           | `type=postgresql`       | 可省略        | 网络数据库URL；MySQL空串表示使用分字段，非空仅mysql://且拒绝query/fragment，优先于host/port/database/user/password                                                                                                                                                  |
| `host`                          | `type=postgresql`       | `"localhost"` | 数据库主机地址                                                                                                                                                                                                                                                      |
| `port`                          | `type=postgresql`       | 可省略        | 数据库端口 - PostgreSQL 默认 5432 - MySQL 默认 3306。可填整数，1–65535                                                                                                                                                                                              |
| `database`                      | `type=postgresql`       | 必填          | 数据库：SQLite文件路径或:memory:；PostgreSQL必填名称；MySQL无URL时必填，URL模式从URL读取                                                                                                                                                                            |
| `user`                          | `type=postgresql`       | 可省略        | 数据库用户名                                                                                                                                                                                                                                                        |
| `password`                      | `type=postgresql`       | 可省略        | 数据库密码                                                                                                                                                                                                                                                          |
| `ssl`                           | `type=postgresql`       | 可省略        | TLS：PostgreSQL使用其模式；MySQL仅false或严格对象，空对象默认校验证书链和DNS身份。可填布尔值 或 `"require"`、`"prefer"`、`"allow"`、`"disable"` 或 键值对象                                                                                                         |
| `pool`                          | `type=postgresql`       | 可省略        | 连接池配置：PostgreSQL支持min/idleTimeout；MySQL仅max/acquireTimeout/queueLimit，拒绝其他字段                                                                                                                                                                       |
| `pool.min`                      | `type=postgresql`       | `1`           | PostgreSQL 已建立连接的最小保留数。非负整数                                                                                                                                                                                                                         |
| `pool.max`                      | `type=postgresql`       | `10`          | 最大连接数。至少 1 的整数                                                                                                                                                                                                                                           |
| `pool.idleTimeout`              | `type=postgresql`       | `30000`       | PostgreSQL 空闲连接超时，毫秒。非负整数                                                                                                                                                                                                                             |
| `pool.acquireTimeout`           | `type=postgresql`       | `10000`       | 获取连接超时，毫秒（默认10000）；PostgreSQL >=0，0禁用；MySQL排队+建连总期限为1–2147483647。非负整数                                                                                                                                                                |
| `type`                          | `type=postgresql`       | 必填          | 此处填写 `"postgresql"`                                                                                                                                                                                                                                             |
| `operationLog`                  | `type=postgresql`       | 可省略        | db 操作日志的读写开关、级别与字段截断规则                                                                                                                                                                                                                           |
| `operationLog.read`             | `type=postgresql`       | `false`       | 是否记录读取操作                                                                                                                                                                                                                                                    |
| `operationLog.write`            | `type=postgresql`       | `false`       | 是否记录写入操作                                                                                                                                                                                                                                                    |
| `operationLog.maxLength`        | `type=postgresql`       | `1000`        | 安全数量摘要的最大字符数；0 表示省略摘要，永不记录 SQL 原文或参数值。非负整数                                                                                                                                                                                       |
| `operationLog.level`            | `type=postgresql`       | `"debug"`     | 操作日志的输出级别。可填 `"info"`、`"debug"`、`"trace"`                                                                                                                                                                                                             |
| `url`                           | `type=mysql`            | 可省略        | 网络数据库URL；MySQL空串表示使用分字段，非空仅mysql://且拒绝query/fragment，优先于host/port/database/user/password。可填 `""` 或 字符串，URL                                                                                                                        |
| `host`                          | `type=mysql`            | `"localhost"` | 数据库主机地址                                                                                                                                                                                                                                                      |
| `port`                          | `type=mysql`            | 可省略        | 数据库端口 - PostgreSQL 默认 5432 - MySQL 默认 3306。可填整数，1–65535                                                                                                                                                                                              |
| `database`                      | `type=mysql`            | 可省略        | 数据库：SQLite文件路径或:memory:；PostgreSQL必填名称；MySQL无URL时必填，URL模式从URL读取。可填字符串，至少 1 个字符                                                                                                                                                 |
| `user`                          | `type=mysql`            | 可省略        | 数据库用户名                                                                                                                                                                                                                                                        |
| `password`                      | `type=mysql`            | 可省略        | 数据库密码                                                                                                                                                                                                                                                          |
| `ssl`                           | `type=mysql`            | 可省略        | TLS：PostgreSQL使用其模式；MySQL仅false或严格对象，空对象默认校验证书链和DNS身份。可填写 `false` 或一组配置                                                                                                                                                         |
| `ssl.rejectUnauthorized`        | `type=mysql` / 对象形式 | `true`        | MySQL 是否校验证书链（默认 true）；false 明确放弃服务端认证                                                                                                                                                                                                         |
| `ssl.verifyIdentity`            | `type=mysql` / 对象形式 | `true`        | MySQL 是否验证 DNS 主机身份（默认 true）；仅证书链验证开启时有效                                                                                                                                                                                                    |
| `ssl.ca`                        | `type=mysql` / 对象形式 | 可省略        | MySQL 信任的 CA，PEM 内容；省略时使用 Node 信任库。可填字符串，至少 1 个字符                                                                                                                                                                                        |
| `ssl.cert`                      | `type=mysql` / 对象形式 | 可省略        | MySQL 客户端证书，PEM 内容；必须同时提供 key。可填字符串，至少 1 个字符                                                                                                                                                                                             |
| `ssl.key`                       | `type=mysql` / 对象形式 | 可省略        | MySQL 客户端私钥，PEM 内容；必须同时提供 cert。可填字符串，至少 1 个字符                                                                                                                                                                                            |
| `pool`                          | `type=mysql`            | 可省略        | 连接池配置：PostgreSQL支持min/idleTimeout；MySQL仅max/acquireTimeout/queueLimit，拒绝其他字段                                                                                                                                                                       |
| `pool.max`                      | `type=mysql`            | `10`          | 最大连接数。至少 1 的整数                                                                                                                                                                                                                                           |
| `pool.acquireTimeout`           | `type=mysql`            | `10000`       | 获取连接超时，毫秒（默认10000）；PostgreSQL >=0，0禁用；MySQL排队+建连总期限为1–2147483647。可填整数，1–2147483647                                                                                                                                                  |
| `pool.queueLimit`               | `type=mysql`            | `1000`        | MySQL 等待队列最大请求数。至少 1 的整数                                                                                                                                                                                                                             |
| `type`                          | `type=mysql`            | 必填          | 此处填写 `"mysql"`                                                                                                                                                                                                                                                  |
| `mysql`                         | `type=mysql`            | 可省略        | MySQL 特定选项                                                                                                                                                                                                                                                      |
| `mysql.charset`                 | `type=mysql`            | `"utf8mb4"`   | 字符集（默认 utf8mb4），推荐使用 utf8mb4 支持完整 Unicode                                                                                                                                                                                                           |
| `operationLog`                  | `type=mysql`            | 可省略        | db 操作日志的读写开关、级别与字段截断规则                                                                                                                                                                                                                           |
| `operationLog.read`             | `type=mysql`            | `false`       | 是否记录读取操作                                                                                                                                                                                                                                                    |
| `operationLog.write`            | `type=mysql`            | `false`       | 是否记录写入操作                                                                                                                                                                                                                                                    |
| `operationLog.maxLength`        | `type=mysql`            | `1000`        | 安全数量摘要的最大字符数；0 表示省略摘要，永不记录 SQL 原文或参数值。非负整数                                                                                                                                                                                       |
| `operationLog.level`            | `type=mysql`            | `"debug"`     | 操作日志的输出级别。可填 `"info"`、`"debug"`、`"trace"`                                                                                                                                                                                                             |

## 配置示例

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

### 多个服务连接同一个 PostgreSQL 数据库

写入 `config/_db.yml`。每个服务进程最多使用 10 条连接，等待连接最多 5 秒。密码从服务端私有环境读取；所有服务使用相同地址和库名，才会看到相同数据。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: postgresql
host: postgres.internal
port: 5432
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
pool:
  max: 10
  acquireTimeout: 5000
```

### 连接已有 MySQL 数据库

数据库和账号由数据库管理员先创建。此处不填 `url`，所以使用单独的主机、端口和库名。启动成功后再读写一条测试记录，确认账号权限；连上服务器并不代表具备建表权限。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
host: mysql.internal
port: 3306
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
```

### SQLite 查询放到工作线程执行

适合需要避免同步 SQLite 操作占用主线程的服务。数据库仍是同一个本地文件，并未变成远程数据库；目录应允许服务读写。连接工作线程的等待上限为 10 秒。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
sqlite:
  executor: worker
  workerConnectTimeoutMs: 10000
```

### 生效与核对

SQLite 的 `database` 填文件路径或 `:memory:`。MySQL 的 `url` 优先于单独的连接字段，无 URL 时要提供数据库名。生产核对 TLS、连接目标和连接池上限，再运行迁移与回读验证。[数据库类型与地址](data.md#数据库类型与地址)
