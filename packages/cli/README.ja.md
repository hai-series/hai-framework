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

CLI は選択した skill のディレクトリー全体を `templates/skills/` から生成先の `.agents/skills/` にコピーします。`SKILL.md` は機能の境界とタスク案内、`reference.md`/`guide.md` は必要時に読む例を提供します。入口だけをコピーしてはいけません。AGENTS.md にアプリの制約を置き、Claude/Copilot のブリッジから参照します。テンプレート変更は関連するリポジトリー skill と同期し、生成テストで参照ファイルの完全な提供を確認します。

## クイックスタート

Node.js ≥ 22.12.0 が必要です。生成するルートプロジェクトと各 workspace パッケージも同じ最低バージョンを宣言します。

### プロジェクトの作成

```bash
# 交互式创建（推荐）
npx hai create my-admin-app

# 指定模板与功能
npx hai create my-app -t full
npx hai create my-app -t custom -f iam,db,ai
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
npx hai add

# 指定模块
npx hai add iam
npx hai add storage
```

既存プロジェクトにモジュールを追加します。`package.json` の更新、設定生成、依存解決を自動実行します。

### 設定の初期化・検証

```bash
# 校验配置完整性，补全缺失配置
npx hai init

# 强制重新生成所有配置
npx hai init --force
```

### コード生成

名前は英字で始まり、英字・数字・ハイフン・アンダースコアのみ使用でき、パスは受け付けません。既定では全出力を事前確認して上書きを拒否し、明示的な `--force` のみで置換します。出力とシンボリックリンク先は作業ディレクトリー内に限定されます。

ページ/API 生成は SvelteKit 向けで、コンポーネントは Svelte 5 の children snippet を使います。API は `kit.handler` と Zod 入力検証を使用します。マイグレーションは明示的な `up()` / `down()` を出力し、実行前に `reldb` を初期化、実行後に HaiResult を確認します。自動マイグレーションランナーではありません。`down()` はテーブルを削除するため、アプリ側の確認後に実行してください。

```bash
# 交互式生成
npx hai generate

# 指定类型
npx hai generate page users
npx hai generate component UserCard
npx hai generate api users
npx hai generate model user
npx hai generate migration add-users

# 快捷命令
npx hai g:page dashboard
npx hai g:component StatusBadge
npx hai g:api orders
npx hai g:model order
```

## プロジェクトテンプレート

| テンプレート | 説明       | 含まれる機能                                              |
| ------------ | ---------- | --------------------------------------------------------- |
| `minimal`    | 最小構成   | 基本的な SvelteKit/hai 構成（モバイルは Svelte 5 + Vite） |
| `default`    | 標準構成   | IAM + DB + Cache + Crypto                                 |
| `full`       | 全機能構成 | すべての業務モジュール + API Service / contract の仕組み  |
| `custom`     | カスタム   | 必要に応じて選択                                          |

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

### 5. テスト実行

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

## License

Apache-2.0

失敗・縮退時の表示も国際化します。サイト API はリクエストの locale で AI 縮退・メール到達状態を表示し、未到達を受信済みと表現しません。CLI のデプロイ状態は cliM、Gallery の暗号化制限は二言語メッセージを使います。中国語・英語で未設定・失敗・成功を検証し、有料サービスの呼び出しは不要です。

クラウド設定の利用：Neon は HAI_DB（PostgreSQL JSON）、Upstash は HAI_CACHE（Redis rediss URL JSON）、R2 は HAI_STORAGE（フラットな S3 JSON）を出力します。メール・SMS は HAI_REACH_PROVIDERS を出力し、deployApp が両チャネルと YAML のメッセージテンプレートを統合して元の providers 配列を置換します。Core はオブジェクト・配列全体の上書きをサポートし、親ノードを末端より優先して Schema 検証を維持します。ビルド子プロセスと対象環境は同じ値を使います。R2 は既存の S3 accessKeyId/secretAccessKey、Resend は検証済みドメインの from、Alibaba Cloud は承認済み signName・テンプレートが必要です。アプリは対応する `_db.yml` / `_cache.yml` / `_storage.yml` / `_reach.yml` を起動時に読み込み、ネットワーククライアントには Node が必要です。

デプロイ失敗からの復旧：`ProvisionResult.resourceStatus` は created/reused を示します。`getDeployRecovery(result.error)` で projectName、stage、platformProjectId、リソース一覧を取得し、unknown は結果不明なので先にサービス側の管理画面で確認します。失敗リソースの ID が返った場合は保持します。復旧情報に envVars・元の例外・接続認証情報は含まれず、CLI が一覧と提案を表示します。同名の再試行は既存リソースを再利用し、自動削除しません。新規作成分も未使用を人が確認した後にのみ削除します。
