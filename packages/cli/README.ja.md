# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[フレームワークのホーム](../../README.ja.md)

## 概要

生成プロジェクトは既定で `zh-CN`、`en-US`、`ja-JP` を有効にします。対話設定で日本語を既定に選択でき、fullstack は `fullstack.i18n.locales` で言語を制限できます。CLI は `HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG` の順で中国語・英語・日本語を選択します。

`hai` でアプリ作成、モジュール追加、ひな型生成、ビルド、配布を行います。SvelteKit、独立 API、フロントとバックを分離した工程に対応します。全体の流れは[利用ガイド](../../docs/usage/README.ja.md)を参照してください。

## 主な機能

- 管理画面、企業サイト、H5、API、モバイル、fullstack の作成。
- 既存アプリへのモジュール・設定・AI 指引の追加。
- ページ、部品、API、モデル、マイグレーションのひな型生成。
- 選択イメージのビルド、完全オフライン配布、サービス単位の更新。

## 使い始める

### CLI のインストール

Node.js は `engines`（`^22.23.4 || ^24.22.1 || ^26.12.1`）に合わせ、pnpm 12.11.2 を使用します。PowerShell では `pnpm.cmd` を使用してください。

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

`--template minimal|default|full|custom` で構成を選び、`--features iam,db,...` で業務モジュールを指定します。Fullstack は管理 UI に必要な IAM・DB・cache・crypto・storage・audit を保持します。`--features` を省略すると feedback と reach も有効になります。明示した機能一覧では任意モジュールの選択を保持し、他のアプリ種別では問題報告を明示的に選択します。AI/ONNX/CUDA は既定で入りません。

独立した `mobile-app` で IAM または crypto を選択すると、フロント用 crypto を導入し、typed client の暗号化 transport を既定で有効にします。crypto を選択しない明示的な平文 API も利用できます。`PUBLIC_API_TRANSPORT=off` は対応する平文サービスにのみ使用し、`PUBLIC_API_KEY_EXCHANGE_PATH` は公開された鍵交換パスだけを変更します。鍵交換失敗時に平文へ切り替えず、サーバー秘密鍵をクライアントへ渡しません。終了時は client transport の後に自身が初期化した crypto を解放します。

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

CLI メッセージは中国語・英語・日本語に対応します。`HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG` の最初の空でない値を使い、`en`/`zh`/`ja` の地域別表記は既存辞書に対応付けます。`C`/`POSIX` は英語です。未知の言語は現在の core 言語（既定は中国語）を保持します。PowerShell では `$env:HAI_CORE_DEFAULTLOCALE='en-US'` の後に `hai generate` を実行してください。CLI 内部のコマンドも `core.i18n.setGlobalLocale('en-US')` による同一プロセス内の言語切替を反映します。種類や名前を省略すると対話入力になり、取消時はファイルを書きません。生成コードの中国語コメントとユーザー指定名は変更しません。

`create`、`add`、`init`、`generate` のプロンプト、検証、モジュール/テンプレート名、説明と完了メッセージは現在の CLI 言語を使用します。選択肢は参照時に翻訳するため、同一プロセス内の locale 変更も反映します。CLI 言語と生成アプリの `core.defaultLocale` は独立しています。生成される中国語 README、設定/コードのコメント、ユーザー入力と外部ツールの元の診断は変更しません。

### ビルドとデプロイ

DB 接続は保存前に選択したバックエンドの公開 Schema で検証します。MySQL の `ssl` は `false` または厳密な TLS オブジェクトのみで、`{}` は証明書チェーンと DNS ID を検証します。PostgreSQL のモードは維持します。CLI は純粋な Schema と Zod を内包するため、検証対象アプリに DB パッケージやドライバーは不要です。アプリの実行には依存関係が必要で、デプロイ機能には解決可能な `@h-ai/deploy`（生成プロジェクトの開発依存）が必要です。

`pnpm build` はソースのコンパイルです。イメージごとの Dockerfile を `images/` に置き、`hai.json` の `build.images` で指定し、同じファイルの `deploy` に配置設定を保存します。`--images` はビルド対象、`--services` は更新サービスを選びます。自動選択は接続可能な Podman、次に Docker です。依存の取得・インストール・本番依存の収集で、パッケージと SQLite ドライバーのキャッシュを共有し、再ダウンロードを避けます。

