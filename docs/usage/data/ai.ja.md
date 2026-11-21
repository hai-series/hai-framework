# @h-ai/ai データ構造

<!-- translation: partial -->

[原文（中国語）](ai.md) · [設定](../configuration/ai.ja.md) · [API リファレンス](../function/ai.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### データベースのレコード ID・版・本文

対応する構造：標準の関係データベーステーブルの共通項目。

各レコードに `id`・`version`・`data`・時刻があり、業務データは `data` に入ります。以下は会話レコードの項目の抜粋で、作成・更新時刻は Unix ミリ秒です。

```json
{
  "id": "session-42",
  "version": "version-42",
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

user-42 の session-42 で、version は他処理の変更を検出します。SQLite では JSON テキストとして保存します。

### モデル呼び出し1回の履歴

対応する構造：`hai_ai_chat_records`。

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

### 利用者の会話一覧

対応する構造：`hai_ai_sessions`。

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

### 次の応答に使う文脈

対応する構造：`hai_ai_context`。

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

### 繰り返し使う AI の役柄

対応する構造：`hai_ai_persona`。

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

### 登録した対話モデル

対応する構造：`hai_ai_llm_models`。

モデル ID に対応する接続や設定を共有します。

```json
{
  "id": "chat-model"
}
```

chat-model は登録番号で、接続・秘密情報は省略し、ID だけでは接続できません。

### 登録した音声モデル

対応する構造：`hai_ai_audio_models`。

認識・合成に使えるモデルを登録します。

```json
{
  "id": "speech-model"
}
```

speech-model は例の ID で、対応操作や接続の詳細は省略しています。

### 登録した画像モデル

対応する構造：`hai_ai_image_models`。

画像生成・編集用のモデルを登録します。

```json
{
  "id": "image-model"
}
```

image-model は登録 ID で、生成済み画像や画像バイトではありません。

### 接続する外部ツールサービス

対応する構造：`hai_ai_mcp_servers`。

MCP サービスの接続先や認証設定を登録します。

```json
{
  "id": "mcp-docs"
}
```

mcp-docs はサービス ID で、秘密はツール一覧やモデルへ送りません。

### 資料を検索する信源

対応する構造：`hai_ai_retrieval_sources`。

検索する資料の信源を登録します。

```json
{
  "id": "docs-source"
}
```

docs-source は信源 ID で、取得済み本文ではありません。接続先は完全な記録にあります。

### 会話をまたいで覚える内容

対応する構造：`hai_ai_memory`。

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

### 検索索引へ同期すべき記憶

対応する構造：`hai_ai_memory_vector_outbox`。

本文更新と索引更新の失敗を分け、後で補完する作業を残します。

```json
{
  "memoryId": "memory-42",
  "updatedAt": 1794873600000,
  "attempts": 0
}
```

memory-42 は同期待ち・未試行で、記憶本文の複製ではありません。

### 記憶を書き込むベクトル空間

対応する構造：`hai_ai_memory_vector_namespace`。

所属空間と移行進捗を保存し、別の展開で索引を取り違えないようにします。

```json
{
  "updatedAt": 1794873600000,
  "namespace": "orders",
  "owner": "namespace-owner-42",
  "migrated": true
}
```

orders の所属情報で、migrated:true は移行完了です。

### 索引点検の前回位置

対応する構造：`hai_ai_memory_vector_scan`。

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

### 知識文書の公開版

対応する構造：`hai_ai_knowledge_documents`。

本文・分割・ベクトルを同じ公開版として扱うための記録です。

```json
{
  "collection": "hai_ai_knowledge",
  "generation": "generation-42",
  "documentId": "doc-42"
}
```

doc-42 の世代を特定する抜粋で、行があるだけで公開済みとは判断しません。

### 知識文書をまとめる集合

対応する構造：`hai_ai_knowledge_collections`。

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

### エージェント作業の進捗

対応する構造：`hai_ai_a2a_journal`。

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

### エージェント会話の所有者

対応する構造：`hai_ai_a2a_contexts`。

context を主体に結び、ID だけで他人の作業を読ませないための情報です。

```json
{
  "owner": "user-42"
}
```

user-42 の所有で、会話本文や他者への許可ではありません。

### エージェント作業のメッセージ

対応する構造：`hai_ai_a2a_messages`。

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

### エージェントが使う作業空間

対応する構造：`hai_ai_acp_workspaces`。

許可済みの作業区とリポジトリを登録します。

```json
{
  "id": "workspace-42"
}
```

workspace-42 は登録 ID で、会話や実行中プロセスではありません。

### 起動できるコーディングエージェント

対応する構造：`hai_ai_acp_agents`。

種類や起動・接続方法を登録します。

```json
{
  "id": "agent-42"
}
```

agent-42 は定義番号で、登録だけでは実行を開始しません。

### エージェント会話に結ぶプロジェクトと資源

対応する構造：`hai_ai_acp_sessions`。

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

### 同じ会話資源の同時変更を避ける

対応する構造：`hai_ai_acp_locks`。

開始・復旧・解放時の操作担当を一時保存します。

```json
{
  "owner": null
}
```

owner:null は操作担当なしで、利用権や削除済みの証明ではありません。

### アプリ会話と実行側を結ぶ

対応する構造：`hai_ai_acp_managed_sessions`。

呼び出し側と実行側の範囲・参照を保存します。

```json
{
  "workerId": "worker-42",
  "mode": "shared"
}
```

worker-42 は実行側番号で shared モードですが、番号だけではアクセスできません。

### 同じ提出かを判別

対応する構造：`hai_ai_acp_managed_requests`。

同じ番号に別の操作を載せる再試行を検出します。

```json
{
  "fingerprint": "<request-digest>"
}
```

fingerprint は内容の摘要で、入力文や応答本文ではありません。

### 人の承認を待つ操作

対応する構造：`hai_ai_acp_managed_approvals`。

承認待ちと期限を共有し、別ノードでも判断できるようにします。

```json
{
  "sessionId": "acp-session-42",
  "deadline": 1794873660000
}
```

decision がないので未承認で、期限経過も同意を意味しません。

### 後で再利用できる許可範囲

対応する構造：`hai_ai_acp_managed_grants`。

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

### 復旧時に元の呼び出し範囲を確認

対応する構造：`hai_ai_acp_managed_receipts`。

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

### 記憶書き込みを調整

対応する構造：`hai_ai_memory_write_gate`。

同じ状態への変更を調整して他ノードの結果を上書きしないための印です。

```json
{
  "id": 1,
  "marker": 0
}
```

id:1 の1行で、marker:0 は初期値です。本文や処理件数ではありません。

### 索引所属と移行の更新を調整

対応する構造：`hai_ai_memory_vector_namespace_write_gate`。

同じ状態への変更を調整して他ノードの結果を上書きしないための印です。

```json
{
  "id": 1,
  "marker": 0
}
```

id:1 の1行で、marker:0 は初期値です。本文や処理件数ではありません。

### 点検進捗の更新を調整

対応する構造：`hai_ai_memory_vector_scan_write_gate`。

同じ状態への変更を調整して他ノードの結果を上書きしないための印です。

```json
{
  "id": 1,
  "marker": 0
}
```

id:1 の1行で、marker:0 は初期値です。本文や処理件数ではありません。

## 項目・保存・削除のリファレンス

AI は呼び出し側の `storeProvider` または初期化済みの RelDB と VecDB を使います。標準の関係ストアは文字列 `id`、書き込み `version`、JSON の `data`、Unix ミリ秒の時刻を使用します。機能に応じて `object_id`、`session_id`、`status`、`ref_id` に索引があります。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_ai_chat_records`, `hai_ai_sessions`, `hai_ai_context`, `hai_ai_persona` | チャットの要求と応答、セッションの所有者と属性、発言と要約、ペルソナのプロンプト。削除マーカーで古いデータからの再作成を防ぐ。 |
| `hai_ai_llm_models`, `hai_ai_audio_models`, `hai_ai_image_models`, `hai_ai_mcp_servers`, `hai_ai_retrieval_sources` | 実行時のリソース登録。同じ ID の保存設定が起動時の値を上書きし、削除マーカーで無効化可能。 |
| `hai_ai_memory`, `hai_ai_memory_vector_outbox`, `hai_ai_memory_vector_namespace`, `hai_ai_memory_vector_scan` | メモリー、ベクトル更新待ち、所有者の紐付けと走査カーソル。表示対象のベクトル版は現在の関係レコードで決まる。 |
| `hai_ai_knowledge_documents`, `hai_ai_knowledge_collections` | コレクションと世代ごとに本文とチャンクを管理。公開済みの版を読む。 |
| `hai_ai_acp_*`, `hai_ai_a2a_*` | ACP の作業領域・セッション・管理リクエスト・承認状態と、A2A のコンテキスト・ジャーナル・メッセージ。 |
| `hai_ai_knowledge`, `hai_ai_memory` (VecDB) | ナレッジとメモリーの既定ベクトルコレクション。メモリーの名前空間を割り当てると実際の保存先が変わる。 |

セッションレコードはフレームワークのセッション ID と現在のネイティブ ID を保持します。明示的な作り直しでは、新しいネイティブセッションが正常に開始した後にネイティブ ID を更新します。

未翻訳：記憶、知識、A2A、ACP の個別レコードフィールドと索引の詳細。[中国語の該当節](ai.md#data-fields)を参照してください。
