# @h-ai/reldb 配置

<a id="reldb-配置"></a>

[English](reldb.en.md) · [日本語](reldb.ja.md)

[配置手册](README.md) · [数据结构](../data/reldb.md) · [功能说明](../function/reldb.md)

## 配置入口

生成的项目把数据库连接设置放在 `config/_db.yml`。应用启动时通过 `core.config` 读取并校验 `db`，再传给 `reldb.init()`。进程环境中的 `HAI_DB_*` 可以覆盖 YAML 中对应字段，例如 `HAI_DB_POOL_MAX` 覆盖 `pool.max`。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

连接成功后，再启动 IAM、Audit 等需要数据库的模块。用 SQLite 的 `database: ":memory:"` 可以创建随连接关闭释放的测试数据库。生产应用使用 PostgreSQL 或 MySQL。需要共享业务数据的多个进程必须连接同一个数据库。

<a id="configuration-fields"></a>

## 配置清单

`type` 是必填字符串，可选 `sqlite`、`postgresql`、`mysql`。按所选的数据库填写对应字段。操作日志适用于三种数据库。

### SQLite

| 配置项 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `database` | 非空字符串 | 必填 | 数据库文件路径或 `:memory:`。相对文件路径以应用进程的工作目录为基准。 |
| `sqlite` | 对象 | 可省略 | 控制文件打开方式和执行线程。省略时仍采用下列默认值。 |
| `sqlite.walMode` | 布尔值 | `true` | 初始化时尝试为数据库启用 WAL，可改善本地文件的并发读写。 |
| `sqlite.readonly` | 布尔值 | `false` | 按只读方式打开已存在的数据库文件。 |
| `sqlite.executor` | `"sync"` 或 `"worker"` | `"sync"` | `sync` 在主线程同步执行，`worker` 在专用线程中持有连接并执行。 |
| `sqlite.workerConnectTimeoutMs` | 正整数 | `10000` | `worker` 启动并打开连接的等待上限，单位毫秒。 |

### PostgreSQL

| 配置项 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `database` | 字符串 | 必填 | 数据库名。配置中提供 `url` 时，Schema 仍要求此字段。 |
| `url` | 字符串 | 可省略 | PostgreSQL 连接字符串。由 `pg` 解析，其中提供的连接参数优先于单独字段。 |
| `host` | 字符串 | `"localhost"` | 主机名或地址。 |
| `port` | 1–65535 的整数 | 可省略 | 驱动使用 `PGPORT` 或默认端口 `5432`。 |
| `user` | 字符串 | 可省略 | 数据库用户名。 |
| `password` | 字符串 | 可省略 | 数据库密码，从服务端私有环境读取。 |
| `ssl` | 布尔值、`"require"`、`"prefer"`、`"allow"`、`"disable"` 或对象 | 可省略 | 传给 `pg` 的 TLS 配置。URL 中的 TLS 参数可覆盖单独的 `ssl`。 |
| `pool` | 对象 | 可省略 | 提供对象时由 RelDB 补齐下列默认值。省略对象时，最大连接数为 10，`pg` 默认最少保留 0 条连接、10 秒回收空闲连接、无连接获取超时。 |
| `pool.min` | 非负整数 | `1` | 已建立连接的最小保留数。连接按需打开。 |
| `pool.max` | 正整数 | `10` | 每个池的最大连接数。 |
| `pool.idleTimeout` | 非负整数 | `30000` | 空闲连接回收时间，单位毫秒。`0` 禁用空闲回收。 |
| `pool.acquireTimeout` | 非负整数 | `10000` | 获取连接的超时，单位毫秒。`0` 禁用池的连接获取超时。 |

### MySQL

| 配置项 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `url` | 字符串 | 可省略 | 非空值使用 `mysql://`，禁止查询参数和片段。使用 URL 时，主机、端口、数据库名和凭据取自 URL。空字符串按省略处理。 |
| `database` | 非空字符串 | 没有有效 URL 时必填 | 数据库名。URL 中已指定库名时可省略此字段。 |
| `host` | 字符串 | `"localhost"` | 拆分字段模式的主机名或地址。 |
| `port` | 1–65535 的整数 | `3306`（驱动默认） | 拆分字段模式的端口。 |
| `user` | 字符串 | 可省略 | 拆分字段模式的用户名。 |
| `password` | 字符串 | 可省略 | 拆分字段模式的密码，从服务端私有环境读取。 |
| `ssl` | `false` 或对象 | 可省略 | 省略或填 `false` 时不开启 TLS。填 `{}` 时开启 TLS，并默认校验证书链和 DNS 主机名。启用这两项校验时，连接目标必须使用 DNS 主机名。 |
| `ssl.rejectUnauthorized` | 布尔值 | `true` | 是否校验证书链，仅配置 `ssl` 对象时生效。 |
| `ssl.verifyIdentity` | 布尔值 | `true` | 证书链校验开启时，是否同时校验 DNS 主机名。 |
| `ssl.ca` | 非空字符串 | 可省略 | 受信任 CA 的 PEM 内容。省略时用 Node.js 信任库。 |
| `ssl.cert` | 非空字符串 | 可省略 | 客户端证书的 PEM 内容，与 `ssl.key` 一起提供。 |
| `ssl.key` | 非空字符串 | 可省略 | 客户端私钥的 PEM 内容，与 `ssl.cert` 一起提供。 |
| `pool` | 对象 | 可省略 | 省略时采用下列默认值。此对象仅支持下列三个字段。 |
| `pool.max` | 正整数 | `10` | 每个池的最大连接数。 |
| `pool.acquireTimeout` | 1–2147483647 的整数 | `10000` | 从排队到获取连接的总超时，单位毫秒。SQL 执行时间单独计算。 |
| `pool.queueLimit` | 正整数 | `1000` | 等待连接的最大请求数。 |
| `mysql` | 对象 | 可省略 | MySQL 驱动选项。 |
| `mysql.charset` | 字符串 | `"utf8mb4"` | 连接字符集。 |

