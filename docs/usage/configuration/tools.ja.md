# @h-ai/tools 設定一覧

[機能説明](../function/tools.ja.md) · [データの帰属](../data/tools.ja.md)

`tools.define/createRegistry` は純粋な定義・ファクトリーで、モジュール YAML・環境変数・`init/close` はありません。サーバー用は `@h-ai/tools/server` からインポートし、初期化済み Runner を利用します。

## 定義と軽量実行

| 場所 | フィールド | 既定値と用途 |
| --- | --- | --- |
| 定義 | `name/description/parameters` | 必須。名前は ASCII 1～64 文字、先頭は英字、以降は英数字・アンダースコア・ハイフン。Zod で入力を検証 |
| 定義 | `handler` または `resultHandler` | 片方だけ必須。通常データ、または既存の `HaiResult` を返す |
| 定義 | `title/examples` | 任意の表示名と `{ label, input }[]` プリセット。権限は変わらない |
| 定義 | `timeoutMs` | 整数 0～2147483647 ミリ秒。省略時 30 秒、0 は即時期限切れ |
| 登録器 | `authorize` | 任意。設定時は毎回の呼び出しで許可が必要 |
| 実行 | `signal` | 処理関数へ渡すキャンセルシグナル |
| 実行 | `objectId/sessionId` | 信頼済みの本人・セッション。未認証のモデル入力から取得しない |
| 実行 | `deadline/timeoutMs` | 絶対期限、呼び出し別、ツール、30 秒の順。検証・認可・処理を含む |
| 実行 | `authorize` | 呼び出し別の追加認可。登録器の認可と両方必要 |
| 一括実行 | `parallel` | 既定 false。並列可能な操作だけ有効にする |

不正な名前・既定タイムアウト・処理関数の組み合わせは定義時に `TypeError` を送出します。業務実行は `HaiResult` を返します。登録器は `tools.define` が作成したツールだけを受け付けます。モデル用パラメーターは JSON Schema に変換可能なものを使い、通常はオブジェクトにします。

## tools.createService

| フィールド | 必須・既定値 | 用途 |
| --- | --- | --- |
| `id` | 必須、英数字・アンダースコア・点・ハイフンの 1～60 文字 | Runner 型 `hai.tools.<id>.v1`。同じサービスのノード間で統一 |
| `runner` | 必須 | 初期化済み Runner。サービスはライフサイクルを所有しない |
| `createTools` | 必須 | 信頼済み `ToolServiceContext` から `ToolSet` または Promise を返す。実行ノードで再構築 |
| `enabled` | 必須 | `ToolSelection` またはコンテキスト関数。グループとツールの和集合から `exclude` を除く。`{}` はすべて無効 |
| `authorize` | 必須 | `{ context, name, input, phase }`。`phase` は `submit` または `execute` で両方の許可が必要 |
| `runTimeoutMs` | 300000 ミリ秒 | 実行期限。整数 1～86400000 |
| `queueTimeoutMs` | 300000 ミリ秒 | 待機期限。整数 1～86400000 |

`ToolServiceContext` は `scope: { tenantId, userId }` と任意の `sessionId/signal` を含みます。実際の `execution` は Runner 実行ノードが設定します。クライアントが申告した本人情報や実行コンテキストを受け入れないでください。

`ToolSet` は `tools`、任意の `groups: { id, title, tools }[]` と `environments: Record<toolName, environmentId>` を含みます。環境割り当ては Runner 環境を指定し、実行ノードでも再確認します。`ToolSelection` の `groups/tools/exclude` は名前の配列です。

カタログは各ツールの `authorize` を呼びません。利用者別の表示制限は `createTools/enabled` で行います。サーバーの認可と最終リソース検証は別途必要で、ボタンを隠すだけでは無効化できません。

`service.submit/invoke` は同一ユーザー操作の idempotencyKey を維持します。受付不明時は新しいキーで重複提出せず `service.find(key, context)` で取得します。カタログ無効化後も本人の旧タスクは照会でき、本人・サービスの検証は維持します。

## 成果物・ジョブファクトリー

`tools.createArtifactTools({ context, files })` は `ToolArtifactAccess.read/publish` と任意の `save` を受け取ります。`save` がなければ `artifact_save` は含みません。バージョン・競合・権限・バイト保存はホストが管理します。

`tools.createJobTools({ context, files, runner, environments, browserProxy? })` は次のキーを受け取ります。省略した環境のツールは作成しません。