標準コンテナーは CPU 実行またはリモート AI サービスへの接続向けで、追加の GPU ランタイムをダウンロードしません。デプロイ先の GPU を使う場合は、イメージとコンテナーの実行設定を個別に調整してください。

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
pnpm run deploy --env prod --build --bundle-only
```

完全配布にはアプリと自前ミドルウェアのイメージが入ります。デプロイキャッシュ、tar と操作ディレクトリは既定でプロジェクトルートの `.hai/deploy/<環境>/` に置きます。`--output` でコマンドの作業ディレクトリを基準とする tar 出力先を指定できます。梱包のみでは SSH を質問せず、tar、項目ごとの説明を含む `deploy-target.json`、Windows `deploy.ps1`、Linux/macOS `deploy.sh` を生成します。実行前に `deploy-target.json` を変更・確認し、両方のアップロードスクリプトはこのファイルを読みます。隔離 Linux サーバーでは展開して `sh apply.sh` を実行します。初回は完全配布が必要で、部分更新は他サービスとボリュームを維持します。各手順の結果を表示し、失敗は非ゼロで終了して復元を試みます。前提・キャッシュ・版管理・復元は[デプロイ説明](../deploy/README.ja.md)を参照してください。

失敗時はローカルの管理対象プロセス終了確認と、遠隔の不明/スクリプト完了状態、結果ファイルのパスを別々に表示します。ローカル SSH 終了だけでは遠隔停止を断定しません。不明状態をサーバーで確認し、CLI は配置や復元を自動再実行しません。Windows は内嵌のシステム PowerShell/.NET Job と Add-Type を使い、失敗時は管理外でコマンドを起動しません。

通常の前景配置と同期の失敗復元は、後処理と終端結果の公開後に `.deploy.lock` を明示解放し、稼働中の背景サービスは次の配置を妨げません。HUP/INT/TERM または親 shell の強制終了時は、記述子を継承した実行中の子コマンドが全 holder の終了かサーバー再起動までロックを保持します。ロックファイルは残し、削除・置換しないでください。

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
pnpm --filter @h-ai/cli test:scaffold-gates --list --json
pnpm --filter @h-ai/cli test:deploy-gates
```

生成ゲートは十一個のシナリオで全アプリ種別の実インストール、コンパイル、HTTP/ブラウザー検証を維持します。実測で構築とインストールの資源競合が発生したため、重い scaffold と生成ルート runtime はバッチを分けて順番に実行します。言語、CLI プロセス、環境消費の三ファイルは runtime と最大二つの worker で並列実行できます。各シナリオは E2E 入口の完全構築を再利用し、既存の本番構築分離チェックは E2E 後に空でない実成果物を検証します。実コンテナー配置は API、SSR（共通 Dockerfile と配置分岐を持つ website/h5 は admin で代表）、静的モバイル、fullstack を選びます。所有権、認証/暗号化、増分更新、破損成果物、復旧は維持します。fixture は init と孤児プロセスの実回収を検証し、高速ゲートは本番と同じ Nginx で公開 bundle に `nginx -t` を実行します。通常単体テストはエンジンを探測しません。workspace compile は依存グラフで contract を構築し、fullstack の共有 i18n 準備を保ちつつ二重構築を避けます。

生成検証は実工程でインストール、typecheck、lint、build、test、ブラウザー操作に加え、生成した HTTP ルート、CLI プロセスの言語選択と環境ファイルの消費を検証します。`--generate` と `--i18n` で対象を絞って再実行できます。デプロイ検証は実リソースの所有権と動的ホストポートの分離に加え、オフライン tar、SSH/手動配布、増分更新とロールバックを扱います。当該実行が記録したコンテナー ID と専用イメージ tag だけを回収します。安全なメタデータは ignored の `tmp/validation/module-review/VERIFY-05/` に残します。生成したブラウザー画像、trace とレポートは既定で ignored の `tmp/validation/module-review/scaffold-browser/` または `deploy-browser/` に保持します。明示した証拠・HTML・出力先も尊重し、一時プロジェクト、鍵、データとプロセスは回収します。ネイティブと実クラウドは別途検証してください。

