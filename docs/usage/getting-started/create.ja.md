# プロジェクトの作成と起動

[初回リリースの手順](workflow.ja.md) · [開発環境の準備](../overview/environment.ja.md) · [次へ：環境設定と開発](develop.ja.md)

通常は npm の `latest` チャネルを使います。チームで毎回同じバージョンを導入したい場合は、公開済みのバージョンを調べて固定してください。リポジトリのバージョンがレジストリの公開版より先行している場合があります。

<a id="install-cli"></a>

## CLI をインストールする

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@latest version
pnpm add -g @h-ai/cli@latest
# インストール済みの Hai CLI のバージョンを表示する。
hai --version
```

最初の二つのコマンドで公開チャネルと既定のバージョンを確認します。ベータ版を使う場合は `@h-ai/cli@beta` を指定します。バージョンを固定する場合は `@latest` を選んだバージョンに置き換え、`hai --version` の結果と比較してください。Windows PowerShell では `pnpm.cmd` を使います。

<a id="run-app"></a>

## アプリを作成して起動する

```sh
# 既定値を使い、Web フロントエンドを持つ fullstack プロジェクト my-app を生成する。
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

最初のコマンドで Web フロントエンドと API のワークスペースを生成し、依存関係のインストールと Git の初期化を行います。リモートへの push は行いません。続くコマンドでプロジェクトに移動して開発プロセスを起動し、表示されたアドレスを確認します。対話形式で選ぶ場合は `hai create my-app` を実行します。`--no-install` を指定した場合は起動前に `pnpm install` を実行してください。開発用のデプロイツールが不要なら `--no-deploy` を指定します。

<a id="project-types"></a>

## テンプレートとオプションを選ぶ

| オプション | 生成されるもの・指定できること |
| --- | --- |
| `--type fullstack` | 共通の API 定義を持つサーバーとクライアント。`--frontends` の既定値は `web,app,desktop`。`miniapp` は予約済みでビルド対象外です。 |
| `--type api` | API 定義と独立した Node サービス。API と fullstack は pnpm ワークスペースを使います。 |
| `admin`、`website`、`h5` | 同一オリジンの SvelteKit アプリ。対話時の初期選択と、`--defaults` で種類を省略した場合は `admin` になります。 |
| `mobile-app` | Capacitor と Vite のクライアント。ネイティブ機能を使うには対象プラットフォームのツールが必要です。 |
| `--no-git`、`--git-remote` | Git の初期化を省くか、リモートを登録します。リモートの登録後もコミットはローカルに残ります。 |
| `--package-manager` | 単一プロジェクトで pnpm、npm、yarn を選びます。ワークスペース型は pnpm を使います。 |
| `--defaults` | 既定値を使って対話を省きます。認証情報は対象環境に別途設定します。 |

既存アプリには `hai add <module>` で対応モジュールを追加し、設定と呼び出しをアプリに組み込みます。ルートを生成する場合、`page` は SvelteKit 用です。`api` は `--workspace` で選んだ対象に応じて SvelteKit のルート、または Serv の API 定義と procedure を生成します。fullstack クライアントは生成されたハッシュルートを使います。

`hai add payment` は決済・データベースの依存関係、設定例、決済 skill を追加します。決済ルートはアプリケーションで定義し、金額、所有者、決済可能な状態は業務注文から取得します。

<a id="project-layout"></a>

## 生成された構成を確認する

この例では `packages/my-app-contract` に HTTP の入出力、`packages/my-app-serv` に API の実装、`packages/my-app-shared` に共有コード、`apps/my-app-web` に画面があります。fullstack の環境ファイルはプロジェクトのルート、独立 API の環境ファイルは `apps/` 配下のサーバーワークスペースに置きます。編集前に生成された `README.md` と `AGENTS.md` を読んでください。

テンプレートは使用するパッケージをインストールします。admin と h5 には認証とデータ・通知の依存関係が含まれ、website は Core、Kit、UI を使う Node SSR アプリとして始まります。API は認証、通知、アップロード、フィードバック、fullstack はそれらに加えて監査、ストレージ、スケジューリングを備えます。mobile-app はクライアント機能から始めます。AI、決済、ベクトル、Datapipe は必要に応じて追加します。任意の設定は有効化するまで YAML や `.env.example` のコメントにあります。静的サイトを公開する前に、サーバー側の依存関係、起動コード、API、actions を確認してください。[静的サイトの設定](../configuration/delivery.md#静态website与github-pages)

<a id="first-run-check"></a>

## 初回起動を確認する

開発サーバーが表示したアドレスを開きます。IAM を使うテンプレートの初期アカウントは `admin` です。ランダムなパスワードは `.env.dev.local` など、選んだ非公開の環境ファイルの `HAI_ADMIN_DEFAULT_PASSWORD` にあります。スクリーンショットやログへの記録は避けてください。データベースに保存済みのアカウントは、再起動してもパスワードが変わりません。

成功する操作と失敗する操作を一度ずつ試し、リクエストが届いたサービス、画面の案内、ログでの追跡を確認します。依存サービスが不足している場合は起動時か、そのサービスを使う操作で確認できます。モデル、本番通知、決済を使う場合は対応するサービスを設定します。既定のコンテナビルドではオプションの CUDA/TensorRT ダウンロードを省きます。
