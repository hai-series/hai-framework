# 環境設定と機能開発

[初回リリースの手順](workflow.ja.md) · [前へ：プロジェクト作成](create.ja.md) · [次へ：ビルド](build.ja.md)

パッケージを選ぶ前に、機能の入出力、ロールと権限、データの変更、受け入れ条件を決めます。登録時の権限と管理者ロールはアプリの権限設計に合わせてください。

<a id="configuration-sources"></a>

## 設定の取得元を選ぶ

モジュールの設定構造には `_db.yml` などの YAML を使います。接続先、プロバイダー、認証情報は環境ごとに指定します。共通の公開設定は `.env`、環境別の公開設定は `.env.dev`、`.env.test`、`.env.prod` に書きます。非公開の上書きには `.env.local` または `.env.<mode>.local` を使います。[読み込み・上書き・既定値](../configuration/runtime.md)

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

これらのコマンドは開発サーバーの設定を選びます。ビルドした成果物にはデプロイ用の認証情報を含めません。Node アプリをコンパイルしたあとは、プロジェクトの `start:test` や `start:prod` を使います。fullstack のルートで `start` を実行すると API が起動します。Web のビルドを表示するにはクライアントワークスペースでプレビューを起動してください。

<a id="feature-flow"></a>

## 一つの機能をつなぐ

fullstack では API 定義、サーバー側の認可とデータ処理、クライアント、画面の順に変更します。SvelteKit ではファイルベースのルートとサーバー側の load 関数を使います。fullstack のハッシュルーターは生成された構成からページを検出します。`HaiResult` を返すメソッドでは `success` を確認し、トランザクションのコールバック、ファクトリー、純粋関数はそれぞれの仕様に従います。

対象に合った [機能ガイド](../development/README.ja.md) と [設定項目](../configuration/README.ja.md) を参照してください。画面の文言は 3 言語に翻訳し、警告とエラーは `ToastContainer` に渡します。失敗時にフォームの入力を残し、成功時は関係するデータを更新します。

<a id="ai-assisted-development"></a>

## コーディングアシスタントを使う

CLI は生成したプロジェクトの `.agents/skills/` に Skills をコピーします。Skill はアシスタントから呼び出します。

1. 目的、ロール、権限、画面、API、項目、状態、例外、受け入れ条件を `docs/` に記録します。
2. [hai-spec-review](../../../packages/cli/templates/skills/hai-spec-review/SKILL.md) で不足と曖昧な要件を確認します。
3. [hai-spec-implement](../../../packages/cli/templates/skills/hai-spec-implement/SKILL.md) で合意済みの文書版とタスクを管理し、依存順に実装します。小さな変更ではアプリの実装、レビュー、テスト用の Skill を選びます。
4. [hai-pr-review](../../../packages/cli/templates/skills/hai-pr-review/SKILL.md) で実際の差分、検証結果、未確認の項目を確認します。

要件が変わったら、先に業務文書を更新して受け入れ済みの版と比較します。作業を中断した場合は既存のタスク一覧から再開します。

<a id="check-feature"></a>

## 動作を検証する

プロジェクトの型チェック、lint、必要なビルド、テスト、変更に関係するブラウザテストを順に実行します。画面を実際に操作し、設定が稼働中のアプリに反映されたか確認してください。権限、失敗、復旧も試します。テストが作成したリソースは終了処理で解放し、原因調査に必要なログやスクリーンショットを残します。