Windows インストーラーの追加検証には Rust の `x86_64-pc-windows-msvc` ターゲットと MSVC ビルドツールが必要です。`HAI_CLI_NATIVE_BUILD=1` を設定して `pnpm --filter @h-ai/cli test:scaffold-gates` を実行すると、既存の fullstack シナリオが NSIS インストーラーを構築し、アプリルートのバージョンと成果物名を照合します。`CARGO_BUILD_JOBS=2` で Rust の構築並列数を制限できます。ネイティブ UI 操作と機器機能は別途検証します。

デプロイ用 fixture は固定版の公開基盤イメージを確認し、不在を確認した場合だけ取得します。HAI_DEPLOY_E2E_MIRROR を利用でき、公開キャッシュは回収対象にしません。create 成功時のコンテナー ID を先に記録し、専用 PID namespace 内で APT/pip/sshd を非同期準備します。準備失敗、期限超過、協調的取消ではローカルクライアントの終了を待ち、記録した ID だけを削除して消失を確認します。特権を使うのはネストした Podman fixture のみです。HAI_DEPLOY_E2E_APT_MIRROR はホスト名のみを受け付け、HTTPS を維持します。所有権テストは固定公開イメージに実行専用 tag を付け、同じ内容の外部 tag、tag の付け替え、動的ポート、外部 sentinel の保護を維持します。create の応答喪失で信頼できる ID がない場合や、テストが強制終了した場合は不明状態を残し、名前や label を根拠に回収しません。

`--generate` は対象を絞ったルート検証です。インストール済み依存を再利用し、SvelteKit・serv API・fullstack バックエンドを実際に生成・ビルドして新ルートへアクセスします（transport を含む）。完全なインストールとブラウザー検証の代わりにはなりません。

`test:e2e` は各サービスに隔離されたテスト用バックエンドと絶対データパスを明示します。サービス子プロセスは外部の `HAI_*` / `PUBLIC_*` / `VITE_*` 設定やユーザーの `.env.local` を読み込みません。テスト専用の `HAI_E2E=1` は通常開発・本番の dotenv と共有バックエンド要件を変更せず、transport は毎回生成する信頼済み SM2 ring と実際の registry を使います。生成プロジェクトのブラウザー検証では独立 TCP 計数プロセスで外部 DB への接続がないことも確認します。完全な fullstack デプロイ検証では実 Redis/S3、増分更新とロールバックを維持します。

`--i18n` は CLI をビルドし、独立プロセスで言語の優先順位・help・生成成功・失敗を検証し、中国語/英語/日本語の入力・検証・取消と create/add/init も確認します。

## Skill ワークフローとフロントエンド指針

hai-spec-review、hai-spec-implement、hai-app-create、hai-app-tests、hai-app-review、hai-pr-review が [共通の引き継ぎ契約](templates/skills/hai-spec-implement/handoff.md) で要件、受け入れ条件、指摘と証拠を接続します。文書差分は既存の Git 基準を維持します。

UI には [hai-ui-design](templates/skills/hai-ui-design/SKILL.md)、hai-ui、[hai-ui-review](templates/skills/hai-ui-review/SKILL.md) を一緒に配布し、API テンプレートでは除外します。init/add は既存の独自入口を保持して不足リソースを補完します。リポジトリ側でも同じ責務には同じ名前を使います。

### 問題報告とオフライン分析

`hai create my-app --type fullstack --frontends web --yes` は問題報告を既定で有効にし、API 工程では `--features feedback` を指定します。ログインユーザーは報告でき、管理メニューの表示と閲覧・処理・再開・エクスポートは管理者に限定します。DB・ストレージ・通知・認証の依存を補い、収集、ページ一覧とサーバーAPIを生成します。`_feedback.yml` で管理者とURLを設定し、本番は共有DB、非公開S3、実際のSMTPを使います。Consoleは開発専用です。

`hai feedback summary <bundle.zip>`、`inspect`、`evidence --request-id <ID> --page 1 --page-size 20`、`view` で本番へ接続せず分析できます。表示はloopbackのみで待機し、Ctrl+Cで閉じます。

## ライセンス

Apache-2.0
