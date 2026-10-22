# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

共通の `vecdb` オブジェクトで LanceDB、pgvector、Qdrant、Chroma を操作するベクトルデータベースモジュールです。

## 主な機能

- ベクトル次元を指定したコレクションの作成・管理。
- 文書ベクトルの保存、類似検索、メタデータ条件の絞り込み。
- LanceDB・pgvector・Qdrant・Chroma に対応。準備方法は下記設定を参照。

## 使い始める

### クイックスタート

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

### 設定

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

> Node 版の Chroma は HTTP クライアントのみで、プロセス内の組み込み DB はありません。組み込みモードでは `vecdb.init` が
> `serverCommand`（既定は `chromadb` パッケージの `chroma`）でローカルサービスを起動し、`vecdb.close` が
> そのプロセスを停止します。任意依存の `chromadb` をインストールしてください。コマンドが利用できない場合、`init` は `CONNECTION_FAILED` を返します。

#### 操作ログ

ベクトルデータベース設定の `operationLog` で操作ログを有効にできます。ログはコレクション・ベクトル操作が実際の Provider に渡る前に出力され、`vecdb-main.ts` で一括ラップはしません。

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

> 注：`vecdb.config` は**機密情報をマスクした設定スナップショット**を返します。接続文字列のユーザー名・パスワード、個別の `password`、`apiKey` は `[REDACTED]` に置換されます。

> 動作：空の一括 `insert/upsert/delete` は何もしません。書き込み・検索時にはベクトル次元を検証し、不一致なら `HaiVecdbError.DIMENSION_MISMATCH`、任意ドライバーの不足なら `HaiVecdbError.DRIVER_NOT_FOUND` を返します。

### エラー処理

すべての操作は `HaiResult<T>` を返し、`result.success` で成功・失敗を判定します。

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

## 開発とテスト

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant のテストには Docker が必要です。

## ライセンス

Apache-2.0
