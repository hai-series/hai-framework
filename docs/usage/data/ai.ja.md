# @h-ai/ai データ構造

[简体中文](ai.md) · [English](ai.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/ai.ja.md) · [API リファレンス](../function/ai.ja.md)

ユーザーが会話を開き直すと、AI はユーザー ID とセッション ID でメタデータと履歴を読み、次の応答に必要なコンテキストを組み立てます。リレーショナルストレージを使うと記録が再起動後も残り、記憶やナレッジのベクトル索引は設定先に保存されます。

<a id="data-fields"></a>

<a id="database"></a>

## データベース

組み込みの RelDB ストアは最大 30 テーブルを作成します。A2A の 3 テーブルは A2A を設定した場合に作成します。Mem0 を選ぶと組み込みの記憶用テーブルは作成しません。`ai.init(config, { storeProvider })` で独自のストアも使えます。プロセス内ストアの記録は停止時に消えます。

| テーブル | 用途 |
| --- | --- |
| [`hai_ai_chat_records`](#table-hai-ai-chat-records) | モデルへのリクエスト、応答、使用量を確認します。 |
| [`hai_ai_sessions`](#table-hai-ai-sessions) | 利用者の会話を一覧にします。 |
| [`hai_ai_context`](#table-hai-ai-context) | 次のモデル応答に使うコンテキストを復元します。 |
| [`hai_ai_persona`](#table-hai-ai-persona) | 選べるペルソナとプロンプトを読み込みます。 |
| [`hai_ai_llm_models`](#table-hai-ai-llm-models) | 実行時に会話モデルを登録します。 |
| [`hai_ai_audio_models`](#table-hai-ai-audio-models) | 実行時に音声モデルを登録します。 |
| [`hai_ai_image_models`](#table-hai-ai-image-models) | 実行時に画像モデルを登録します。 |
| [`hai_ai_mcp_servers`](#table-hai-ai-mcp-servers) | 登録済みの外部ツールサービスを確認します。 |
| [`hai_ai_retrieval_sources`](#table-hai-ai-retrieval-sources) | 検索できる情報源を確認します。 |
| [`hai_ai_memory`](#table-hai-ai-memory) | 会話をまたいで覚えておく情報を保存します。 |
| [`hai_ai_memory_vector_outbox`](#table-hai-ai-memory-vector-outbox) | 更新や削除が必要な記憶ベクトルを見つけます。 |
| [`hai_ai_memory_vector_namespace`](#table-hai-ai-memory-vector-namespace) | アプリ専用の記憶ベクトルコレクションの所属を保存します。 |
| [`hai_ai_memory_vector_scan`](#table-hai-ai-memory-vector-scan) | 前回のベクトル索引点検を再開します。 |
| [`hai_ai_knowledge_documents`](#table-hai-ai-knowledge-documents) | ナレッジ文書の公開版を確認します。 |
| [`hai_ai_knowledge_collections`](#table-hai-ai-knowledge-collections) | ナレッジコレクションの次元、世代、公開状態を確認します。 |
| [`hai_ai_a2a_journal`](#table-hai-ai-a2a-journal) | エージェント作業の進捗、イベント、メッセージの受領記録を復元します。 |
| [`hai_ai_a2a_contexts`](#table-hai-ai-a2a-contexts) | エージェント会話の所有者を確認します。 |
| [`hai_ai_a2a_messages`](#table-hai-ai-a2a-messages) | 作業で送られたメッセージを取得します。 |
| [`hai_ai_acp_workspaces`](#table-hai-ai-acp-workspaces) | エージェントが使えるプロジェクトとリポジトリを確認します。 |
| [`hai_ai_acp_agents`](#table-hai-ai-acp-agents) | 起動できるコーディングエージェントと接続方法を確認します。 |
| [`hai_ai_acp_sessions`](#table-hai-ai-acp-sessions) | 会話のプロジェクト、ネイティブ ID、実行資源を確認します。 |
| [`hai_ai_acp_locks`](#table-hai-ai-acp-locks) | 同じ会話資源への変更を調整します。 |
| [`hai_ai_acp_managed_sessions`](#table-hai-ai-acp-managed-sessions) | アプリの会話を実行側に紐付けます。 |
| [`hai_ai_acp_managed_requests`](#table-hai-ai-acp-managed-requests) | 同じ提出かを照合します。 |
| [`hai_ai_acp_managed_approvals`](#table-hai-ai-acp-managed-approvals) | 承認待ちの操作を確認します。 |
| [`hai_ai_acp_managed_grants`](#table-hai-ai-acp-managed-grants) | 再利用できる許可範囲と期限を確認します。 |
| [`hai_ai_acp_managed_receipts`](#table-hai-ai-acp-managed-receipts) | 復旧時に元の呼び出し側と実行側の範囲を確認します。 |
| [`hai_ai_memory_write_gate`](#table-hai-ai-memory-write-gate) | ノード間で記憶の更新を調整します。 |
| [`hai_ai_memory_vector_namespace_write_gate`](#table-hai-ai-memory-vector-namespace-write-gate) | ベクトルコレクションの所属の登録を調整します。 |
| [`hai_ai_memory_vector_scan_write_gate`](#table-hai-ai-memory-vector-scan-write-gate) | ベクトル索引点検のカーソル更新を調整します。 |

<a id="example-data"></a>

### データベースのレコード ID・版・本文

各レコードに `id`・`version`・`data`・時刻があり、業務データは `data` に入ります。以下は会話レコードの項目の抜粋で、作成・更新時刻は Unix ミリ秒です。

```json
{
  "id": "session-42",
  "version": "6fdb3344-5197-490b-a36d-2d43ce7cc3ba",
  "data": {
    "sessionId": "session-42",
    "objectId": "user-42",
    "title": "Shipping question",
    "createdAt": 1794873600000,
    "updatedAt": 1794873600000
  },
  "object_id": "user-42",
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

`user-42` の `session-42` を保存しています。更新時に `version` を照合すると、その間の変更を検出できます。

<a id="table-hai-ai-chat-records"></a>

### `hai_ai_chat_records`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `chat-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `request` はモデルへの入力、`response` は応答、ツール呼び出し、使用量です。 | [業務データの例](#モデル呼び出し1回の履歴) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所有主体。主体別の検索索引があります。 | `user-42` |
| `session_id` | `TEXT` | 可 | — | 会話 ID。単独と主体との組に索引があります。 | `session-42` |

<a id="モデル呼び出し1回の履歴"></a>

#### 例 · モデル呼び出し1回の履歴

要求と応答を履歴や使用量確認のために保存し、現在の文脈とは分けます。

```json
{
  "id": "chat-42",
  "objectId": "user-42",
  "sessionId": "session-42",
  "createdAt": 1794873600000,
  "duration": 25
}
```

chat-42 は25ミリ秒で、機密になり得る本文は省略しています。

<a id="table-hai-ai-sessions"></a>

### `hai_ai_sessions`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `<session-key>` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `sessionId` と `objectId` で会話を所有者に紐付けます。`title` と `metadata` は表示情報です。`deleted` は古い書き込みによる復元を防ぎます。 | [業務データの例](#利用者の会話一覧) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所有主体。主体別の検索索引があります。 | `user-42` |

<a id="利用者の会話一覧"></a>

#### 例 · 利用者の会話一覧

既存会話を再度開けるよう、所有者・題名・時刻を保存します。

```json
{
  "sessionId": "session-42",
  "objectId": "user-42",
  "title": "Shipping question",
  "createdAt": 1794873600000,
  "updatedAt": 1794873600000
}
```

題名 Shipping question の一覧情報で、全文ではありません。

<a id="table-hai-ai-context"></a>

### `hai_ai_context`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `<session-key>` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `scope` は所有範囲、`messages`、`summaries`、`turns` は会話で初期値は空配列です。`epoch` はリセット世代、`active` は生成中や保存待ちのターンです。 | [業務データの例](#次の応答に使う文脈) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所有主体。主体別の検索索引があります。 | `user-42` |
| `session_id` | `TEXT` | 可 | — | 会話 ID。単独と主体との組に索引があります。 | `session-42` |

<a id="次の応答に使う文脈"></a>

#### 例 · 次の応答に使う文脈

再開に必要なメッセージ・要約・ターンを保存し、リセット後の古い書き込みを防ぎます。

```json
{
  "messages": [],
  "summaries": [],
  "turns": [],
  "epoch": "epoch-42",
  "updatedAt": 1794873600000
}
```

空配列は未保存、epoch は会話状態の世代です。

<a id="table-hai-ai-persona"></a>

### `hai_ai_persona`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `persona-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `name`、`systemPrompt`、`traits` は名前、システムプロンプト、スタイルを保持します。`metadata` に追加情報を保存できます。 | [業務データの例](#繰り返し使う-ai-の役柄) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所有主体。主体別の検索索引があります。 | `user-42` |

<a id="繰り返し使う-ai-の役柄"></a>

#### 例 · 繰り返し使う AI の役柄

役柄の指示や口調を保存して会話で選びます。

```json
{
  "id": "persona-42",
  "objectId": "user-42",
  "name": "Support",
  "systemPrompt": "Explain the shipping policy.",
  "createdAt": 1794873600000,
  "updatedAt": 1794873600000
}
```

user-42 の Support 役で、保存だけではモデルを呼び出しません。

<a id="table-hai-ai-llm-models"></a>

### `hai_ai_llm_models`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `chat-model` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `id` でモデルを識別し、ほかの項目にプロトコル、モデル名、接続設定を保存します。 | [業務データの例](#登録した対話モデル) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="登録した対話モデル"></a>

#### 例 · 登録した対話モデル

モデル ID に対応する接続や設定を共有します。

```json
{
  "id": "chat-model"
}
```

chat-model は登録番号で、接続・秘密情報は省略し、ID だけでは接続できません。

<a id="table-hai-ai-audio-models"></a>

### `hai_ai_audio_models`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `audio-model` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | 文字起こしや音声合成モデルの定義で、ID と接続設定を持ちます。 | [業務データの例](#登録した音声モデル) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="登録した音声モデル"></a>

#### 例 · 登録した音声モデル

認識・合成に使えるモデルを登録します。

```json
{
  "id": "speech-model"
}
```

speech-model は例の ID で、対応操作や接続の詳細は省略しています。

<a id="table-hai-ai-image-models"></a>

### `hai_ai_image_models`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `image-model` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | 画像モデル ID、サービスへの接続、既定のパラメーター。 | [業務データの例](#登録した画像モデル) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="登録した画像モデル"></a>

#### 例 · 登録した画像モデル

画像生成・編集用のモデルを登録します。

```json
{
  "id": "image-model"
}
```

image-model は登録 ID で、生成済み画像や画像バイトではありません。

<a id="table-hai-ai-mcp-servers"></a>

### `hai_ai_mcp_servers`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `tools-server` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | 外部 MCP サーバーの接続方式、アドレス、呼び出し設定。 | [業務データの例](#接続する外部ツールサービス) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="接続する外部ツールサービス"></a>

#### 例 · 接続する外部ツールサービス

MCP サービスの接続先や認証設定を登録します。

```json
{
  "id": "mcp-docs"
}
```

mcp-docs はサービス ID で、秘密はツール一覧やモデルへ送りません。

<a id="table-hai-ai-retrieval-sources"></a>

### `hai_ai_retrieval_sources`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `support-source` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | 検索元の ID、種類、接続設定。 | [業務データの例](#資料を検索する信源) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

同じ ID が起動設定とデータベースにあれば、起動時の定義を使います。`__deleted` は実行時登録の削除を示します。認証情報はサーバー側で扱います。

<a id="資料を検索する信源"></a>

#### 例 · 資料を検索する信源

検索する資料の信源を登録します。

```json
{
  "id": "docs-source"
}
```

docs-source は信源 ID で、取得済み本文ではありません。接続先は完全な記録にあります。

<a id="table-hai-ai-memory"></a>

### `hai_ai_memory`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `memory-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `content`、`type`、`importance` は内容、種類、重要度です。範囲、参照回数、ベクトルとその版も保持できます。 | [業務データの例](#会話をまたいで覚える内容) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所有主体。主体別の検索索引があります。 | `user-42` |

記憶の検索には関係テーブルの現在の版が指すベクトルを使います。PostgreSQL は範囲を JSONB GIN で索引化します。MySQL は `data.vectorId` から生成する NULL 許容の `VARCHAR(512)` 列 `memory_vector_key` に索引を設定します。ベクトルがありリビジョン ID がないレコードは、記憶の業務キー `id` を使います。

<a id="会話をまたいで覚える内容"></a>

#### 例 · 会話をまたいで覚える内容

許可された事実や好みを保存して後の会話で使います。

```json
{
  "id": "memory-42",
  "objectId": "user-42",
  "content": "Prefers concise answers",
  "importance": 0.7,
  "createdAt": 1794873600000,
  "lastAccessedAt": 1794873600000,
  "accessCount": 0
}
```

user-42 が簡潔な回答を好む記憶で、重要度0.7、参照0回です。全文履歴とは別です。

<a id="table-hai-ai-memory-vector-outbox"></a>

### `hai_ai_memory_vector_outbox`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `memory-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `memoryId`、`updatedAt`、`attempts` は作業の対象、時刻、試行回数です。`token`、`retireUntil`、`cooldown` は取得、延期、間隔の調整に使います。 | [業務データの例](#検索索引へ同期すべき記憶) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

バックグラウンド処理は `(updated_at, id)` の索引でページを取得します。

<a id="検索索引へ同期すべき記憶"></a>

#### 例 · 検索索引へ同期すべき記憶

本文更新と索引更新の失敗を分け、後で補完する作業を残します。

```json
{
  "memoryId": "memory-42",
  "updatedAt": 1794873600000,
  "attempts": 0
}
```

memory-42 は同期待ち・未試行で、記憶本文の複製ではありません。

<a id="table-hai-ai-memory-vector-namespace"></a>

### `hai_ai_memory_vector_namespace`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `namespace` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `namespace` と `owner` でアプリ専用のベクトルコレクションを特定します。 | [業務データの例](#記憶を書き込むベクトル空間) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="記憶を書き込むベクトル空間"></a>

#### 例 · 記憶を書き込むベクトル空間

関係データベースにコレクションの所属を一件登録し、アプリの全インスタンスが共有します。

```json
{
  "namespace": "orders",
  "owner": "688b8ef73cac470fbea1e0bfcbf0eed0"
}
```

このレコードは `hai_m_orders_688b8ef73cac470fbea1e0bfcbf0eed0` を特定します。同じ名前空間でも、別の関係データベースを使うアプリは異なる `owner` を登録します。

<a id="table-hai-ai-memory-vector-scan"></a>

### `hai_ai_memory_vector_scan`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `scan` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | コレクション、カーソル、取得状態を保持します。`updatedAt` は次回取得時刻か現在の取得期限です。 | [業務データの例](#索引点検の前回位置) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="索引点検の前回位置"></a>

#### 例 · 索引点検の前回位置

索引を分割点検し、毎回最初から走査しないための進捗です。

```json
{
  "updatedAt": 1794873600000,
  "collection": "hai_ai_memory",
  "cursor": "memory-42",
  "leased": true
}
```

collection と cursor が再開位置で、leased 時の updatedAt は担当期限です。

<a id="table-hai-ai-knowledge-documents"></a>

### `hai_ai_knowledge_documents`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `<document-key>` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `current` は公開済みの本文、チャンク、エンティティ、`pending` は公開待ち、`garbage` は外部索引から削除する版です。 | [業務データの例](#知識文書の公開版) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所属のナレッジコレクション。集合別の検索に使います。 | `hai_ai_knowledge` |
| `session_id` | `TEXT` | 可 | — | コレクションの世代。コレクション名との組で検索します。 | `generation-42` |

<a id="知識文書の公開版"></a>

#### 例 · 知識文書の公開版

本文・分割・ベクトルを同じ公開版として扱うための記録です。

```json
{
  "collection": "hai_ai_knowledge",
  "generation": "generation-42",
  "documentId": "doc-42"
}
```

doc-42 の世代を特定する抜粋で、行があるだけで公開済みとは判断しません。

<a id="table-hai-ai-knowledge-collections"></a>

### `hai_ai_knowledge_collections`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `hai_ai_knowledge` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `collection` と `dimension` は名前と次元、`generation` と `deleted` は参照できる世代を決めます。 | [業務データの例](#知識文書をまとめる集合) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="知識文書をまとめる集合"></a>

#### 例 · 知識文書をまとめる集合

次元と世代で再構築前の結果や遅れた書き込みを分けます。

```json
{
  "collection": "hai_ai_knowledge",
  "dimension": 3,
  "generation": "generation-42",
  "deleted": false
}
```

現在は3次元の generation-42 で、削除されていません。

<a id="table-hai-ai-a2a-journal"></a>

### `hai_ai_a2a_journal`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `task-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `owner`、`executionId`、`leasedUntil`、`deadline` は担当と期限、タスク、イベント、受領記録、メッセージ、結果は進捗を記録します。 | [業務データの例](#エージェント作業の進捗) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所有主体。主体別の検索索引があります。 | `user-42` |
| `ref_id` | `TEXT` | 可 | — | 関連コンテキスト ID。タスクの検索索引があります。 | `context-42` |

A2A は共有ストアの時計で期限を判断し、イベントの保存時にレコードの版を照合します。完了したメッセージの受領記録に自動削除期限はありません。

<a id="エージェント作業の進捗"></a>

#### 例 · エージェント作業の進捗

切断やノード変更後も状態と配達済み情報を確認する記録です。

```json
{
  "owner": "user-42",
  "executionId": "execution-42",
  "leasedUntil": 1794873630000,
  "deadline": 1794873660000,
  "events": [],
  "finished": false
}
```

execution-42 は未完了で、担当期限と全体期限が別々にあります。

<a id="table-hai-ai-a2a-contexts"></a>

### `hai_ai_a2a_contexts`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `context-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `owner` はこのコンテキストの信頼済み主体です。 | [業務データの例](#エージェント会話の所有者) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="エージェント会話の所有者"></a>

#### 例 · エージェント会話の所有者

context を主体に結び、ID だけで他人の作業を読ませないための情報です。

```json
{
  "owner": "user-42"
}
```

user-42 の所有で、会話本文や他者への許可ではありません。

<a id="table-hai-ai-a2a-messages"></a>

### `hai_ai_a2a_messages`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `message-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | メッセージ ID、タスク、任意のコンテキスト、送信側の役割、パート、作成時刻。 | [業務データの例](#エージェント作業のメッセージ) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |
| `object_id` | `TEXT` | 可 | — | 所有主体。主体別の検索索引があります。 | `user-42` |
| `status` | `TEXT` | 可 | — | 関連タスクの状態。絞り込み用の索引があります。 | `completed` |

<a id="エージェント作業のメッセージ"></a>

#### 例 · エージェント作業のメッセージ

利用者やエージェントのメッセージを作業に結びます。

```json
{
  "id": "message-42",
  "taskId": "task-42",
  "role": "user",
  "parts": [
    {
      "kind": "text",
      "text": "Shipping policy?"
    }
  ],
  "createdAt": 1794873600000
}
```

task-42 に利用者が配送方針を尋ねた例です。

<a id="table-hai-ai-acp-workspaces"></a>

### `hai_ai_acp_workspaces`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `project` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | 保存先やアクセス可能なリポジトリを含む作業空間の定義。 | [業務データの例](#エージェントが使う作業空間) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="エージェントが使う作業空間"></a>

#### 例 · エージェントが使う作業空間

許可済みの作業区とリポジトリを登録します。

```json
{
  "id": "workspace-42"
}
```

workspace-42 は登録 ID で、会話や実行中プロセスではありません。

<a id="table-hai-ai-acp-agents"></a>

### `hai_ai_acp_agents`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `coder` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | 実行モード、アダプター、モデル、許可環境を含むエージェント定義。 | [業務データの例](#起動できるコーディングエージェント) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="起動できるコーディングエージェント"></a>

#### 例 · 起動できるコーディングエージェント

種類や起動・接続方法を登録します。

```json
{
  "id": "agent-42"
}
```

agent-42 は定義番号で、登録だけでは実行を開始しません。

<a id="table-hai-ai-acp-sessions"></a>

### `hai_ai_acp_sessions`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `session-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | エージェント、作業空間、リポジトリ、ブランチ、モデル、MCP、現在のコンテナ。明示的な再開に成功すると `nativeId` を更新します。 | [業務データの例](#エージェント会話に結ぶプロジェクトと資源) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="エージェント会話に結ぶプロジェクトと資源"></a>

#### 例 · エージェント会話に結ぶプロジェクトと資源

再接続時に同じ環境を見つけるための関連です。

```json
{
  "id": "acp-session-42",
  "agentId": "agent-42",
  "workspaceId": "workspace-42",
  "cwd": "/workspace/orders"
}
```

指定パスは管理環境内で、公開 URL ではありません。

<a id="table-hai-ai-acp-locks"></a>

### `hai_ai_acp_locks`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `session-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `owner` は現在の資源操作の取得者で、空の場合もあります。 | [業務データの例](#同じ会話資源の同時変更を避ける) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

<a id="同じ会話資源の同時変更を避ける"></a>

#### 例 · 同じ会話資源の同時変更を避ける

開始・復旧・解放時の操作担当を一時保存します。

```json
{
  "owner": null
}
```

owner:null は操作担当なしで、利用権や削除済みの証明ではありません。

<a id="table-hai-ai-acp-managed-sessions"></a>

### `hai_ai_acp_managed_sessions`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `session-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `scope`、`workerScope`、`workerId` は呼び出し元と実行側の紐付け、`request`、`mode`、任意の履歴とフラグは実行状態です。 | [業務データの例](#アプリ会話と実行側を結ぶ) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

バックグラウンド処理は `(updated_at, id)` の索引でページを取得します。

<a id="アプリ会話と実行側を結ぶ"></a>

#### 例 · アプリ会話と実行側を結ぶ

呼び出し側と実行側の範囲・参照を保存します。

```json
{
  "workerId": "worker-42",
  "mode": "shared"
}
```

worker-42 は実行側番号で shared モードですが、番号だけではアクセスできません。

<a id="table-hai-ai-acp-managed-requests"></a>

### `hai_ai_acp_managed_requests`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `<request-key>` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `fingerprint` で同じリクエスト ID の内容が一致するか確認します。 | [業務データの例](#同じ提出かを判別) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

バックグラウンド処理は `(updated_at, id)` の索引でページを取得します。

<a id="同じ提出かを判別"></a>

#### 例 · 同じ提出かを判別

同じ番号に別の操作を載せる再試行を検出します。

```json
{
  "fingerprint": "<request-digest>"
}
```

fingerprint は内容の摘要で、入力文や応答本文ではありません。

<a id="table-hai-ai-acp-managed-approvals"></a>

### `hai_ai_acp_managed_approvals`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `approval-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `scope` と `sessionId` は所有範囲、`deadline` は承認期限、`decision` は結果です。 | [業務データの例](#人の承認を待つ操作) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

バックグラウンド処理は `(updated_at, id)` の索引でページを取得します。

<a id="人の承認を待つ操作"></a>

#### 例 · 人の承認を待つ操作

承認待ちと期限を共有し、別ノードでも判断できるようにします。

```json
{
  "sessionId": "acp-session-42",
  "deadline": 1794873660000
}
```

decision がないので未承認で、期限経過も同意を意味しません。

<a id="table-hai-ai-acp-managed-grants"></a>

### `hai_ai_acp_managed_grants`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `grant-42` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `id`、`scopeKey`、`summary` は許可の識別情報です。`sessionId` で会話を絞り、`expires` と `revoked` で有効性を判断します。 | [業務データの例](#後で再利用できる許可範囲) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

バックグラウンド処理は `(updated_at, id)` の索引でページを取得します。

<a id="後で再利用できる許可範囲"></a>

#### 例 · 後で再利用できる許可範囲

継続許可の範囲を保存し、毎回主体・会話・期限を確認します。

```json
{
  "id": "grant-42",
  "scopeKey": "scope-42",
  "summary": "Read project files",
  "expires": 1794873660000
}
```

プロジェクト読取の限定許可で、任意操作への永久許可ではありません。

<a id="table-hai-ai-acp-managed-receipts"></a>

### `hai_ai_acp_managed_receipts`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | このレコードの主キー。 | `<execution-key>` |
| `version` | `VARCHAR(36)` | 不可 | — | 今回の書き込み版。間に他の更新があったか確認します。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 不可 | — | `scope` と `workerScope` に元の呼び出し範囲と実行範囲を保存します。 | [業務データの例](#復旧時に元の呼び出し範囲を確認) |
| `created_at` | `BIGINT` | 不可 | — | 作成時刻。Unix ミリ秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。Unix ミリ秒。 | `1794873600000` |

バックグラウンド処理は `(updated_at, id)` の索引でページを取得します。

<a id="復旧時に元の呼び出し範囲を確認"></a>

#### 例 · 復旧時に元の呼び出し範囲を確認

復旧しても元の主体を確認する関連情報です。

```json
{
  "scope": {
    "tenantId": "team-1",
    "userId": "user-42"
  },
  "workerScope": {
    "tenantId": "team-1",
    "userId": "user-42"
  }
}
```

両 scope は team-1 の user-42 で、別主体は番号だけで結果を読めません。

<a id="table-hai-ai-memory-write-gate"></a>

### `hai_ai_memory_write_gate`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | — | 初期化で挿入する一行の固定主キー。 | `1` |
| `marker` | `INTEGER` | 不可 | — | 初期値は `0`。書き込み時に `0` と `1` を切り替えて行をロックします。 | `0` |

<a id="記憶書き込みを調整"></a>

#### 例 · 記憶書き込みを調整

各ノードはトランザクション内でこの行をロックしてから記憶の書き込みを確定します。

```json
{
  "id": 1,
  "marker": 0
}
```

id:1 の1行で、marker:0 は初期値です。本文や処理件数ではありません。

<a id="table-hai-ai-memory-vector-namespace-write-gate"></a>

### `hai_ai_memory_vector_namespace_write_gate`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | — | 初期化で挿入する一行の固定主キー。 | `1` |
| `marker` | `INTEGER` | 不可 | — | 初期値は `0`。書き込み時に `0` と `1` を切り替えて行をロックします。 | `0` |

<a id="索引の所属の登録を調整"></a>

#### 例 · 索引の所属の登録を調整

初回起動時にこの行をロックし、各ノードが同じコレクションの所属を使います。

```json
{
  "id": 1,
  "marker": 0
}
```

id:1 の1行で、marker:0 は初期値です。本文や処理件数ではありません。

<a id="table-hai-ai-memory-vector-scan-write-gate"></a>

### `hai_ai_memory_vector_scan_write_gate`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | — | 初期化で挿入する一行の固定主キー。 | `1` |
| `marker` | `INTEGER` | 不可 | — | 初期値は `0`。書き込み時に `0` と `1` を切り替えて行をロックします。 | `0` |

<a id="点検進捗の更新を調整"></a>

#### 例 · 点検進捗の更新を調整

各ノードは点検カーソルを更新する際にこの行をロックします。

```json
{
  "id": 1,
  "marker": 0
}
```

id:1 の1行で、marker:0 は初期値です。本文や処理件数ではありません。

<a id="vector-collections"></a>

## ベクトルコレクション

ナレッジベクトルの既定の保存先は [VecDB](vecdb.ja.md) の `hai_ai_knowledge` コレクションです。検索は公開済みの文書の版だけを読みます。組み込みの記憶は通常 `hai_ai_memory`、名前空間を紐付けた場合は対応するコレクションを使います。Mem0 のベクトルは Mem0 が管理します。ACP の実行とイベントのテーブルは [Runner](runner.ja.md) が管理します。

AI は Redis キーを作成しません。モデル、ツールへの接続と実行オブジェクトはプロセス内に置き、再起動時に再作成します。ブラウザーからリアルタイム音声への接続に使うチケットは [IAM](iam.ja.md) が管理します。
