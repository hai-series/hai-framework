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

以下は目標Beta版です。公開チャネルと `1.0.0-beta.1` の提供状況を確認してからインストールしてください。検証対象であることは公開済みの意味ではありません。版を省略するとlatestとなり、Betaを自動選択しません。

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@1.0.0-beta.1 version
pnpm add -g @h-ai/cli@1.0.0-beta.1
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

`--template minimal|default|full|custom` で構成を選び、`--features iam,db,...` で業務モジュールを指定します。Fullstack は管理 UI に必要な IAM・DB・cache・crypto・storage・audit・任意バックアップ/アラート用 scheduler を保持します。`--features` を省略すると feedback と reach も有効になります。明示した機能一覧では任意モジュールの選択を保持し、他のアプリ種別では問題報告を明示的に選択します。AI/ONNX/CUDA は既定で入りません。

独立した `mobile-app` で IAM または crypto を選択すると、フロント用 crypto を導入し、typed client の暗号化 transport を既定で有効にします。crypto を選択しない明示的な平文 API も利用できます。`PUBLIC_API_TRANSPORT=off` は対応する平文サービスにのみ使用し、`PUBLIC_API_KEY_EXCHANGE_PATH` は公開された鍵交換パスだけを変更します。鍵交換失敗時に平文へ切り替えず、サーバー秘密鍵をクライアントへ渡しません。終了時は client transport の後に自身が初期化した crypto を解放します。

### 静的websiteとGitHub Pages

`hai create docs-site --type website --features none --yes`で任意業務モジュールを選択しないことを明示し、Core/Kit/UIと既定のデプロイ開発ツールは保持します。deployを選んでからno-deployで回避する必要はありません。noneは他の値、カンマ、空項目と併用できません。省略時の既定値とfullstackの必須構成は変わりません。

websiteの既定はNode SSRです。ビルド時に`HAI_BUILD_STATIC=1`と`PUBLIC_BASE_PATH=/docs-site`（docs-siteを実際のリポジトリー名に置換。各区間はASCII英数字・_・.・-のみ、末尾/なし、ルートは空）を指定してpnpm buildを実行すると静的buildを生成します。静的フラグは0/1のみでcompile専用です。PUBLIC_BASE_PATHはDockerのWeb構築にも対応しますが、ネイティブapp/desktopでは指定できません。静的構築はサーバー業務モジュール、独自API/actions、事前描画されないページを拒否し、本番ガードを緩和せずSPAフォールバックも生成しません。既定のhealth APIは含めません。

