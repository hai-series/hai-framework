# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[フレームワークのホーム](../../README.ja.md)

## 概要

`hai` でアプリ作成、モジュール追加、ひな型生成、ビルド、配布を行います。SvelteKit、独立 API、フロントとバックを分離した工程に対応します。全体の流れは[利用ガイド](../../docs/usage/README.ja.md)を参照してください。

## 主な機能

- 管理画面、企業サイト、H5、API、モバイル、fullstack の作成。
- 既存アプリへのモジュール・設定・AI 指引の追加。
- ページ、部品、API、モデル、マイグレーションのひな型生成。
- 選択イメージのビルド、完全オフライン配布、サービス単位の更新。

## 使い始める

### CLI のインストール

Node.js は `engines`（`^22.22.2 || ^24.15.0 || >=26.0.0`）に合わせ、pnpm 12.11.2 を使用します。PowerShell では `pnpm.cmd` を使用してください。

```sh
pnpm add -g @h-ai/cli
hai --version
hai --help
```

生成したフレームワーク依存は CLI と同じ厳密バージョンに固定します。インストール失敗時はコマンド・終了コード・出力を表示し、再試行できるようファイルを残します。未公開ソースは下記のローカル開発手順で検証してください。

### アプリの作成

```sh
hai create my-app --type fullstack --frontends web --yes
cd my-app
pnpm dev
```

省略した項目は対話で選択し、`--yes` は既定値を使います。依存インストールと Git 初期化は既定で有効です。`--no-install` / `--no-git` で無効化できます。デプロイツールは開発依存として既定で入り、不要なら `--no-deploy` を指定します。

### プロジェクトテンプレート

| 種類                       | 生成内容                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| `admin` / `website` / `h5` | SvelteKit 管理画面・サイト・モバイル Web                             |
| `api`                      | 共通 contract と API service の pnpm workspace                       |
| `mobile-app`               | Svelte + Vite + Capacitor                                            |
| `fullstack`                | contract、API、共通 UI、選択した Web/App/Desktop。miniapp は説明のみ |

`--template minimal|default|full|custom` で構成を選び、`--features iam,db,...` で業務モジュールを指定します。Fullstack は管理 UI に必要な IAM・DB・cache・crypto・storage・audit を保持します。AI/ONNX/CUDA は既定で入りません。

### Fullstack mini 管理画面

ユーザー、ロール、監査ログ、アバター、個人設定、テーマ、言語、操作ガイドとヘルプを提供します。初回は `admin` と、ルート `.env.local` のランダムな `HAI_ADMIN_DEFAULT_PASSWORD` でログインします。既存ユーザーのパスワードは変更しません。例の業務ルールは変更できますが、認可はサーバーで行います。

### アプリ設定と表示

設定項目は `.env.example` を参照します。共通 `.env` と `.env.dev/.env.test/.env.prod` は Git に保存し、秘密値は `.env.local` に置きます。優先順はプロセス環境 > ローカル秘密ファイル > 選択環境 > 共通値です。API 工程はサービスディレクトリ、fullstack はルートに配置します。YAML・環境上書き・表示情報は[利用ガイド](../../docs/usage/README.ja.md)を参照してください。

### 既存工程とコード生成

AI の作成・追加は reldb と vecdb も導入し、生成コードは DB → ベクトル保存先 → AI の順に起動します。失敗時は逆順に解放し、解放失敗も返します。本番設定は有効な機能に応じて PostgreSQL（選択済み MySQL は保持）・Redis・S3・Qdrant を選び、Compose の `db/cache/storage/vecdb` を使います。パスワード・S3 認証情報・モデルキー・保護された Qdrant キーは秘密環境から注入し、Compose 外では接続先を上書きしてください。本番 Reach は空 Provider 配列で起動を拒否し、実際の `HAI_REACH_PROVIDERS` JSON の注入が必要です。`hai add` は既存本番値を保持して不足項目を追加します。既存の起動処理への接続はアプリ側で行います。

```sh
hai add storage
hai init
hai generate
hai generate page dashboard
hai generate component UserCard
hai generate api orders
hai generate model order
hai generate migration add-orders
```

`hai add` は依存を解決して設定を追加します。`hai init` は不足する設定と AI ファイルを補い、独自内容は保持します。`--force` はモジュール設定を再生成するため、差分を確認して使用してください。

