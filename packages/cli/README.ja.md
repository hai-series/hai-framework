# @h-ai/cli

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

> hai Agent Framework CLI：対話式のプロジェクト生成とコード生成ツール。

## 主な機能

`hai deploy` はモジュール・設定不足、認証情報読み込み、走査、初期化、デプロイ、終了処理の失敗で非ゼロの終了コードを返します。スクリプトは終了コードを確認し、デプロイ全体の成功を後続処理の条件にしてください。

- **プロジェクト作成**：SvelteKit アプリ、Svelte 5 モバイル・デスクトップ画面、hai バックエンドを対話式で生成。
- **モジュール追加**：既存プロジェクトに機能を追加し、依存関係を自動解決。
- **設定初期化**：設定の完全性を検証し、不足ファイルを生成。
- **コード生成**：ページ、コンポーネント、API endpoint、データモデル、DB マイグレーションを生成。
- **テンプレート**：minimal / default / full / custom の 4 種類。
- **機能の組み合わせ**：IAM、DB、AI、Storage、Crypto などを必要に応じて有効化。
- **API サービス生成**：`@h-ai/api-contract` + `@h-ai/serv` で公開 contract / procedures を組み合わせ、`@h-ai/api-client` の型付きクライアントで利用。
- **依存関係の自動解決**：機能選択時に依存を追加（例：IAM が Crypto を追加）。

## AI 向け使用ガイド

