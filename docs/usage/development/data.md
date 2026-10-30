# 数据写读、事务与文件操作指南

[使用指南](../README.md) · [数据配置手册](../configuration/data.md)

以保存并读取一条订单为起点：RelDB保存权威数据，Cache承担缓存及部分共享状态，Storage保存文件，Datapipe处理文本。先区分缓存未命中/对象不存在与依赖故障，再决定重试或恢复。

## 本地开发的最小组合

按[数据配置](../configuration/data.md)为开发选择SQLite、`memory`和local，逐项校验并初始化；生产按共享状态要求使用网络后端。类型、默认值和TLS不在本页重复维护。

下面的代码直接在应用已初始化的模块上调用。先按本章配置连接，再使用业务自己的表和文件路径。

调用先判断success，再读data；条件set还要检查data布尔值是否真正写入。锁的owner需在release/extend带回。local预签名失败必须明确处理，不能当作返回了链接。

## 两次写入必须一起成功时

例如创建订单和扣减库存同属事务。`reldb.tx.wrap`回调抛出才回滚，正常返回失败HaiResult仍会提交，这是事务回调的明确例外。

```ts
import { reldb } from '@h-ai/reldb'

// 数据库已初始化，example_orders表已创建。
const result = await reldb.tx.wrap(async (tx) => {
  const saved = await tx.execute(
    'INSERT INTO example_orders (id, title) VALUES (?, ?)',
    ['order-1', 'Example order'],
  )
  if (!saved.success)
    throw new Error(saved.error.message, { cause: saved.error })
  return saved.data
})
// 外层result是HaiResult；继续检查success。
```

需要原样保留领域错误时用显式begin/rollback/`commit`，每一步检查结果。示例实际制造第二次写入主键冲突，确认前次写入回滚、残留0。动态值用参数；表名/排序列只能来自可信白名单。详见[RelDB事务](../../../packages/reldb/README.md#事务)。

## PostgreSQL / MySQL 与 TLS

按[网络数据库和连接池](../configuration/data.md#数据库类型与地址)创建最小权限账号、隔离测试库和可信证书。注入Secret→校验→init→只读健康查询→再接业务。错误证书和超时应明确失败；池获取期限与SQL执行期限分开。

SQLite通过不能证明网络库/TLS通过。迁移前备份，MySQL DDL可隐式提交，步骤要可重入。DB结构和已写数据的恢复独立于容器回退。

## Redis 与 S3

按[Redis](../configuration/data.md#缓存与共享状态)与[私有文件](../configuration/data.md#文件存储与临时签名)准备真实依赖，测试TTL、条件拒绝、并发锁、写读删、无权签名和过期下载。Cluster多键需同slot，单实例通过不代表集群行为。

批量删除即使HTTP200也可能部分失败，检查逐项回执；unknown先查对象真实状态再补偿。`publicUrl`不是访问控制；服务端先检查私有文件的访问权限，再提供短期签名。

## 清洗和分块

按[文本参数](../configuration/data.md#文本清洗和分块)选择清洗和边界，保留来源与顺序。分块失败不能继续`embedding`，原始材料保留用于追溯。

例如按字符切分 `abcdefghij`，`maxSize: 4`、`overlap: 0` 得到 `abcd`、`efgh`、`ij`；`overlap: 1` 得到 `abcd`、`defg`、`ghij`。重叠能保留相邻片段的上下文，也会增加嵌入和存储开销。
