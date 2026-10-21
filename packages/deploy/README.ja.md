# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

deploy は既存の成果物だけを配布します。ソースのコンパイルやイメージのビルドは行いません。同じイメージを複数環境へ配布できます。

作成、開発、ビルド、デプロイの全体は[使用ガイド](../../docs/usage/README.ja.md)を参照してください。本ページではデプロイの準備、SDK、モジュール開発を説明します。

## ビルド

Node `^22.22.2 || ^24.15.0 || >=26.0.0` と pnpm 12.11.2 を使用します。Windows では `pnpm.cmd` を実行してください。Node 20 / pnpm 9.5.0 は対象外です。

```sh
pnpm build                               # ソースだけをコンパイル。環境は選択しない
pnpm build --target docker               # 利用可能な Podman、次に Docker
pnpm build --target docker --runtime docker
pnpm build --target desktop --platform windows --arch x64
```

`hai.build.json` で Dockerfile のステージと Tauri ディレクトリーを指定します。イメージと SHA-256 付きマニフェストは `.hai/build/docker/<buildId>` に出力されます。API/Web は同じビルド ID を使い、すべて成功してから latest を更新します。Tauri は対象の Windows/Linux/macOS 上で実行し、対応する Rust target、SDK、パッケージツールが必要です。インストーラーは `src-tauri/target/<target>/release/bundle` に出力されます。ビルドでは dev/test/prod を選ばず、デプロイの認証情報も取り込みません。

版はアプリルートの package.json.version を使います。例 1.2.3 では app-1.2.3.tar、web-1.2.3.tar、docker-compose-1.2.3.yml を生成します。マニフェスト形式の版は version: 2、アプリ版は appVersion です。--output release-prod.tar は release-prod-1.2.3.tar になり、Tauri も同じ版を使います。既定値と例は[完全ガイド](../../docs/usage/README.ja.md)を参照してください。

## デプロイ

```sh
pnpm run deploy --env test
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId> --skip-middleware
pnpm run deploy --env prod --bundle-only --output release-prod.tar
# fullstack で同じ処理を直接呼ぶ場合
pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .
```

対応する版の `@h-ai/cli` / `@h-ai/deploy`、`_deploy.yml`、lockfile、`.env.<mode>` が必要です。環境ファイルがなければ処理を停止します。公開設定の `.env`、`.env.dev/test/prod` と説明付き `.env.example` は Git に登録し、私有の `.env.local` は除外します。優先順位はプロセス変数 > local > 環境別 > 基本設定です。SSH の接続情報やトークンは私有の `HAI_DEPLOY_PROVIDER` JSON に保存できます。bundle-only では SSH 設定やローカルのコンテナーエンジンは不要です。

ウィザードは lockfile の実行時依存だけをたどり、dev/peer を除外します。ミドルウェアごとに既定構成、独自構成、既存設定の保持を選べます。`--skip-middleware` はミドルウェア処理全体を省略します。Compose は PostgreSQL/MySQL/Redis/RustFS/MinIO/Qdrant/pgvector/Chroma/OpenLDAP/Mailpit に対応します。任意のクラウド作成は Neon/Upstash/R2/Resend/Aliyun SMS に対応し、ネットワーク接続が必要です。

`container.s3Engine` は任意で、既定値は rustfs です。Compose で S3 サービスを自動作成するときだけ RustFS/MinIO を選び、独自の既存 S3 には影響しません。ミドルウェア処理の省略は CLI の `--skip-middleware`、SDK の `skipMiddleware` で指定します。

一つの私有 tar に Compose、実行時の環境変数、app/web イメージ、必要な Web プロキシ、チェックサム、README、`start-<mode>.sh` をまとめます。SSH でこの tar を転送し、リモートで展開・起動します。ソースの転送やリモートビルドは行いません。app/web 構成では Web の公開ポートから同一オリジンで内部 API に接続し、API の秘密情報は Web に渡しません。自動デプロイの成功には両方のヘルスチェック通過が必要です。Vercel は既存の `.vercel/output` を転送して実行時変数を設定し、ローカルビルドは行いません。

## オフラインと手動転送