ルートdotenvを読まず、Kitのenvも分離します。staticは公開資産用のディレクトリで、画像やフォントなどをそのまま配信します。秘密情報は置かず、.env/.env.*またはシンボリックリンクがある場合は静的ビルドを停止します。buildだけをinclude-hidden-files:trueで公開し、子パス、深いURLの再読込、資産、秘密の不在を確認します。[静的サイト設定（中国語）](../../docs/usage/configuration/delivery.md#静态website与github-pages)を参照してください。

websiteのお問い合わせフォームは送信サービス未接続のUI例です。送信時には未対応であることをToastで知らせ、入力を保持します。実運用前にサービスへ接続し、処理中・成功・失敗を確認してください。

### サブディレクトリーでの公開

SvelteKitのadmin/h5/websiteは構築プロセスの`PUBLIC_BASE_PATH=/yyy`をkit.paths.baseに設定します。既定は空文字列です。変更時は再構築し、ゲートウェイは接頭辞を保持します。Vite Webの既定は`base: './'`、相対的な入口/runtime-config.jsとhashルーティングです。ルート配信サーバーへ転送するゲートウェイでは`/yyy/`を除去できます。PUBLIC_BASE_PATHを明示するとViteの基準パスが固定されます。APIのURLは別に設定します。

Docker構築でもPUBLIC_BASE_PATHを明示できます。非ルートではwebBasePathを含む成果物形式5を生成し、SDKが対応するプロキシ・ヘルスチェック・公開URLを作成します。この入口へ追加のゲートウェイで転送する場合は接頭辞を保持します。ルートは形式4のままです。servのみの部分構築でも同じ値を使用し、ディレクトリー変更は全量デプロイで行います。形式5に対応するCLI/Deployが必要で、旧ツールは明示的に拒否します。[設定手順と実行画面](../../docs/usage/configuration/delivery.md#网站部署在子目录)を参照してください。

### Fullstack mini 管理画面

ユーザー、ロール、監査ログ、アバター、個人設定、テーマ、言語、操作ガイドとヘルプを提供します。初回は `admin` と、選択環境の `.env.dev/.env.test/.env.prod` のランダムな `HAI_ADMIN_DEFAULT_PASSWORD` でログインします。既存ユーザーのパスワードは変更しません。例の業務ルールは変更できますが、認可はサーバーで行います。

作成時に `.env.dev/.env.test/.env.prod` ごとに別の初期管理者パスワードと転送鍵リングを生成し、Git に保存します。クローン後も環境ごとに共有し、ローカル秘密ファイルやプロセス環境で上書きできます。transport 有効アプリの `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` が不足・不正ならアップロード前に設定元を案内します。同じ環境の全ノードは環境ファイルまたは Secret Manager の上書きから同じ有効リングを読み込み、ノードごとに生成しないでください。CLI 完了時はログレベルによらず `HAI_ADMIN_DEFAULT_PASSWORD` の実際の保存元を案内し、値は表示しません。初回管理者作成時だけ有効です。 オフライン入口でも、サーバーの非公開 `.env.runtime` 内のパスワード変数の場所を案内します。

### アプリ設定と表示

テンプレートは `pretty` ログを既定とし、実行依存に `pino-pretty` を追加します。`HAI_CORE_LOGGING_FORMAT=json` で JSON に切り替えます。起動失敗はモジュール・エラーコード・設定項目、ポート競合は `EADDRINUSE`・アドレス・ポートを表示します。

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

### SvelteKit エンドポイントの安全設定

admin・website・h5 作成時に crypto を選ぶと `_kit.yml` の transport を有効化できます。既定値は false です。サーバーは環境ごとに生成した鍵リングを使用し、ルートレイアウトは公開 transport 設定だけをブラウザーに渡します。非公開 IP・時間条件は渡しません。db 選択時は DB registry を使用し、db なしのメモリー registry は開発・テストに限ります。静的サイトに動的 API はありません。

パスルール `encryption: required / disabled` で内部 API と通常 HTTPS の外部連携を分けます。相反する設定や必須 transport 不足ではホスト作成に失敗します。Fullstack 管理テンプレートは transport を必須とし、明文例外はパスルールで指定します。[アクセスと暗号化の手引き](../../docs/usage/configuration/request-access.md)を参照してください。

### ビルドとデプロイ

DB 接続は保存前に選択したバックエンドの公開 Schema で検証します。MySQL の `ssl` は `false` または厳密な TLS オブジェクトのみで、`{}` は証明書チェーンと DNS ID を検証します。PostgreSQL のモードは維持します。CLI は純粋な Schema と Zod を内包するため、検証対象アプリに DB パッケージやドライバーは不要です。アプリの実行には依存関係が必要で、デプロイ機能には解決可能な `@h-ai/deploy`（生成プロジェクトの開発依存）が必要です。

`pnpm build` はソースのコンパイルです。イメージごとの Dockerfile を `images/` に置き、`hai.json` の `build.images` で指定し、同じファイルの `deploy` に配置設定を保存します。`--images` はビルド対象、`--services` は更新サービスを選びます。自動選択は接続可能な Podman、次に Docker です。依存の取得・インストール・本番依存の収集で、パッケージと SQLite ドライバーのキャッシュを共有し、再ダウンロードを避けます。

標準コンテナーは CPU 実行またはリモート AI サービスへの接続向けで、追加の GPU ランタイムをダウンロードしません。デプロイ先の GPU を使う場合は、イメージとコンテナーの実行設定を個別に調整してください。

CLI は呼び出し元の `HAI_/PUBLIC_/VITE_` を除外し、内部で生成した `HAI_BUILD_ID/HAI_BUILD_COMMIT` のみを注入します。Docker は同じイメージバッチの識別情報をコンパイルに渡します。フィードバックはブラウザーとサーバー各自の `appVersion/buildId/commit` を使用し、バージョンは各 manifest、同じ SSR ビルドの ID は共通です。所属する Git コミットがなければ `unknown` を記録します。三項目の `build-metadata.json` とコード内の値を一致させ、API/ZIP の実際の証拠と照合します。

配布ロールは、独立 API バックエンドが `serv`、静的または SSR のブラウザーサイトが `web`、Android/iOS インストーラーが `app`、デスクトップインストーラーが `desktop` です。Fullstack は serv と任意の web、API は serv、admin/website/h5/mobile-app のブラウザーイメージは web を使用します。ネイティブ app/desktop はサーバーの Compose サービスではありません。`--images` と `--services` には serv/web、ネイティブ配布には `--target app` または `--target desktop` を指定します。API サービスのディレクトリは `apps/<project>-serv` です。イメージとコンテナーはルート `package.json.name` を共通の識別名として正規化します（scope 除去、小文字化、無効文字の連続をハイフンに変換）。名前がないか無効な場合は失敗し、ディレクトリ名へフォールバックしません。イメージは `localhost/hai-<project>-<role>:<buildId>`、コンテナーは `hai-<project>-<environment>-<role>` となり、イメージは環境間で再利用できます。

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
# 複数サービスは一つの --services にカンマ区切りで指定。PowerShell 向けに引用符で囲む
pnpm run deploy --env prod --build --services "serv,web"
pnpm run deploy --env prod --build --bundle-only
```

既定の配置名はプロジェクトルート（最も近い `hai.json` またはロックファイルのディレクトリ）の `package.json.name` を使い、未指定または無効な名前はエラーになります。明示した環境名を末尾に追加します。fullstack の `hai-delivery` で `packages/hai-delivery-serv` を走査しても、`--env test` は `/opt/hai/apps/hai-delivery-test` と `bundle-hai-delivery-test-<配置ID>-<版>.tar` を生成します。接続先ディレクトリ、配布物、Compose プロジェクト、API/Web/ミドルウェアのコンテナー、ボリューム、サーバー認証状態のファイル名、増分基準で同じ名前を使います。実際のプロジェクト名に含まれる `-serv` は削除しません。

成果物形式4・5はprimaryService（serv/web）と、工程全体のブラウザー構成を示すhasWebを記録します。形式5には非ルートのwebBasePathも含まれます。同一オリジンAPIプロキシはserv + webの場合だけ生成します。形式1～3は再構築が必要です。既存デプロイをバックアップし、プロジェクト名・ボリューム・管理対象の認証情報を確認してから、新しい完全デプロイの基準を作成してください。プロジェクト間のデータ移行は自動化しません。完全デプロイでは同じComposeプロジェクトの旧サービスコンテナーを削除するため、deploy-target.json.directoryの変更だけでは移行できません。

既存工程では、hai.json の build.images 名、Dockerfile 名と参照を先に更新します。API サービスのディレクトリ、パッケージ名と依存参照を -serv に統一し、依存を再インストールして完全な成果物を再構築してください。アーカイブ名や manifest の手動変更では再構築を代替できません。

CLI の --project-name と SDK の DeployAppOptions.projectName 上書きは廃止しました。旧引数は明示的に失敗します。工程ルートの package.json.name で識別名を管理してください。

自前ミドルウェアのパスワードはサーバーの `<remoteDir>/managed-secrets.env`（権限 0600）で永続管理し、データボリュームと一緒にバックアップします。各パッケージは初回用の候補のみ生成し、ビルド端末のキャッシュに依存しません。オンライン SDK、deploy.sh、deploy.ps1、deploy-local.sh は配置ロック内でサーバー値を再利用し、アプリ接続とミドルウェア固有変数の両方へ反映します。配布 tar は変更せず、サーバーの非公開実行ファイルだけに確定値を反映します。対応するボリュームが存在し状態がない場合、サービス変更前に停止してバックアップ復元を求めます。自動的なパスワード変更やデータ削除は行わず、旧認証情報は下記の明示的な検証・導入手順で移行できます。

完全配布にはアプリと自前ミドルウェアのイメージが入ります。デプロイキャッシュ、tar と操作ディレクトリは既定でプロジェクトルートの `.hai/deploy/<環境>/` に置きます。`--output` でコマンドの作業ディレクトリを基準とする tar 出力先を指定できます。対話式の梱包では構築・ミドルウェア設定後、梱包前に SSH 設定の追加・変更を確認します。`.env.<環境>.local` に保存し、今回と次回以降の target に反映します。`--yes` またはスキップ時は既存設定を使います。配布ディレクトリには tar、deploy-local.sh、read-target.awk、README.txt、項目説明付き `deploy-target.json`、Windows PowerShell 5+ `deploy.ps1`、Linux/macOS `deploy.sh` を生成します。アップロード前に target を確認して不足項目を補います。両スクリプトともこのファイルを読み、key/agent と password に対応し、Node/pnpm は不要です。target は `passwordEnv`（既定 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`）だけを参照し、パスワードは操作 PC の環境から今回の SSH/SCP 子プロセスだけに渡します。アプリ環境や配布物には含めません。target の変更はその配布物だけに適用し、プロジェクトには書き戻しません。隔離 Linux サーバーにはディレクトリ全体をコピーし、`sh deploy-local.sh` で自動展開・配置します。初回は完全配布が必要で、部分更新は他サービスとボリュームを維持します。各手順の結果を表示し、失敗は非ゼロで終了して復元を試みます。前提・キャッシュ・版管理・復元は[デプロイ説明](../deploy/README.ja.md)を参照してください。

直接デプロイでは不足する SSH 接続・認証情報を初回に補い、その後は `--yes` を含め有効で完全な設定を再利用します。パスワード入力は非表示で、前後の空白と先頭のゼロを保持します。新しい接続・ミドルウェアの秘密値は `.env.<環境>.local` に保存し、旧 `.env.local` は互換フォールバックとして残します。デプロイ SDK の `HAI_DEPLOY_*` はプロセス > 環境別非公開 > 環境別公開 > 旧全体非公開 > 基礎の順、その他のモジュールはプロセス > 環境別非公開 > 旧全体非公開 > 環境別公開 > 基礎の順です。この非公開層はデプロイ SDK のみが使い、通常の Core 読み込みは変えません。対象環境のミドルウェア設定が完全なら `--yes` は再質問やクラウド資源の再作成をせず保持します。対話モードでは今回の範囲を選べます。

失敗時はローカルの管理対象プロセス終了確認と、遠隔の不明/スクリプト完了状態、結果ファイルのパスを別々に表示します。ローカル SSH 終了だけでは遠隔停止を断定しません。不明状態をサーバーで確認し、CLI は配置や復元を自動再実行しません。Windows は内嵌のシステム PowerShell/.NET Job と Add-Type を使い、失敗時は管理外でコマンドを起動しません。

通常の前景配置と同期の失敗復元は、後処理と終端結果の公開後に `.deploy.lock` を明示解放し、稼働中の背景サービスは次の配置を妨げません。HUP/INT/TERM または親 shell の強制終了時は、記述子を継承した実行中の子コマンドが全 holder の終了かサーバー再起動までロックを保持します。ロックファイルは残し、削除・置換しないでください。

デスクトップ配布は `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64` を対象 OS とツールチェーンで実行します。コンテナの Web 表示とは別にネイティブ配布を検証してください。

### AI による開発

ルート `AGENTS.md` から `.agents/skills/` を参照します。Claude・Copilot・OpenCode も共通規則を使います。日常作業は[アプリ開発](templates/skills/hai-app-create/SKILL.md)、大きな仕様は[レビュー](templates/skills/hai-spec-review/SKILL.md)と[実装](templates/skills/hai-spec-implement/SKILL.md)、更新は[フレームワーク同期](templates/skills/hai-framework-sync/SKILL.md)を使用します。

入口には作業の範囲を置き、詳細資料は必要時だけ読みます。`hai init` / `hai add` は不足分を補うため、既存ルールは差分を確認して統合し、同期時は skill ディレクトリ全体をコピーします。

## Skill ワークフローとフロントエンド指針

hai-spec-review、hai-spec-implement、hai-app-create、hai-app-tests、hai-app-review、hai-pr-review が [共通の引き継ぎ契約](templates/skills/hai-spec-implement/handoff.md) で要件、受け入れ条件、指摘と証拠を接続します。文書差分は既存の Git 基準を維持します。

UI には [hai-ui-design](templates/skills/hai-ui-design/SKILL.md)、hai-ui、[hai-ui-review](templates/skills/hai-ui-review/SKILL.md) を一緒に配布し、API テンプレートでは除外します。init/add は既存の独自入口を保持して不足リソースを補完します。リポジトリ側でも同じ責務には同じ名前を使います。

fullstack 例はアプリ設定で `admin`、`audit_admin`、`config_admin`、`business_operator` と一般 `user` を分離し、システム管理者による他職務アカウントの奪取を拒否します。CLI は既存の環境設定方式を維持し、`.env.dev/.env.test/.env.prod` ごとに四職務の独立した初期パスワードを作成します。設定は共有でき、ローカル非公開ファイルや環境変数で上書きでき、既存アカウントの再設定・再割当は行いません。`_iam.yml`/`_audit.yml` の強化機能は業務ごとに選択し、生成 README を参照してください。

各スイッチ、既定値、前提条件と利用への影響は [fullstack セキュリティ設定ガイドのテンプレート](templates/apps/fullstack/docs/security-configuration.md.hbs) を参照してください。新規プロジェクトには `docs/security-configuration.md` と README のリンクを生成します。

### 問題報告とオフライン分析

feedback.init(config, { collectEvidence }) で業務の本文・ZIP を非同期収集できます。_feedback.yml は businessCollectionTimeoutMs と webhookUrl/webhookSecret/webhookTimeoutMs を提供します。Webhook は永続再試行と詳細画面での状態確認・再試行に対応し、秘密はサーバー非公開環境に保存します。[feedback の例](../feedback/README.ja.md) を参照してください。

`hai create my-app --type fullstack --frontends web --yes` は問題報告を既定で有効にし、API 工程では `--features feedback` を指定します。一般会員と業務操作員が報告でき、管理メニューの表示と閲覧・処理・再開・エクスポートは business_operator に限定します。DB・ストレージ・通知・認証の依存を補い、収集、ページ一覧とサーバーAPIを生成します。本番では共有 DB と非公開 S3 を使用します。通知は disabled/console/reach を独立に選び、console の既定は metadata のみです。要約は consoleContent: summary を明示し、実送信が必要な場合に Reach 通路と受信者を設定します。

`hai feedback summary <bundle.zip>`、`inspect`、`evidence --request-id <ID> --page 1 --page-size 20`、`view` で本番へ接続せず分析できます。表示はloopbackのみで待機し、Ctrl+Cで閉じます。

## リリース確認とネイティブビルド

upgrade は各利用側から ESM-only パッケージと pnpm リンクのマニフェストを読み、入口を実行せず、入れ子 workspace と除外規則に対応します。利用する Audit 制品が移行関数を公開する場合は `migrateAudit({ dryRun: true })` を提示しますが、移行自体は実行しません。計画の target.runtime はローカル梱包エンジンと独立した遠隔設定です。

旧環境は Linux サーバーで `hai deploy-secrets <directory> --import <privateJSON> --runtime docker` により読取専用認証を行い、明示的な `--apply` でのみ取り込みます。通常のオフライン配布と異なり、このツールにはサーバー Node が必要です。パスワードをコマンド引数に渡しません。[認証情報の移行と復旧](../deploy/docs/credential-import.ja.md)を参照してください。

`hai upgrade 0.1.0-alpha.71` は全消費パッケージと CLI/deploy の正確な版、tar の整合性、skills、catalog/lock/導入済み版と独自変更を読み取り専用で確認します。導入や上書きは行わず、不完全な公開は非ゼロ終了します。JSON は移行事前確認、バックアップと旧セッションの境界も示します。`hai deploy --env prod --plan` はローカル成果物、識別情報、設定元キー、更新・保持範囲、基準要件と復旧先を表示します。ビルド、認証情報作成、接続は行わず、未確認の遠隔状態は not-inspected です。

`hai build --target app --platform android|ios` で新しい APK/IPA を生成・検証します。プラットフォーム、Android SDK/JDK または macOS/Xcode と署名設定が必要です。cap:sync は同期のみで、工程・ツール・成果物不足は失敗します。リリースは CAPACITOR_SERVER_URL を除外し、同期済み設定の開発 URL を拒否します。build.app は App フォルダー一覧です。

`--plan --inspect-remote`（SDK inspectRemote:true）で SSH 経由の current と成功ディレクトリーを読み取り、verified/missing/unavailable と復旧リリース ID を示します。対象への書込は行いません。

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

## ライセンス

Apache-2.0