<a id="connection-tls"></a>

### 连接加密（TLS）

PostgreSQL 和 MySQL 都可使用 TLS。SQLite 直接访问本地文件或内存。

PostgreSQL 的 `ssl` 选项由 `pg` 传给 Node.js TLS。服务器使用私有 CA 时，将 PEM 内容放入 `ssl.ca`。如果在 `url` 中设置 `sslmode`、`sslcert`、`sslkey` 或 `sslrootcert`，驱动会用 URL 的 TLS 设置替换独立的 `ssl` 对象。见 [node-postgres TLS 说明](https://node-postgres.com/features/ssl#usage-with-connectionstring)。

MySQL 使用自己的 `ssl` 对象，填 `{}` 即可开启 TLS 并校验证书链及 DNS 主机名。自定义 CA 同样填 `ssl.ca`。TLS 配置始终独立于 MySQL URL。

<a id="operation-logging"></a>

### 操作日志

各后端共用以下配置。启用的操作摘要以 `debug` 输出，由 [Core 日志阈值](core.md#应用日志) 过滤。

旧配置请删除 `operationLog` 下的 `level` 字段。如果该字段引用了环境变量，应先删掉 YAML 中的引用，再删除对应的旧环境变量。

| 配置项 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `operationLog` | 对象 | 可省略 | 省略时关闭下列正常操作摘要。 |
| `operationLog.read` | 布尔值 | `false` | 记录查询、单行查询和分页查询的摘要。 |
| `operationLog.write` | 布尔值 | `false` | 记录结构变更、写入、批量执行和事务操作的摘要。 |
| `operationLog.maxLength` | 非负整数 | `1000` | 安全数量摘要的字符上限，`0` 省略摘要。摘要不含 SQL 原文或绑定值。 |

## 配置示例

以下配置分别用于 `config/_db.yml`。在本地运行应用并保存订单时，可把 SQLite 文件放在可写的 `data` 目录下。初始化成功后写入并查询一条测试订单，确认使用的是预期文件。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

### 多个服务连接同一个 PostgreSQL 数据库

让每个服务都连接 `postgres.internal` 上的 `orders` 库，并通过私有环境提供 `HAI_DB_PASSWORD`。本例每个进程最多使用 10 条连接，获取连接最多等待 5 秒。服务器已启用 TLS 并使用私有 CA 时，通过私有环境变量 `HAI_DB_SSL_CA` 提供 CA 的 PEM 内容，使用与证书匹配的主机名。由一个服务写入测试订单，再从另一个服务读回，以确认它们使用了同一个库。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: postgresql
host: postgres.internal
port: 5432
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
ssl:
  ca: ${HAI_DB_SSL_CA}
  rejectUnauthorized: true
pool:
  max: 10
  acquireTimeout: 5000
```

建立连接后，在应用使用的会话执行 `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`。结果为 `true` 表示该连接使用了 TLS。

### 连接已有 MySQL 数据库

请数据库管理员先建好 `orders` 数据库和账号。这份配置通过单独字段选择启用了 TLS 的服务，从私有环境读取密码和 CA 的 PEM 内容。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
host: mysql.internal
port: 3306
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
ssl:
  ca: ${HAI_DB_SSL_CA}
```

初始化成功后，在应用使用的会话执行 `SHOW SESSION STATUS LIKE 'Ssl_cipher'`。返回的 `Value` 非空表示该连接已协商加密套件。

如果部署环境提供统一的连接字符串，可以用 URL 指定主机、端口、库名和用户名。如果连接需要密码，通过私有环境变量 `HAI_DB_URL` 注入带凭据的完整 URL。使用 TLS 的服务仍需单独配置上面的 `ssl` 对象。启动后在目标库读写测试记录，确认账号具有应用所需的权限。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
url: mysql://orders_app@mysql.internal:3306/orders
```

### SQLite 查询放到工作线程执行

在本地 SQLite 查询较重时，可把同步数据库操作交给专用线程。文件仍位于原路径，目录需要允许服务进程读写。本例启动工作线程并打开数据库的等待上限为 10 秒。确认启动日志报告 `executor: worker`，再读回已有记录。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
sqlite:
  executor: worker
  workerConnectTimeoutMs: 10000
```

### 生效与核对

修改 YAML 或环境变量后重启应用，使启动流程以新配置执行 `reldb.init()`。先检查初始化结果，再验证实际连接目标、应用账号权限和所选 TLS 方式。切换连接配置后，原库记录仍在原库，数据迁移需要另外执行。[数据库类型与地址](data.md#数据库类型与地址)