Windows 側に対応する Node/pnpm、インストール済みの CLI/SDK 依存関係、Linux サーバーのアーキテクチャーに合う構築済みイメージのディレクトリー全体を準備します。ローカルには tar が必要です。自動転送では ssh/scp、信頼済みホスト鍵、SSH とアプリのポートへの接続も必要です。bundle-only なら、二台の間にネットワークがなくても外部メディアで運べます。

Linux 側には Docker/Podman、compose、sh、tar、sha256sum、書き込み可能な配布・データディレクトリー、コンテナー操作権限が必要です。ミドルウェアイメージは tar 内の README に記載された名前とタグで読み込んでください。app/web のアーカイブは同梱されます。イメージが不足すると、ダウンロードせずに起動を停止します。独自接続では利用可能なサービス、アカウント、DB/バケット、認証情報を準備します。

```sh
mkdir -p release && chmod 700 release
tar -xf release-prod-1.2.3.tar -C release
cd release
HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=docker sh start-prod.sh
```

tar には秘密情報が含まれるため、アクセス権を制限し、Git に登録しないでください。`packaged` はサーバー起動やヘルスチェックをまだ行っていない状態です。手動起動後は `docker compose -f docker-compose-1.2.3.yml --env-file .env.runtime ps`（または logs）、Web、/health、実際のログインと再読み込み、再起動とデータ保持を確認します。本番のセッションには HTTPS、信頼できる証明書、DNS、正しい CORS が必要で、TLS は別途設定します。

構築済み成果物の配布には、ローカルのコンテナーエンジン、Linux Node ベースイメージ、コンパイラー、CUDA、SQLite のダウンロードは不要です。完全オフラインでの**ビルド**には、別途 Linux ベースイメージ、pnpm/Corepack、Linux 用依存キャッシュ一式、driver/ABI/アーキテクチャー/libc が一致する SQLite バイナリーが必要です。Windows の node_modules だけでは足りません。必要に応じて `pnpm build --target docker --sqlite-prebuild-mirror http://trusted-host/better-sqlite3` を使えます。AI の実行時依存がなければ AI/CUDA は不要です。クラウドサービスはオフラインでは使えません。完全オフラインの動作は実際に接続を切って確認してください。

## SDK とモジュール開発

`deploy.init(config)` の成功を確認してから `deploy.deployApp(appDir, { environment: 'prod', envDir: '.', artifactDir, bundleOnly: true })` を呼び、結果を確認し、最後に `deploy.close()` を実行します。`deploy.scan` と credentials は初期化不要です。packaged の結果には bundlePath/instructions、自動デプロイの結果には URL とヘルス状態が入ります。

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/cli test
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

デプロイのゲートは現在のソースをパッケージ化して fullstack を生成し、API/Web を一度構築してから、SSH と手動 tar の起動、実際のブラウザー操作を検証します。失敗時も finally/teardown で一時プロジェクト、イメージ、コンテナー、スクリーンショット・レポート、補助プロセスを削除します。ネイティブインストーラーは各 OS での確認が必要です。[設定とミドルウェア](../cli/templates/skills/hai-deploy/middleware.md)、[詳細な例](README.md)も参照してください。

デプロイのゲートは既定でホストのプロキシを転送しません。依存のダウンロードに必要な場合、テスト専用 `HAI_DEPLOY_E2E_CONTAINER_PROXY`（既定は未設定）を設定します。Windows Podman の PowerShell の例は `$env:HAI_DEPLOY_E2E_CONTAINER_PROXY='http://host.containers.internal:10808'` です。ビルドコンテナーから到達できるアドレスを使い、アプリ設定や配布イメージには保存しません。

テスト専用 `HAI_DEPLOY_E2E_CONTAINER_NETWORK` は既定では未設定で、設定値を build の `--network` に渡します。rootless Podman の例は `$env:HAI_DEPLOY_E2E_CONTAINER_NETWORK='pasta'` です。build と run ではネットワークが異なる場合があるため、ビルド側でプロキシの到達性も確認してください。

Windows ではテスト専用 HAI_CLI_NATIVE_BUILD=1（既定は未設定）を指定し、`pnpm --filter @h-ai/cli test:scaffold-gates -t "fullstack scaffold"` を実行できます。Rust/MSVC/Windows SDK が必要で、生成 Tauri インストーラーの exe 名にルート版 2.4.6 が反映されることを確認します。一時プロジェクトとネイティブ出力も自動削除します。
