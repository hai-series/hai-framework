# @h-ai/vecdb API リファレンス

[原文（中国語）](vecdb.md) · [設定](../configuration/vecdb.ja.md) · [データ構造](../data/vecdb.ja.md)

<a id="quick-start"></a>

## クイックスタート

ベクトルバックエンドを初期化し、名前と次元を指定してコレクションを作成し、ベクトルの書き込みと検索を行います。カーソルを使う走査では同じ保存先とコレクションを指定します。

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

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="connection"></a>

### 接続と終了：`vecdb`

ベクトル用バックエンドに接続してから集合を操作します。生の接続情報は信頼できるサーバー内だけで扱います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `vecdb.init(config)` | 初始化配置指定的后端 | `config.type` 必填；后端字段和默认值见[配置清单](../configuration/vecdb.md) | `HaiResult<void>` | `await vecdb.init({ type: 'lancedb', path: './data/vecdb' })` |
| `vecdb.close()` | 等待并释放当前连接 | 无参数 | `HaiResult<void>` | `await vecdb.close()` |
| `vecdb.isInitialized` | 現在操作できるか確認 | 只读属性，启动前为 `false` | `boolean` | `vecdb.isInitialized` |
| `vecdb.config` | 認証情報を除いた設定を読む | 只读属性，未打开或关闭中为 `null` | `VecdbConfig or null` | `vecdb.config` |
| `vecdb.rawConnection` | 信頼済みのサーバーで接続情報を読む。認証情報を含む場合あり | 只读属性，未打开或关闭中为 `null` | `VecdbConnection or null` | `vecdb.rawConnection` |

#### 利用例：接続と終了

```ts
value(await vecdb.init({ type: 'lancedb', path: './data/docs-demo' }))
vecdb.isInitialized // true
vecdb.config?.type // 'lancedb'
const connection = vecdb.rawConnection // backend-specific connection; may contain credentials
value(await vecdb.close()) // undefined
vecdb.config // null
```

ローカルの例は開発用です。次の例では再接続してください。rawConnection をログやブラウザに出さないでください。

非同期操作は HaiResult を返します。表は成功時のデータです。先に success を確認してください。

スコアは割合ではなく 0〜1 の値です。実際の距離尺度とバックエンドでしきい値を確かめてください。走査の結果は ID のみです。空ページでも nextCursor があれば同じコレクションとバックエンドで続けます。

[引数と手順の詳細](vecdb.md#connection)

<a id="collections"></a>

### 集合の作成と削除：`vecdb.collection`

集合でベクトルの次元と距離計算方式を固定します。集合を削除すると中のベクトルも削除されます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `vecdb.collection.create(name, options)` | 创建集合 | 集合名和 `options.dimension` 必填；`metric` 默认沿用向量库配置，未设置时为 `cosine` | `void` | `await vecdb.collection.create('documents', { dimension: 3 })` |
| `vecdb.collection.drop(name)` | 删除集合和其中的文档向量 | 集合名必填 | `void` | `await vecdb.collection.drop('documents')` |
| `vecdb.collection.exists(name)` | 检查集合是否存在 | 集合名必填 | `boolean` | `await vecdb.collection.exists('documents')` |
| `vecdb.collection.info(name)` | 查询集合的维度、度量和文档数 | 集合名必填 | `CollectionInfo` | `await vecdb.collection.info('documents')` |
| `vecdb.collection.list()` | 列出集合名称 | 无参数 | `string[]` | `await vecdb.collection.list()` |

#### 利用例：集合の作成と削除

```ts
value(await vecdb.collection.create('demo-docs', { dimension: 3, metric: 'cosine' }))
value(await vecdb.collection.exists('demo-docs')) // true
value(await vecdb.collection.list()) // includes 'demo-docs'
const info = value(await vecdb.collection.info('demo-docs')) // dimension 3, cosine, zero documents
value(await vecdb.collection.drop('demo-docs')) // undefined
value(await vecdb.collection.exists('demo-docs')) // false
```

未使用の集合名を使います。次の例では三次元の集合を再作成してください。バックエンドのエラーは失敗結果です。

[引数と手順の詳細](vecdb.md#collections)

<a id="vectors"></a>

### 文書の保存・検索・削除：`vecdb.vector`

同じ次元のベクトルを保存・検索します。ID ごとに更新・削除し、scan で一覧を分割取得します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `vecdb.vector.insert(collection, documents)` | 写入文档向量 | 集合名与文档数组必填。每条文档要有 `id` 和与集合维度一致的 `vector` | `void` | `await vecdb.vector.insert('documents', [{ id: 'doc-1', vector: [1, 0, 0] }])` |
| `vecdb.vector.upsert(collection, documents)` | 插入文档，或按 ID 整条替换 | 集合名与文档数组必填。替换时传入完整文档 | `void` | `await vecdb.vector.upsert('documents', [{ id: 'doc-1', vector: [1, 0, 0], content: '新版' }])` |
| `vecdb.vector.delete(collection, ids)` | 按 ID 删除文档 | 集合名与 ID 数组必填 | `void` | `await vecdb.vector.delete('documents', ['doc-1'])` |
| `vecdb.vector.search(collection, vector, options?)` | 根据相似度搜索向量 | 集合名及查询向量必填。`topK` 默认 `10`，可传 `minScore` 和 `filter` | `VectorSearchResult[]` | `await vecdb.vector.search('documents', [0.9, 0.1, 0], { topK: 5 })` |
| `vecdb.vector.count(collection)` | 统计集合中的文档数 | 集合名必填 | `number` | `await vecdb.vector.count('documents')` |
| `vecdb.vector.scan(collection, options?)` | 按页列出可删除的文档 ID | 集合名必填，首页省略 `cursor`，`limit` 默认 `64` | `VectorScanPage` | `await vecdb.vector.scan('documents', { limit: 32 })` |

#### 利用例：文書の保存・検索・削除

```ts
value(await vecdb.collection.create('demo-docs', { dimension: 3, metric: 'cosine' }))
value(await vecdb.vector.insert('demo-docs', [{ id: 'doc-1', vector: [1, 0, 0], content: 'Install' }]))
value(await vecdb.vector.count('demo-docs')) // 1
value(await vecdb.vector.upsert('demo-docs', [{ id: 'doc-1', vector: [1, 0, 0], content: 'Install v2' }]))
const matches = value(await vecdb.vector.search('demo-docs', [1, 0, 0], { topK: 1, minScore: 0.9 }))
// matches[0]: id 'doc-1', content 'Install v2', score approximately 1
const page = value(await vecdb.vector.scan('demo-docs', { limit: 32 }))
// page.items: [{ id: 'doc-1' }]; continue using nextCursor when present
value(await vecdb.vector.delete('demo-docs', ['doc-1'])) // undefined
value(await vecdb.vector.count('demo-docs')) // 0
```

保存済みと同じベクトルを検索するため、変換後のコサイン得点は約 1 です。本文は最後の upsert の値です。並行更新は scan に影響し、得点は百分率ではありません。

[引数と手順の詳細](vecdb.md#vectors)