| 環境キー | ツール | 能力とネットワーク |
| --- | --- | --- |
| `documents` | `documents_extract/documents_generate` | 固定の文書イメージ。オフライン |
| `office` | `office_convert/office_recalculate` | 固定の Office イメージ。オフライン |
| `ocr` | `ocr_recognize` | 固定の OCR イメージ。オフライン |
| `browser` | `browser_navigate` | ブラウザー能力。内部ネットワークと管理されたプロキシ |
| `web` | `web_capture` | Web 採集能力。内部ネットワークと管理されたプロキシ |
| `preview` | `preview_build` | 固定 `preview.build` ツールチェーン。オフライン |
| `video` | `video_render` | 固定の動画イメージ。オフライン |

`browser/web` は環境と `browserProxy` の両方がある場合だけカタログに含めます。信頼済みホストが `http://loopback 以外の IPv4:port` を設定し、`RunnerLaunch.env.HAI_TOOL_BROWSER_PROXY` でコンテナに渡します。モデル引数で設定・上書きはできません。既存のモデル用出口プロキシを再利用でき、別のプロキシサービスは必須ではありません。

browserProxy は完全な IPv4 リテラルと明示的ポートの HTTP ルート URL（`http://<IPv4>:<port>`、末尾 / は任意）で、ポートは 1～65535 です。ホスト名・IPv6・認証情報・他のパス・query・fragment は使えません。0.0.0.0、127.0.0.0/8、169.254.0.0/16、224.0.0.0/4 は拒否します。不正なプロキシの場合 browser/web ツールは登録されないため、配置設定を確認してください。

office/ocr は環境キーで、ジョブは documents グループです。browser/preview のジョブは web グループです。documents/web を選び、必要な環境を割り当てます。

web/video 環境は resources.pids: 512 から試験し、同時実行の合計を収容する Runner toolCapacity も設定してください。カスタムリソースは全 4 項目が必要です。検証したブラウザーはプロセス・スレッド上限 128 で EAGAIN となりました。512 は今回のイメージの試験開始値で、すべてのイメージや並列数を保証しません。CPU・メモリ・一時領域も測定します。

今回の動画 Runner 環境は `resources.scratchMiB: 6144`、ノードは `toolCapacity.scratchMiB: 8192` を試験開始値とします。Tools の新設定ではなく Runner の項目です。HyperFrames 0.9.56 は描画前に一時ディレクトリと出力ディレクトリの両方で 1024 MiB 以上の空き容量を必須とします。入力ファイルがある場合、Runner の tmp は scratchMiB 合計の 4 分の 1 なので、6144 MiB なら 1536 MiB を確保でき、旧合計 512 MiB は検査に失敗します。上限値は使用済みメモリ量ではなく、ディスク検査も省略しません。ノードは並列ジョブと host 調整用 default 容量も満たす必要があります。6144/8192 はすべての負荷や全工程の検証完了を意味しません。[ジョブのリソース要件](../../../packages/tools/jobs/README.md#配置) を参照してください。

値はイメージ名ではなく Runner 環境 ID です。一致する capability、固定イメージ、リソース・ネットワーク上限を登録します。[ジョブ説明](../../../packages/tools/jobs/README.md) と [Runner 設定](runner.md) を参照してください。Tools のインストールだけではイメージの取得やコンテナの起動はしません。

AI の website_video は `ai.tools.createBuiltinTools` に `executeJob` がある場合だけ登録し、同じサービスの web_capture/video_render に限定します。実際の LLM、既定 WAV TTS、web/video 環境、browserProxy が必要です。長い処理は runTimeoutMs: 1200000 を明示できます。[ワークフロー](../function/tools.ja.md#web-サイトから編集可能な紹介動画を作成) を参照してください。

## アプリケーションと複数ノード

Tools に全体の有効化スイッチはありません。各アプリケーションが設定からファクトリーと `enabled` を組み立てます。Hai Agent の `workbench.selection` は groups/tools/exclude を使い、省略時は既定の内蔵グループ、明示的な `{}` はすべて無効です。`workbench` スイッチ、グループ、環境割り当ては [Agent 使用説明](../../../apps/agent/README.ja.md#設定)、画像・音声モデルは [AI 設定](ai.md) を参照してください。

同じサービスのノードは既存 Runner データベースと Storage を共有し、サービス ID・ツール定義・環境を揃えます。新しいキューや状態テーブルは作りません。API ノードは Runner `executor: false`、実行ノードは再起動後も安定した一意の `nodeId` を設定できます。実行ノードで有効化と認可を再確認するため、フロントエンドだけで無効化しないでください。

`close()` は自サービスのハンドラーだけを解除し、借りた Runner は終了しません。キャンセル後は終端まで状態を読み取り、待機の中断をプロセス終了と扱わないでください。

パラメーター・各イベント・出力は Runner の各 512 KiB JSON 上限も適用します。50 MiB ファイルと scratchMiB は別制約です。[データ境界](../data/tools.ja.md#サイズと保持期間) を参照してください。