Claude Code v2.1.277 以降は、優先されるプロジェクト CLAUDE ファイルがなく、標準機能が有効ならルート `AGENTS.md` を直接読めます。一行の `@AGENTS.md` ブリッジは旧版や無効なセッションも支援し、規則の重複や `.claude/` ディレクトリーを必要としません。[AGENTS.md の対応](https://code.claude.com/docs/en/memory#agentsmd)を参照してください。

CLI は選択した skill のディレクトリー全体を `templates/skills/` から生成先の `.agents/skills/` にコピーします。`SKILL.md` は機能の境界とタスク案内、`reference.md`/`guide.md` は必要時に読む例を提供します。入口だけをコピーしてはいけません。AGENTS.md にアプリの制約を置き、Claude/Copilot のブリッジから参照します。テンプレート変更は関連するリポジトリー skill と同期し、生成テストで参照ファイルの完全な提供を確認します。

すべてのアプリ種別に `hai-spec-review` を提供します。生成前に要件・設計の完全性、曖昧さ、技術・フレームワーク利用の正確性、命名の一貫性を厳密に確認し、箇所と具体的な修正案を報告します。問題が解決され、証拠が十分な場合のみ AI 生成に進めると判定します。`hai init` / `hai add` は既存のカスタムファイルを保持してこの skill も補完します。

審査後の文書からの実装は、独立した `hai-spec-implement` が担当します。全アプリに提供し、`hai init` / `hai add` でも関連リソース全体を補完します。AI は独立して検証できる機能と実際の依存関係に基づいて分割を判断し、既定では `docs/task-list.md` と `docs/tasks/<id>-<slug>.md` を使います。各タスクは専用 Git ブランチで TDD と品質チェックを行い、ローカルでマージして実際のコミットと統合検証を記録してから完了にします。修正時は元の番号・ファイル・ブランチを再利用し、以前の証拠に関連付けた新しい実施回を追加します。Markdown、Git、既存の開発・テスト skills を使い、新しいランタイム依存やワークフローエンジンは不要です。「文書からタスク一覧だけ作成」「文書から実装」「T003 を実行」「T002 を修正してマージ」のように指定できます。計画だけの依頼では実装せず、指定タスクは依存を確認し、リモート操作はユーザーの許可範囲に従います。

通常の機能追加・変更・修正では、`AGENTS.md` が `hai-app-create/SKILL.md` と `development.md` に案内します。要件を既存のフレームワーク機能・設定・拡張点に対応付け、インストール済みバージョンの exports と型を確認して実装します。適用できる機能を優先して再利用し、不足する能力を具体的に説明します。利用率のために無関係な依存を追加しません。Codex は `.agents/skills/` とプロジェクトルートの `AGENTS.md` を使用します。

各ツールの入口は一つの規則と skill を共有します。Codex/Cursor は AGENTS と `.agents/skills/`、Copilot は `.github/copilot-instructions.md` と共有 skill、OpenCode は AGENTS・opencode.json と共有 skill を使用します。Claude Code のルート CLAUDE.md は `@AGENTS.md` のみを含み、共有規則のタスク案内から `.agents/skills/` の本文と参照ファイルを必要時に読みます。CLI は `.claude/` を生成せず、skill の複製やシンボリックリンクも不要です。この構成では Claude のネイティブ skill 自動検出や `/skill` コマンドは登録されません。既存の Claude 設定と skill は保持します。根拠：[Claude プロジェクト指針](https://code.claude.com/docs/en/memory)、[Claude ネイティブ skills](https://code.claude.com/docs/en/skills)、[Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)、[OpenCode](https://docs.opencode.ai/docs/skills/)、[Cursor](https://cursor.com/docs/skills)。

生成プロジェクトは `eslint-rules.js` を共有します。lint は明示的な `any`、console、説明のない抑制、unknown を介した二重アサーション、フレームワーク内部ソースの import、既知の機密 localStorage キーへの書き込みを拒否します。必要なサードパーティーの回避策は局所的な説明を付けます。権限分離・入力安全性・トランザクション・ログのマスキングは静的規則だけでは証明できないため、テストとレビューで確認します。

既存プロジェクトは CLI を更新して `hai init` を実行すると、不足するワークフロー skill・参照リソース・入口ファイルが補完されます。`--force` を使っても既存の AI 規則は上書きしません。既存の入口・skills・ESLint 設定・scripts は新規生成プロジェクトと比較してマージし、不足する .npmrc/.gitignore も補完してください。ファイル補完だけで古い規則は更新されません。公開前は本リポジトリーでビルドした CLI で比較用プロジェクトを生成し、未公開の能力とインストール済みパッケージの能力を区別します。

AI ファイルの書き込み前に既存のファイル・ディレクトリーリンクを解決します。共有 skill とプロジェクトのブリッジはプロジェクト内に限定し、外部へのリンクでは書き込みを停止します。既存の `.claude/` ディレクトリーとリンクは生成対象外で、`hai init` / `hai add` はその内容を変更・削除しません。

配布検証はパッケージアーカイブと生成プロジェクトの両方を対象にします。`.npmrc` / `.gitignore` のテンプレート源には `.hbs` を付けて梱包時の除外を避け、生成時に通常の名前へ戻します。依存配置と機密生成物の無視規則を維持し、全テンプレートが `.tgz` に含まれることを回帰検証します。

## クイックスタート

Node.js 22.22.2+ / 24.15.0+ / 26+ が必要です。生成するルートプロジェクトと各 workspace パッケージも同じ最低バージョンを宣言します。

### CLI のインストール

まず `@h-ai/cli` をグローバルにインストールします。このパッケージが `hai` コマンドを提供します。以下のクイックスタートの例はインストール完了を前提としています。

```bash
pnpm add -g @h-ai/cli
hai --version
```

PowerShell では `pnpm.cmd add -g @h-ai/cli` を使用してください。同じインストールコマンドで、既存の CLI を現在公開されているバージョンに更新できます。利用可能なコマンドは `hai --help` で確認します。未公開のテンプレートは、後述のローカル開発手順に従って本リポジトリーの CLI をビルドして実行してください。

### プロジェクトの作成

生成する `@h-ai/*` 依存は CLI と同じバージョンに固定し、pnpm は `catalog:` からその完全なバージョンを参照します。更新時はフレームワークのパッケージをまとめて更新し、lockfile の実際の解決バージョンを確認してください。

作成メッセージは端末へ直接出力します。依存のインストールが失敗した場合は、コマンド、終了コード、stdout/stderr を表示し、生成したファイルを残します。プロジェクト内でインストールを再実行できます。`prebuild-install@7.1.3` の非推奨警告は `better-sqlite3` の上流インストーラー依存によるものです。この警告だけではインストールは失敗しません。警告を隠すためにネイティブインストーラーを上書き・削除しないでください。

```bash
# 交互式创建（推荐）
hai create my-admin-app

# 指定模板与功能
hai create my-app -t full
hai create my-app -t custom -f iam,db,ai
```

対話式の手順：

1. プロジェクト名を入力。
2. テンプレートを選択（minimal / default / full / custom）。
3. 機能モジュールを選択（custom の場合）。
4. サンプルコードを追加するか選択。
5. パッケージマネージャーを選択（pnpm / npm / yarn）。
6. 依存をインストールするか選択。
7. Git を初期化するか選択。

### モジュールの追加

```bash
# 交互式选择
hai add

# 指定模块
hai add iam
hai add storage
```

既存プロジェクトにモジュールを追加します。`package.json` の更新、設定生成、依存解決を自動実行します。

### 設定の初期化・検証

```bash
# 校验配置完整性，补全缺失配置
hai init

# 强制重新生成所有配置
hai init --force
```

### コード生成

名前は英字で始まり、英字・数字・ハイフン・アンダースコアのみ使用でき、パスは受け付けません。既定では全出力を事前確認して上書きを拒否し、明示的な `--force` のみで置換します。出力とシンボリックリンク先は作業ディレクトリー内に限定されます。

ページ/API 生成は SvelteKit 向けで、コンポーネントは Svelte 5 の children snippet を使います。API は `kit.handler` と Zod 入力検証を使用します。マイグレーションは明示的な `up()` / `down()` を出力し、実行前に `reldb` を初期化、実行後に HaiResult を確認します。自動マイグレーションランナーではありません。`down()` はテーブルを削除するため、アプリ側の確認後に実行してください。

```bash
# 交互式生成
hai generate

# 指定类型
hai generate page users
hai generate component UserCard
hai generate api users
hai generate model user
hai generate migration add-users

# 快捷命令
hai g:page dashboard
hai g:component StatusBadge
hai g:api orders
hai g:model order
```

## プロジェクトテンプレート

| テンプレート | 説明       | 含まれる機能                                              |
| ------------ | ---------- | --------------------------------------------------------- |
| `minimal`    | 最小構成   | 基本的な SvelteKit/hai 構成（モバイルは Svelte 5 + Vite） |
| `default`    | 標準構成   | IAM + DB + Cache + Crypto                                 |
| `full`       | 全機能構成 | すべての業務モジュール + API Service / contract の仕組み  |
| `custom`     | カスタム   | 必要に応じて選択                                          |

## Fullstack mini 管理画面

既定の管理画面は `@h-ai/ui/guide` の初回案内、要素ガイド、検索付きヘルプ、再表示、個人設定ガイドを提供します。Web/App/Desktop は内容と翻訳を共有し、Web は Cookie、WebView は localStorage でユーザーとバージョンごとに状態を保存します。共有 guide-store と data-guide を拡張してください。[ガイド skill](templates/skills/hai-ui/guide.md)を参照してください。

`--type fullstack` は IAM、reldb、cache、audit、storage、crypto を含む管理 workspace を既定で生成します。minimal を選んでも管理に必要なモジュールは有効です。`--frontends` で Web、Capacitor App、Tauri Desktop を選択します。miniapp は説明用のプレースホルダーで、実行・ビルド対象には含まれません。

```powershell
hai create mini-admin --type fullstack --frontends web,app,desktop
cd mini-admin
pnpm.cmd install
pnpm.cmd dev
```

CLI はルート `.env` にプロジェクトごとに異なるランダムな強い `HAI_ADMIN_DEFAULT_PASSWORD` を生成するため、`dev` / `start` を直接実行できます。初回ログインは `admin` とそのパスワードを使います。同名の環境変数で上書きできます。パスワードは `_iam.yml` のポリシーに従い、既定では 8 文字以上です。違反すると起動ログに具体的な理由とエラーコードを表示します。ユーザーが存在する場合、この変数でアカウントやパスワードはリセットされません。`.env` は Git とコンテナビルドから除外され、`.env.example` はプレースホルダーのみです。デプロイ先ごとに別のパスワードを設定してください。

- 管理者はユーザーの検索、ページング、作成、編集、有効・無効化、削除、アバター更新を行えます。サーバーは現在の管理者を保護し、更新ロック内で認可を再確認するため、同時操作で全管理者の権限を失うことを防ぎます。
- ロールは `admin` / `user` の 2 種類です。ロール画面は人数表示と説明編集、ユーザー画面はロール割り当てを担当します。一般ユーザーは個人設定のみ利用でき、管理 API への直接アクセスもサーバーで拒否します。
- 監査画面は操作、リソース、日付で記録を検索します。ログイン成功、ログアウト、パスワード変更、管理の書き込みを監査に記録し、パスワード、token、アバター内容は含めません。
- 個人設定はプロフィール、アバター、言語、テーマ、パスワード変更を提供します。設定は IAM ユーザー metadata に保存します。アバターは PNG/JPEG/WebP、最大 512 KiB で、サーバーが画像内容を検証して storage key を生成します。

型付き api-client と serv の crypto transport が、JSON 業務リクエスト、ログイン、更新を双方向に暗号化します。Web はメモリー内 access token と HttpOnly refresh Cookie を使います。App のネイティブ版は Capacitor の安全な TokenStorage、Desktop のネイティブ版はメモリーのみを使い、再起動後は再ログインします。ネイティブの refresh body 通路はクライアント識別子、明示的な通信ヘッダー、信頼する Origin を検証し、ブラウザープレビューは Cookie モードを使います。公開アバターはホワイトリスト内のバイナリー画像リソースです。

Web/App/Desktop は同じ `AdminWorkspace`、management store、型付き client を使います。現在のユーザーと refresh はフレームワーク標準 IAM procedures、テーマの保存と DOM 更新は `@h-ai/ui/theme` を使い、アプリは固定ロール、自己保護、アバター、業務監査を組み合わせます。

既定の SQLite、ローカル storage、memory cache は単一インスタンスの mini 管理サービス向けです。管理の書き込みは単一 writer のみ対応します。複数の読み取りインスタンスには共有 DB、storage、Redis cache と transport セッションの固定ルーティングが必要で、管理の書き込みは同じ writer に送ります。Redis への変更だけでは任意の複数 writer 間で最後の管理者を原子的に保護できません。生成するルート scripts は typecheck、lint、build、test、test:e2e を提供し、Capacitor/Tauri の配布には対応するネイティブビルドとパッケージ作成も必要です。

## アプリ設定と表示

生成されるすべての `.gitignore` に `**/data/` を含め、ルートと各 workspace の実行データおよび `.gitkeep` を除外します。必要なディレクトリは実行時に作成します。

Fullstack の `packages/<project>-serv/config/` は `_core`、`_serv`、`_db`、`_cache`、`_iam`、`_storage`、`_audit`、`_reach`、`_ai`、`_vecdb`、`_payment`、`_scheduler`、`_deploy` の 13 個の `.yml` を常に生成します。使用するモジュールは既定値を有効にし、未使用のモジュール、任意項目、代替 Provider はコメントとして残します。`.env.example` も未使用モジュールの認証情報をコメントで示し、作成時に指定した設定値を保持します。

拡張時はサービスの workspace に必要なパッケージを追加し、`src/server/runtime.ts` で公開 Schema による検証、初期化、逆順の終了処理を実装してから設定を有効にします。全体がコメントのファイルは外側のコメントを一層外し、任意ブロックは必要なものだけ有効にします。設定ファイルの存在だけでは業務機能は接続されません。SQLite/Redis/S3 や Reach Provider の切り替え時は既存の接続ブロックを置き換え、Provider 名を重複させません。`crypto.init()` は設定引数を取らず、datapipe は純関数のため、架空の YAML は生成しません。

全テンプレートは `_core.yml` から `name`、`version`、`env`、`defaultLocale`、`logging` を読み、`core.config` でメタ情報を取得して `core.logger` を使います。単一アプリの設定は `config/`、API workspace は `apps/<project>-service/config/`、fullstack は `packages/<project>-serv/config/` にあります。ログレベルと形式は YAML で決め、初期化で固定の `logging` を指定して上書きしません。

Core の環境変数上書きには `HAI_CORE_NAME`、`HAI_CORE_VERSION`、`HAI_CORE_ENV`、`HAI_CORE_LOGGING_LEVEL` を使えます。`HAI_CORE` 全体の上書きは親ノード優先です。サーバー設定の変更後はサービスを再起動します。コンテナは `HAI_CORE_ENV=production` を明示し、この値で本番の安全ポリシーを有効にします。

SvelteKit のサーバー layout は名称、バージョン、環境、既定言語など公開メタ情報のホワイトリストのみを渡します。単独 mobile-app の Vite 設定は Node ビルド時に core で YAML を解析し、公開値とブラウザーログレベル・形式を注入するため、YAML や上書き変数を変えたら再ビルドが必要です。Fullstack の画面は暗号化された `app.info` でサーバーの公開メタ情報を取得します。core/モジュール設定全体、秘密情報、ログのマスキング文脈はブラウザーに公開しません。

葉の環境変数は YAML に存在するパスだけを上書きします。コメントの項目は先に有効にするか、`HAI_DB`、`HAI_CACHE` などでオブジェクト全体を置き換えます。camelCase は分割せず、`connectTimeout` は `HAI_CACHE_CONNECTTIMEOUT` に対応します。言語一覧は各フロントエンド/shared の `project.inlang/settings.json` で管理し、`_core.yml` は既定言語のみを指定します。

Fullstack が自動生成する `.env` は初期管理者パスワードと `PUBLIC_API_BASE` のみ有効にします。モジュールの環境変数上書きはコメントとして残し、YAML を既定値の元にします。必要な環境変数だけを明示的に有効にし、YAML 編集時は既存の上書きも確認します。

## 共通オプション

| オプション         | 説明                     |
| ------------------ | ------------------------ |
| `-v, --verbose`    | 詳細な出力               |
| `-C, --cwd <path>` | 作業ディレクトリーの指定 |

## 開発時のローカル利用

> npm 公開前に monorepo 内で CLI をローカル実行・デバッグする場合に使います。

### 1. ビルド

```bash
# 构建 CLI（生成 dist/）
pnpm --filter @h-ai/cli build

# 或启动 watch 模式（修改源码后自动重建）
pnpm --filter @h-ai/cli dev
```

### 2. 直接実行（インストール不要）

ビルド後、`node` で `dist/index.js` を直接実行できます：

```bash
# 从仓库根目录运行
node packages/cli/dist/index.js create my-app
node packages/cli/dist/index.js create my-app --type admin --features iam,db
```

任意のディレクトリーから絶対パスでも実行できます：

```bash
node /path/to/hai-framework/packages/cli/dist/index.js create my-app
```

### 3. グローバルリンク（`pnpm link`）

ターミナルで `hai` を直接使うにはグローバルリンクを作成します：

```bash
# 在 packages/cli 目录下执行
cd packages/cli
pnpm link --global

# 验证
hai --version
hai create my-app
```

> 使用後は `pnpm unlink --global @h-ai/cli` でリンクを解除できます。

### 4. monorepo のほかの app で使用

`apps/*` は `workspace:*` でローカルパッケージを参照し、そのまま利用できます：

```bash
# 在仓库根目录执行，对任意 app 类型生成项目
node packages/cli/dist/index.js create ../my-new-project
```

## 5. 設定による認証画面

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

IAM を選択した admin/h5/website は AuthPanel と標準 route を生成し、mobile と fullstack は API actions を共用します。サーバーの _iam.yml で認証方式、登録、復旧、規約 Modal、ブランドを設定します。LDAP/Reach は任意です。既定 LDAP クライアントを使用する時だけ ldapts をインストールし、login.ldap と接続設定を指定します。メール/SMS は Reach テンプレートまたは独自コールバックを使用します。フォームは header/extraFields/footer、AuthPanel は login*/register* snippet を提供します。複数ノードは DB と Redis を共有します。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

### 6. テスト実行

```bash
# 单元测试 + E2E 模板生成测试
pnpm --filter @h-ai/cli test

# 真实脚手架 E2E 门禁（生成项目后执行 install/typecheck/lint/build/test/e2e）
pnpm --filter @h-ai/cli test:e2e

# watch 模式
pnpm --filter @h-ai/cli test:watch

# 覆盖率
pnpm --filter @h-ai/cli test:coverage
```

Admin/fullstack の門禁では実際にインストールしたローカル tarball の公開型と動作も検証します：ストリーム/checksum/上書き拒否、API Key scope/失効、現在の認可、ユーザー一括/ロールページ検索、Reach テンプレート、Audit ページ情報。fullstack は信頼できる接続元 IP も検証します。

成功時のスクリーンショットは CLI の `test-results/scaffold-evidence/` に保存します。`HAI_AUTH_EVIDENCE_DIR` で保存先を指定でき、生成プロジェクトの削除後も残ります。fullstack E2E は選択した全 Web/App/Desktop のブラウザープレビューでログイン、ガイド、ヘルプ、個人設定を検証します。小程序とネイティブシェルは各プラットフォームで別途検証します。

## License

Apache-2.0

失敗・縮退時の表示も国際化します。サイト API はリクエストの locale で AI 縮退・メール到達状態を表示し、未到達を受信済みと表現しません。CLI のデプロイ状態は cliM、Gallery の暗号化制限は二言語メッセージを使います。中国語・英語で未設定・失敗・成功を検証し、有料サービスの呼び出しは不要です。

クラウド設定の利用：Neon は HAI_DB（PostgreSQL JSON）、Upstash は HAI_CACHE（Redis rediss URL JSON）、R2 は HAI_STORAGE（フラットな S3 JSON）を出力します。メール・SMS は HAI_REACH_PROVIDERS を出力し、deployApp が両チャネルと YAML のメッセージテンプレートを統合して元の providers 配列を置換します。Core はオブジェクト・配列全体の上書きをサポートし、親ノードを末端より優先して Schema 検証を維持します。ビルド子プロセスと対象環境は同じ値を使います。R2 は既存の S3 accessKeyId/secretAccessKey、Resend は検証済みドメインの from、Alibaba Cloud は承認済み signName・テンプレートが必要です。アプリは対応する `_db.yml` / `_cache.yml` / `_storage.yml` / `_reach.yml` を起動時に読み込み、ネットワーククライアントには Node が必要です。

デプロイ失敗からの復旧：`ProvisionResult.resourceStatus` は created/reused を示します。`getDeployRecovery(result.error)` で projectName、stage、platformProjectId、リソース一覧を取得し、unknown は結果不明なので先にサービス側の管理画面で確認します。失敗リソースの ID が返った場合は保持します。復旧情報に envVars・元の例外・接続認証情報は含まれず、CLI が一覧と提案を表示します。同名の再試行は既存リソースを再利用し、自動削除しません。新規作成分も未使用を人が確認した後にのみ削除します。