page は SvelteKit のファイルルートに対応し、api は対象アプリに応じて SvelteKit または serv の共有 contract/procedure を生成します。API/fullstack のルートでは一意なバックエンドを自動選択します。複数候補は `--workspace <パッケージ名または相対パス>` で指定するか、対象 workspace に移動してください。通常の Vite への page/api 生成は拒否します。serv は `--output` を受け付けず、SvelteKit の出力は `src/routes` 内に限定し、独自の `kit.files` は推測せず拒否します。SvelteKit API には `@h-ai/kit` と `zod` が必要です。serv は `@hai-generator` マーカーのある既存の集約入口だけを更新し、未知の構成には手動統合を要求します。名前にパスは指定できません。既存ファイルは `--force` が必要ですが、登録済み業務領域は置換しません。一括検査後に書き込み、失敗時は今回の変更を戻します。マイグレーションは up/down 関数のみ生成するため、実行前にデータへの影響を確認してください。

CLI メッセージは中国語と英語に対応します。`HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG` の最初の空でない値を使い、`en`/`zh` の地域別表記は既存辞書に対応付けます。`C`/`POSIX` は英語です。未知の言語は現在の core 言語（既定は中国語）を保持します。PowerShell では `$env:HAI_CORE_DEFAULTLOCALE='en-US'` の後に `hai generate` を実行してください。API 呼び出しでは `core.i18n.setGlobalLocale('en-US')` で切り替えられます。種類や名前を省略すると対話入力になり、取消時はファイルを書きません。生成コードの中国語コメントとユーザー指定名は変更しません。

### ビルドとデプロイ

`pnpm build` はソースのコンパイルです。イメージごとの Dockerfile を `images/` に置き、`hai.build.json` で指定します。`--images` はビルド対象、`--services` は更新サービスを選びます。自動選択は接続可能な Podman、次に Docker です。依存の取得・インストール・本番依存の収集で、パッケージと SQLite ドライバーのキャッシュを共有し、再ダウンロードを避けます。

標準コンテナーは CPU 実行またはリモート AI サービスへの接続向けで、追加の GPU ランタイムをダウンロードしません。デプロイ先の GPU を使う場合は、イメージとコンテナーの実行設定を個別に調整してください。

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

完全配布にはアプリと自前ミドルウェアのイメージが入ります。梱包のみでは tar と Windows `deploy.ps1`、Linux/macOS `deploy.sh` を生成します。隔離 Linux サーバーでは展開して `sh apply.sh` を実行します。初回は完全配布が必要で、部分更新は他サービスとボリュームを維持します。各手順の結果を表示し、失敗は非ゼロで終了して復元を試みます。前提・キャッシュ・版管理・復元は[デプロイ説明](../deploy/README.ja.md)を参照してください。

デスクトップ配布は `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64` を対象 OS とツールチェーンで実行します。コンテナの Web 表示とは別にネイティブ配布を検証してください。

### AI による開発

ルート `AGENTS.md` から `.agents/skills/` を参照します。Claude・Copilot・OpenCode も共通規則を使います。日常作業は[アプリ開発](templates/skills/hai-app-create/SKILL.md)、大きな仕様は[レビュー](templates/skills/hai-spec-review/SKILL.md)と[実装](templates/skills/hai-spec-implement/SKILL.md)、更新は[フレームワーク同期](templates/skills/hai-framework-sync/SKILL.md)を使用します。

入口には作業の範囲を置き、詳細資料は必要時だけ読みます。`hai init` / `hai add` は不足分を補うため、既存ルールは差分を確認して統合し、同期時は skill ディレクトリ全体をコピーします。

## 開発とテスト

### 開発時のローカル利用

フレームワークのルートで実行し、現在のソースから生成します。デプロイ検証には接続可能な Podman/Docker も必要です。

```sh
pnpm --filter @h-ai/cli build
node packages/cli/dist/index.js create ../my-app
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:scaffold-gates --i18n
pnpm --filter @h-ai/cli test:deploy-gates
```

生成検証は実工程でインストール、typecheck、lint、build、test、ブラウザー操作を実行します。デプロイ検証はオフライン tar、SSH/手動配布、部分更新を扱います。テスト所有の資源は終了時に削除し、必要な証拠だけ指定先へ保存します。ネイティブと実クラウドは別途検証してください。

`--generate` は対象を絞ったルート検証です。インストール済み依存を再利用し、SvelteKit・serv API・fullstack バックエンドを実際に生成・ビルドして新ルートへアクセスします（transport を含む）。完全なインストールとブラウザー検証の代わりにはなりません。

`--i18n` は CLI をビルドし、独立プロセスで言語の優先順位・help・生成成功・失敗を検証し、中国語/英語の入力・検証・取消も確認します。

## ライセンス

Apache-2.0
