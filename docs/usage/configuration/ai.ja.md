# @h-ai/ai 設定

<!-- translation: partial -->

[原文（中国語）](ai.md) · [データ構造](../data/ai.ja.md) · [API リファレンス](../function/ai.ja.md)

サーバーで `_ai.yml` を読み込みます。モデルだけを試すローカル開発では LLM プロファイルから始めます。本番では保存先を共有し、アプリが使うモデル、検索元、ツールサービスを明示します。

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

<a id="knowledge"></a>

## ナレッジの取り込み

`knowledge.collection`（既定は `hai_ai_knowledge`）を指定し、埋め込みモデルに合った次元（既定は `1536`）を設定します。入力は `knowledge.cleanOptions` で整形した後、`knowledge.chunkOptions` で分割します。既定では Markdown の節で分割し、サイズは `1500`、重複は `200` です。登録前に調整し、既存の分割結果を変更する場合は再インデックスします。[Datapipe の設定](datapipe.ja.md)

未翻訳：モデルプロファイル、MCP、ACP の全設定一覧。[中国語の該当節](ai.md#configuration-fields)を参照してください。
