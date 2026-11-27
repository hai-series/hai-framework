# @h-ai/ai 設定

<!-- translation: partial -->

[原文（中国語）](ai.md) · [データ構造](../data/ai.ja.md) · [API リファレンス](../function/ai.ja.md)

## 設定の読み込み

サーバーで `_ai.yml` を読み込みます。モデルだけを試すローカル開発では LLM プロファイルから始めます。本番では保存先を共有し、アプリが使うモデル、検索元、ツールサービスを明示します。

<a id="configuration-fields"></a>

## 設定一覧

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `llm.model`, `llm.protocol` | `gpt-4o-mini`, `chat` | 既定のモデルとプロトコル。用途ごとに `models` の設定を選択可能。認証情報と接続先はプロトコルごとに設定。 |
| `llm.maxTokens`, `temperature`, `timeout`, `tempModelCacheTtl` | `4096`, `0.7`, `60000`, `600000` | トークン上限、サンプリング、リクエスト期限、一時モデルキャッシュの有効期間。時間はミリ秒。 |
| `embedding.dimensions`, `batchSize` | No dimension default, `100` | モデルとベクトルインデックスで次元を一致させる。 |
| `knowledge.collection`, `dimension`, `enableEntityExtraction` | `hai_ai_knowledge`, `1536`, `true` | ベクトル集合と取り込み処理を指定。整形は Datapipe 設定を使う。既定の分割は markdown、サイズ 1500、重複 200。 |
| `memory.provider`, `allowEphemeralFallback`, `vectorNamespace` | `native`, `false`, `default` | メモリー基盤を選び、ベクトルを名前空間で分離。本番の状態は共有する。 |
| `audio.models`, `inheritLlmApiKey` | Optional models, `false` | 音声プロファイルを登録し、文字起こし・合成モデルを明示。既定では各プロファイルの認証情報を使う。 |
| `image.models`, `generateModel`, `maxImageBytes`, `maxImages` | Optional selection, `20 MiB`, `4` | 画像モデルを登録・選択し、入力のサイズと枚数を制限。 |
| ACP `mode` | バックエンドによる | 環境に応じて `embedded`、`builtin-service`、`custom-service` を選択。作業領域と認証情報はサーバーで管理。 |

## 設定例

```yaml schema=@h-ai/ai:AIConfigSchema
llm:
  models:
    - id: coding
      model: your-responses-model
      protocol: responses
      baseUrl: https://models.example.invalid/v1
      apiKey: ${MODEL_API_KEY}
acp:
  agents:
    - id: coder
      name: Codex
      mode: embedded
      adapter: codex
      modelIds: [coding]
  workspaces:
    - id: project
      storage: { type: directory, path: /srv/projects/demo }
      repositories:
        - id: api
          url: https://git.example.invalid/team/api.git
          mainBranch: trunk
```

<a id="shared-qdrant"></a>

### Qdrant を共有するアプリ

アプリごとに別の関係データベースを使い、ネイティブメモリーの `memory.vectorNamespace` を設定します。同じアプリの各インスタンスは関係データベース、Qdrant、名前空間を共有します。関係データベースにコレクションの所属が登録され、最初のベクトル書き込み時にコレクションが作成されます。[名前空間と復旧の設定（中国語）](ai.md#shared-qdrant)

<a id="knowledge"></a>

### ナレッジの取り込み

`knowledge.collection`（既定は `hai_ai_knowledge`）を指定し、埋め込みモデルに合った次元（既定は `1536`）を設定します。入力は `knowledge.cleanOptions` で整形した後、`knowledge.chunkOptions` で分割します。既定では Markdown の節で分割し、サイズは `1500`、重複は `200` です。登録前に調整し、既存の分割結果を変更する場合は再インデックスします。

たとえば、`config/_ai.yml` で `knowledge.cleanOptions.removeEmails` を `true` にすると、メールアドレスを除去します。`normalizeWhitespace` と `trim` の既定値は引き続き `false` です。Markdown のコード行の先頭にある四つの空白が保持されるため、その行の `#` はコードの一部として扱われます。プレーンテキストの空白を整形する場合は、両方の設定を有効にできます。Datapipe を直接呼び出す場合、両方の既定値は `true` です。整形または分割に失敗すると、埋め込みを生成する前に取り込みを中止します。[Datapipe の引数](../function/datapipe.ja.md#call-options) · [ナレッジの取り込み例](../function/ai.ja.md#knowledge)

未翻訳：モデルプロファイル、MCP、ACP の全設定一覧。[中国語の該当節](ai.md#configuration-fields)を参照してください。

### MCP コンテナージョブのウォームプール

ローリング更新では、実行ノードを更新してから `mcp.servers[].pool.minReady` を調整します。準備済みの目標数だけを変更した場合、待機中のジョブは引き続き実行されます。サービスの実行環境、ポリシー、容量上限は各ノードで揃えます。[Runner のウォームプール](../function/runner.ja.md#containers)
