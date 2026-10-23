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
> `serverCommand`（既定は `chroma`）でローカルサービスを起動し、`vecdb.close` がそのプロセスを停止します。
> npm の任意依存 `chromadb` は HTTP クライアントです。サーバー CLI は別途インストールしてください。コマンドが利用できない場合、`init` は `CONNECTION_FAILED` を返します。

Chroma の `url` は `https://chroma.example.com:8443/` など HTTP(S) のルートエンドポイントのみを受け付け、`host/port` より優先されます。URL の認証情報、パス接頭辞、query、fragment は拒否します。`url` がない場合は `host/port` の HTTP 接続です。`chromadb 3.5.0` の `host/port/ssl/headers` を使用します。[公式 TypeScript クライアント](https://docs.trychroma.com/reference/typescript/client)を参照してください。

Chroma の任意の `apiKey` は、このモジュールの規約として `Authorization: Bearer <apiKey>` で送信します。同じ認証方式を使うセルフホストサービスやゲートウェイ向けです。リモートの認証情報には HTTPS を使用してください。空文字列は未設定を表し、非空値では空白、制御文字、非 ASCII 文字を拒否します。既定の tenant/database を使用し、Chroma Cloud のクライアントやテナント設定は提供しません。初期化は heartbeat の後にコレクション件数のデータエンドポイントも確認します。認証・権限エラーは `CONNECTION_FAILED` を返し、接続済み状態を公開しません。呼び出し側は `success` を確認してください。

直接接続の初期化全体の期限は 5 秒です。ローカルサービス起動では `startupTimeout` を使用します。期限を超えると候補 HTTP リクエストを中止します。成功時はタイマーを解除するため、この期限は以後の業務リクエストには適用されません。

Qdrant は `@qdrant/js-client-rest 1.18.0` の実際の型と Query API を使用し、名前のない単一ベクトルフィールドと cosine/euclidean/dot に対応します。外部の named-vector・Manhattan 集合の info・書き込み・検索は `CONFIG_ERROR` を返し、ゼロ次元や既定 cosine と推測しません。集合が存在しないと判断するのは HTTP 404 のみです。Provider の URL ログは core の共通マスク処理を使います。

Chroma の metadata/filter は `chromadb 3.5.0` の検証に従います。不正値は操作エラーとなり、フィルターの削除や無条件検索にはフォールバックしません。content は省略でき、検索結果は `undefined` のままです。内部書き込みでは SDK の文字列フィールドに合わせます。null・複雑なメタデータ・フィルターの意味はバックエンドごとに確認してください。

LanceDB は次元数を Arrow の固定長 vector フィールドに、集合の metric を同じ schema の metadata に永続化し、空の集合も復元できます。`collection.create` の metric を優先し、接続設定は新規集合の既定値としてのみ使用します。再起動や既定値の変更で既存の集合は変わりません。各操作は永続 schema と他の接続のコミットを確認します。定義が欠落・不正な場合は `CONFIG_ERROR` を返し、仮のベクトルによる推測はしません。定義のない旧形式・外部テーブルは再作成してください。互換推定は提供しません。

LanceDB はローカルファイルを使う組み込みバックエンドです。同じ永続ディレクトリと LanceDB の並行コミットを支えるファイルシステムを使うプロセス間のみでデータを共有します。別ノードの同名ローカルパスは共有されません。分散サービスには pgvector、Qdrant、Chroma サーバーを推奨します。AI Knowledge は reldb と vecdb の両方を永続化し、同じ業務データセットに接続してください。embedding 次元を変更する場合は集合の再作成が必要です。

検索は集合の metric を使い、`euclidean` を LanceDB の `l2` に対応させます。score は公開 API の 0–1、高いほど類似する契約に従い、cosine は `clamp(1 - distance / 2, 0, 1)`、euclidean は `1 / (1 + squaredL2)`、dot は順位を保つ `sigmoid(dotProduct)` を使います（確率ではありません）。`minScore` は変換後に適用し、異なる metric・バックエンド間で閾値が共通に校正されているとは扱いません。

原子書き込みの検証対象は `@lancedb/lancedb 0.40.0 / Lance 13` です。新規集合は初期 Arrow schema で id を非 null 主キーにし、insert/upsert は id を使う原生 merge の厳密なキー競合検出を使用します。根拠：[Lance 13 table format](https://github.com/lance-format/lance/blob/v13.0.0/docs/src/format/table/index.md#unenforced-primary-key)、[Lance 13 transaction](https://github.com/lance-format/lance/blob/v13.0.0/protos/transaction.proto)、[Node binding 0.40.0](https://github.com/lancedb/lancedb/blob/v0.40.0/nodejs/lancedb/table.ts)。

LanceDB の `insert` は既存 ID を上書きせず、`upsert` は追加または行全体を置換します。バッチ内の重複 ID、merge 能力・永続主キーの欠落は書き込み前に `CONFIG_ERROR` を返します。旧形式の集合は再作成が必要で、自動移行や削除はしません。原子性は各 merge に限られ、並行処理の勝者はコミット順で決まります。複数 merge や reldb/vecdb 間の共通トランザクションはありません。delete/add への切り替えはなく、不明な結果は ID で照合します。外部の原生 add はこの保護を迂回します。

LanceDB の `metadata` はネイティブ JSON フィールドです。入れ子の JSON を保存でき、検索結果ではオブジェクトに復元します。insert/upsert とも明示的な Arrow JSON schema で JSONB に変換します。旧 Utf8 metadata テーブルへの書き込み・フィルターは `CONFIG_ERROR` を返し、再作成が必要です。自動移行はしません。

LanceDB の `filter` は最上位のリテラルキーを AND で完全一致させます。例：`{ tenant: 'acme', page: 1, active: true, removedAt: null }`。値は文字列・有限数値・真偽値・null のみで、`1` と `'1'`、`true` と `'true'` を区別します。null は明示的な JSON null のみに一致し、欠落キーには一致しません。点や括弧はパスではなくキー文字です。引用符・バックスラッシュ・`%`・`_` に SQL/ワイルドカードの意味はありません。空オブジェクトは制限なしです。オブジェクト・配列・undefined・非有限数値は `CONFIG_ERROR` を返し、無条件検索に変更しません。フィルターはベクトル topK の前、minScore はその後に適用します。他の Provider の null・複合値・パスの意味は同一とは保証しません。バックエンド変更時は固有の制約を確認してください。根拠：[Lance 13 JSON UDF](https://github.com/lance-format/lance/blob/v13.0.0/rust/lance-datafusion/src/udf/json.rs)、[Node 0.40.0 JSON field](https://github.com/lancedb/lancedb/blob/v0.40.0/nodejs/lancedb/arrow.ts)。

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

Qdrant の `insert/upsert/delete` は `wait: true` を使用し、成功はサーバーでの適用完了を表します。`vector.count` は集合情報の近似値ではなく正確な件数を取得します。複数操作をまとめたトランザクションではありません。

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

## 本番の共有状態

本番は Qdrant・pgvector・リモート Chroma を使います。LanceDB と組み込み Chroma は開発・明示的テスト用です。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../docs/distributed-state.md)。

## 終了と失敗からの回復

close は取得済みの操作参照も含めて業務処理を停止します。初期化や終了に失敗したリソースは後処理の所有権だけを保持します。同時 close は統合し、実行中の init の所有権確定を待ちます。error.ext.cleanupPending があれば同じモジュールの close を再試行し、後処理が成功するまで init は代替リソースを作成しません。内嵌 Chroma は実際の spawn と直接子プロセスの exit を確認します。通常終了から1.5秒後に強制終了へ進み、さらに1.5秒待っても確認できなければハンドルを保持して失敗を返します。直接子プロセスの検証はプロセスツリー全体や実際の Chroma CLI 起動の証明ではありません。

ソースの JSDoc は[共通規約](../../docs/module-jsdoc.md)に従います。公開例は実際の公開入口、内部例は元のモジュールスコープで型検査します。ビルド後に `pnpm check:jsdoc --package vecdb` を実行してください。例の型検査は実バックエンドの動作検証の代わりにはなりません。

## ライセンス

Apache-2.0
