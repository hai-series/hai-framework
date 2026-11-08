# アプリの作成・設定・配布

[利用ガイド](../README.ja.md) · [必要な環境](../overview/environment.md) · [設定マニュアル](../configuration/README.md)

生成したアプリでの作業手順です。各モジュールの README には日本語の API 例があり、ここで参照する共通設定・運用手順は中国語です。アプリ用コマンドはフレームワークのリポジトリーではなく、生成したプロジェクト内で実行します。

## 1. インストールと作成

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@latest version
pnpm add -g @h-ai/cli@latest
hai --version
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

最初の照会は公開チャネルと既定版の正確な番号を返します。再現性が必要なら `@latest` の代わりに確認した版を固定します。`hai --version` で導入結果を確認します。作成コマンドは Web、共有契約、Node サービスを生成し、依存を導入して Git を初期化します。リモートへの push は行いません。`pnpm dev` は開発プロセスを動かし、接続先を表示します。PowerShell では `pnpm.cmd` を使います。

独立サービスは `--type api`、SvelteKit は `admin/website/h5`、Capacitor/Vite クライアントは `mobile-app` を選びます。Fullstack/API は pnpm workspace です。`--defaults` は既定値を選び、`--no-install`、`--no-git`、`--no-deploy` は対応する手順を省きます。[作成の選択肢](create.md)

## 2. 環境を設定する

Fullstack の `packages/my-app-contract` は HTTP の入出力、`packages/my-app-serv` は認可と業務処理、`packages/my-app-shared` は共有コード、`apps/my-app-web` は画面を担当します。生成された README と AGENTS.md を先に読みます。API workspace のサービスは `apps` 配下です。異なるテンプレートのパスをそのまま使わないでください。

モジュール設定は `config/_<name>.yml`、認証情報は非公開の `.env.<mode>.local` に置きます。優先順は **プロセス > 環境別非公開 > 共通非公開 > 環境別公開 > 基本 .env > YAML** です。同じ設定元では個別フィールドを親 JSON より優先し、行順には依存しません。高優先度の全体置換は低優先度の細項を解除します。ホストが読み込みと Schema 検証を行ってから初期化します。ファイル保存だけでは接続中のクライアントは更新されません。[読込と既定値](../configuration/runtime.md)

IAM テンプレートの初期アカウントは `admin` です。同じ環境の非公開ファイルで `HAI_ADMIN_DEFAULT_PASSWORD` を確認し、画像やログには出しません。本番では共有 DB・キャッシュ・ストレージを使います。開発用 memory/SQLite/Local は、環境名を変えるだけで本番向けにはなりません。

## 3. 一つの業務機能を完成させる

先に入出力、所有者・テナント範囲、失敗時の動作を決めます。[既存モジュール](../development/README.md)を使い、契約で HTTP Schema、サービスで認可、画面で typed client と表示を実装します。ボタンを隠すだけでは認可できません。リソース所有者は認証済みのコンテキストからサーバーが決めます。

ライフサイクルを持つモジュールは依存順に初期化し、`HaiResult.success` を確認して、逆順に閉じます。工場、Schema、UI コンポーネントには各自の契約があります。保存・通信の Promise 拒否は指定された境界で扱います。利用者には安全な翻訳済みメッセージ、サーバー診断には追跡番号を残します。内部ソースのコピーではなく[日本語のモジュール資料](../../../README.ja.md)の完全な例を使います。

## 4. 動作を検証する

プロジェクトの typecheck、lint、必要な build、test、影響する E2E を実行します。成功と拒否、失敗後の入力保持、再試行、中止、後片付けを確認します。テンプレートは実際にプロジェクトを生成して検証します。Schema や mock の成功だけでは外部サービスの動作を証明できません。[検証範囲](../governance/verification.md)

サブディレクトリーでは `PUBLIC_BASE_PATH` を決めて構築し、実際の gateway 経由で資源、深いリンク、認証、API、再読込を確認します。パスや配備構成の変更には全量配布を使います。[サイトのパス](../configuration/delivery.md#网站部署在子目录)

## 5. ビルドと配備

設定は生成プロジェクトのルート `hai.json` の `build` と `deploy` に置きます。

```sh
pnpm build --target image --runtime auto
hai deploy --env prod --plan
```

ビルドは生成バッチの場所とソース・チェックサム情報を返します。読取専用の plan は対象、更新・保持サービス、設定元のキー、復旧条件を示します。未確認の遠隔状態は `not-inspected` です。内容を確認してから `hai deploy --env prod` を実行します。SSH とミドルウェアの秘密は非公開環境ファイルで管理します。[配備設定](../configuration/delivery.md) · [配備手順](../operations/deployment.md)

Android は `pnpm build --target app --platform android --runtime auto --debug` で debug APK を作成します。署名リリースにはアプリの署名設定が必要です。iOS は macOS/Xcode を使います。実機に導入し、起動、権限、認証、保存、更新を確認してください。[ネイティブビルド](build.md#原生和离线条件)

## 6. 更新と復旧

公開済みの正確な対象版を調べ、`TARGET_VERSION` を置き換えて `hai upgrade TARGET_VERSION` を実行します。このコマンドは公開の完全性、package/lock/skill の差異、移行の前提を調べ、導入や上書きは行いません。必要な API・設定・skill を合わせて更新し、影響する検証と成果物の再構築を行います。

永続データを変更する前に互換性のない書込を停止し、DB、セッションキャッシュ、オブジェクト、管理認証情報を保護します。移行手順は各モジュールが所有し、`reldb.migrateSchema(..., { dryRun: true })` は事前確認です。コンテナーの復旧は業務データや外部効果を取り消しません。復旧材料を保持し、配備版、health、ログイン、永続レコードを確認します。[更新手順](upgrade.md) · [復旧条件](../configuration/delivery.md#失败恢复与发布后回滚)
