# hai Framework

**AI 機能、セキュリティ、業務アプリの開発と配布を、一つの TypeScript 基盤で。**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

[![npm 最新版](https://img.shields.io/npm/v/%40h-ai%2Fcli?label=npm%20latest)](https://www.npmjs.com/package/@h-ai/cli)
[![CI](https://github.com/hai-series/hai-framework/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hai-series/hai-framework/actions/workflows/ci.yml)
[![CodeQL](https://github.com/hai-series/hai-framework/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/hai-series/hai-framework/actions/workflows/codeql.yml)
[![Documentation website](https://github.com/hai-series/hai-framework/actions/workflows/pages.yml/badge.svg?branch=main)](https://hai-series.github.io/hai-framework/)
[![License](https://img.shields.io/github/license/hai-series/hai-framework)](LICENSE)

[公式サイトとテンプレート](https://hai-series.github.io/hai-framework/) · [利用ガイド](docs/usage/README.ja.md) · [設定マニュアル](docs/usage/configuration/README.md) · [リリース](https://github.com/hai-series/hai-framework/releases/latest)

権限管理付きの業務システムから AI アシスタント、ナレッジベース、マルチプラットフォームアプリまで。**組み合わせて使える 22 パッケージ**、実行可能な CLI テンプレート、共通 UI、デプロイツールを提供します。フロントエンドとバックエンドは型と API 契約を共有し、開発者と AI は規約、Skills、検証手順を共有します。

## hai の特長

### AI：モデルの呼び出しから業務機能へ

OpenAI 互換モデル、ツール呼び出し、MCP を統一して扱い、RAG、会話メモリ、画像、音声、A2A と組み合わせます。チャット、Markdown、文書、Mermaid の表示コンポーネントを業務画面に再利用できます。

![目次、ダークテーマ、Mermaid を備えた文書コンポーネント](docs/usage/images/ai-document-dark.png)

実際のコンポーネント画面です。推論には選択した Provider と認証情報の設定が必要です。この画像はコンテンツ表示を示します。[AI 開発](docs/usage/development/ai.md) · [モデルとナレッジ設定](docs/usage/configuration/ai.md)

### セキュリティ：アカウント、API、監査をまとめて設計

認証と RBAC、アカウントの有効・休眠・登録解除状態、パスワードとセッションのポリシー、セキュリティ監査を提供します。パス、メソッド、IP、時間によるアクセス制限と、API ごとのアプリ層暗号化を設定できます。信頼するプロキシの境界を確認した上でクライアント IP を判定します。

![Fullstack でシステム管理者がアカウントのロールを選択する画面](docs/usage/images/account-role-choices.png)

実際のテンプレート画面です。システム管理者は全アカウントとロールを管理でき、監査などの業務権限は別に認可します。[認証と安全設定](docs/usage/configuration/identity.md) · [リクエストポリシー](docs/usage/configuration/request-access.md) · [安全レビュー](docs/usage/governance/security-review.md)

### データ：ローカルで始め、用途に合わせて選択

関係データは SQLite/PostgreSQL/MySQL、キャッシュは Memory/Redis、ファイルは Local/S3、ベクトル検索は LanceDB/pgvector/Qdrant/Chroma に対応します。トランザクション、ページング、署名付き URL、テキスト分割を専用モジュールで扱えます。

![ローカルの読み書き、ロールバック、キャッシュ、ファイルを実行した結果](docs/usage/images/data-local-results.png)

実際の SQLite、メモリキャッシュ、ローカルファイル、テキスト分割の検証結果です。複数インスタンスの本番環境では共有 DB、Redis、オブジェクトストレージを要件に合わせて設定します。[データアクセス](docs/usage/development/data.md) · [データ設定](docs/usage/configuration/data.md)

### 運用：ユーザーの報告を対応につなげる

フィードバックに操作状況、ページ再生、ログ、リクエスト、業務証跡を関連付けます。管理者は絞り込み、対応、再オープン、診断パッケージの出力ができます。監査、通知、定期タスクと組み合わせて継続的に運用できます。

![対応メモ、状態、履歴を確認できるフィードバック画面](docs/usage/images/feedback-handled.png)

実際のサンプル画面です。表示中の報告バージョンは採取時のものです。収集範囲、機密情報の除去、容量、通知はアプリごとに設定します。[フィードバックと調査](docs/usage/operations/feedback.md) · [運用設定](docs/usage/configuration/operations.md)

### UI と配布：テンプレートから本番まで

Svelte 5 の共通コンポーネントでフォーム、表、ダイアログ、認証、初回ガイド、ヘルプを構築します。テーマと中英日メッセージを共有し、警告とエラーは ToastContainer に読みやすく表示します。追跡 ID は必要なときに展開できます。

![コンポーネント一覧のログインフォームと統一エラー通知](docs/usage/images/gallery-scenes-ja-JP.png)

同一オリジンの SvelteKit アプリ、独立 API と Web/App/Desktop クライアントを作成できます。イメージ、オフライン配布、サービス単位の更新、失敗時の復旧に対応し、静的 Website は GitHub Pages に公開できます。[UI 設定](docs/usage/configuration/experience.md) · [配布マニュアル](docs/usage/configuration/delivery.md)

## 最初のアプリを作成

Node.js `^22.23.4 || ^24.22.1 || ^26.12.1` と pnpm 12.11.2 を用意します。CI と同じ Node.js 24.22.1 を推奨します。Windows PowerShell では `pnpm.cmd` を使用します。

```sh
pnpm dlx @h-ai/cli@latest create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

CLI は既定で依存関係をインストールし、Git を初期化します。`admin` でログインし、生成された `.env.dev` の `HAI_ADMIN_DEFAULT_PASSWORD` にあるランダム初期パスワードを使用します。画面に従って変更し、環境ファイルとパスワードは公開しないでください。

新規工程は全モジュールとサンプルを含み、サーバーに AI・ベクトル依存も導入します。`hai create --defaults` で対話を省略し、既定コンテナーは追加 CUDA ダウンロードを省きます。

インストール版は [npm の latest タグ](https://www.npmjs.com/package/@h-ai/cli?activeTab=versions)に従い、バッジは登録情報を直接参照します。`pnpm view @h-ai/cli@latest version` で確認し、再現性が必要な場合は `@latest` を取得した版に置き換えます。npm のインストールタグと GitHub Latest の表示設定は別に管理します。

### テンプレートを選ぶ

| テンプレート | 用途                                                   | 作成オプション                     |
| ------------ | ------------------------------------------------------ | ---------------------------------- |
| Fullstack    | 契約を共有する独立 API と複数クライアント              | `--type fullstack --frontends web` |
| API          | 独立 Node.js サービスと公開 API                        | `--type api`                       |
| Admin        | アカウント管理と業務画面を持つ同一オリジン管理システム | `--type admin`                     |
| Website      | 企業サイト、製品紹介、静的ドキュメント                 | `--type website`                   |
| H5 / Mobile  | モバイル Web または Capacitor アプリ                   | `--type h5` / `--type mobile-app`  |

![CLI で実際に生成した Admin のログイン画面](apps/framework-website/public/template-previews/admin-login.png)

[公式サイトで Fullstack、Website、Admin、Mobile の実際の画面を確認](https://hai-series.github.io/hai-framework/#template-previews)できます。Website の既定は SSR です。静的公開には[静的ビルド設定](docs/usage/configuration/delivery.md#静态website与github-pages)が必要で、ネイティブパッケージには対象 OS のツールチェーンが必要です。

### ビルドと公開

生成したプロジェクトで環境と配布先を設定して実行します。

```sh
pnpm build --target image
pnpm run deploy --env prod --plan
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services "serv,web"
pnpm run deploy --env prod --build --bundle-only
```

`--plan` は読み取り専用の事前確認、`--services` は更新サービスの選択、`--bundle-only` は持ち運べるオフラインパッケージの生成です。自動復旧はサービスと設定スナップショットが対象です。DB 移行と外部副作用は別の復旧手順を用意します。実 IP、サブパス、ストレージ直結、ポリシーファイルは[配布設定](docs/usage/configuration/delivery.md)を参照してください。

## 分野別モジュール

既存プロジェクトでは必要な `@h-ai/*` をインストールするか、対応するテンプレートで `hai add <module>` を使います。各リンクに公開 API、設定、使用例があります。

| 分野                   | モジュールと役割                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基盤と安全             | [core](packages/core/README.ja.md)：結果、設定、ログ、ライフサイクル、アクセス制限；[crypto](packages/crypto/README.ja.md)：SM2/SM3/SM4 とパスワードハッシュ；[iam](packages/iam/README.ja.md)：認証、セッション、RBAC                                                                                                 |
| データ                 | [reldb](packages/reldb/README.ja.md)：関係データとトランザクション；[cache](packages/cache/README.ja.md)：キャッシュと分散ロック；[storage](packages/storage/README.ja.md)：ファイルと署名付き URL；[vecdb](packages/vecdb/README.ja.md)：ベクトル検索；[datapipe](packages/datapipe/README.ja.md)：テキスト処理と分割 |
| AI                     | [ai](packages/ai/README.ja.md)：LLM、ツール/MCP、RAG、メモリ、画像、音声、A2A                                                                                                                                                                                                                                          |
| 業務と運用             | [feedback](packages/feedback/README.ja.md)：報告と診断；[audit](packages/audit/README.ja.md)：監査とアラート；[reach](packages/reach/README.ja.md)：メッセージ配信；[scheduler](packages/scheduler/README.ja.md)：定期タスク；[payment](packages/payment/README.ja.md)：決済                                           |
| API とプラットフォーム | [api-contract](packages/api-contract/README.ja.md)：共有契約；[serv](packages/serv/README.ja.md)：Hono/oRPC サービス；[api-client](packages/api-client/README.ja.md)：型付きクライアント；[kit](packages/kit/README.ja.md)：SvelteKit 連携；[capacitor](packages/capacitor/README.ja.md)：ネイティブ連携               |
| UI と開発環境          | [ui](packages/ui/README.ja.md)：Svelte コンポーネントとテーマ；[cli](packages/cli/README.ja.md)：生成と更新；[deploy](packages/deploy/README.ja.md)：Vercel と Docker SSH 配布                                                                                                                                         |

ライフサイクルを持つモジュールは `init → use → close` の順に使い、`HaiResult.success` を確認します。Core、純粋関数、契約、サービス生成関数は実際の型に従います。共有状態、Provider の前提、権限境界は[設定マニュアル](docs/usage/configuration/README.md)を参照してください。

## 役割別の読み方

| 作業               | 読み始める場所                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| 評価と新規作成     | [機能と環境](docs/usage/overview/README.md) → [最初の配布](docs/usage/getting-started/README.md)               |
| 業務機能と AI      | [開発ガイド](docs/usage/development/README.md) → 各モジュール README                                           |
| 設定とデプロイ管理 | [設定と既定値の索引](docs/usage/configuration/README.md) → [運用](docs/usage/operations/README.md)             |
| 安全審査と障害調査 | [安全レビュー](docs/usage/governance/security-review.md) → [フィードバック](docs/usage/operations/feedback.md) |
| 基盤保守と AI 協働 | [AGENTS.md](AGENTS.md) → [LLMS.txt](LLMS.txt) → 作業に合う Skills                                              |

分野別マニュアルは現在中国語です。[日本語ガイド](docs/usage/README.ja.md)から、作成から配布までの日本語手順に進めます。

## 開発とテスト

`packages/*` はフレームワーク、`apps/*` はサンプルと文書サイト、`packages/cli/templates/` は生成アプリと共有 Skills を管理します。機能変更時は呼び出し側、設定例、文書、画像、テストを同期します。

```sh
pnpm install --frozen-lockfile
pnpm --filter admin-console dev
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @h-ai/cli test:scaffold-gates
```

[CI は段階ごとに並列実行](docs/ci.md)し、入力指紋が一致する有効な成功記録を再利用します。**CI** は型、ビルド、テスト、ブラウザ操作を検証します。**CodeQL** は JavaScript/TypeScript を静的解析し、結果を GitHub Security に登録します。**Leak Checker** は管理者指定の漏えい語リストを確認します。バッジは実行状態を示し、解析結果は業務権限や配布構成と合わせて評価します。

ローカルのコミット/プッシュでは `scripts/check-leak-words.mjs` を使い、`.leak-words.json` は非公開に保ちます。コンテナ検証はその実行で登録したリソースを回収します。過去のテストイメージは `node scripts/cleanup-test-images.mjs --runtime=podman --legacy` で確認後、`--apply` を追加します。[検証説明](docs/usage/governance/verification.md)で実行、再利用、環境依存の境界を確認できます。

## ライセンス

[Apache-2.0](LICENSE)
