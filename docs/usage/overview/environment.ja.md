# 開発・デプロイ・ネイティブ環境

[章の概要](README.ja.md) · [プロジェクトの作成と起動](../getting-started/create.ja.md)

作る成果物や実行する検証に合わせてツールを用意します。CLI が検出できるコンテナエンジンは、インストール済みで起動しているものです。

<a id="development-tools"></a>

## ローカル開発

アプリの `engines` と `packageManager` を確認してください。このリポジトリは Node `^22.23.4 || ^24.22.1 || ^26.12.1` と pnpm 12.11.2 を使います。Git をインストールし、プロジェクトがパッケージレジストリに接続できることを確認します。Windows PowerShell では `pnpm.cmd` を使います。

`node --version`、`pnpm --version`、`hai --version` で実際のバージョンを確認します。CLI バージョンはインストールしたツール、アプリの `package.json` のバージョンはアプリのリリース、ビルド ID は個々の成果物やデプロイを識別します。

<a id="browser-tests"></a>

## ブラウザでの検証

プロジェクトの Playwright 設定に従ってブラウザをインストールします。対象のテストが使うデータベース、キャッシュ、LDAP なども準備してください。テストデータは分離し、失敗時は機密情報を伏せたログやスクリーンショットを残します。スキップや環境不足も検証結果に記録します。

<a id="container-deployment"></a>

## コンテナと Linux へのデプロイ

ビルドするマシンに Podman または Docker をインストールして起動します。Windows では Linux コンテナを使います。オフラインでビルドするには、ベースイメージ、pnpm の依存関係キャッシュ、対象の ABI・アーキテクチャ・libc に合ったネイティブパッケージが必要です。

アップロードを行う端末に `tar`、`ssh`、`scp` が必要です。Linux と macOS では `sh`、`awk`、Windows では PowerShell 5 以降と OpenSSH も用意します。Linux のデプロイ先には、コンテナエンジン、`--pull never` に対応する Compose、`sh`、`tar`、`sha256sum`、`awk`、`curl`、util-linux の `flock` が必要です。ファイルシステムのロック対応、ディレクトリとコンテナの権限も確認します。オフライン配布の対象サーバーに Node や pnpm を入れる必要はありません。

本番用に HTTPS、証明書、DNS、ファイアウォール、共有サービス、バックアップ、作業時間帯を準備します。[デプロイ設定](../configuration/delivery.md)

<a id="native-tools"></a>

## ネイティブパッケージ

Android ではプラットフォームプロジェクト、SDK、JDK、署名情報を用意します。iOS では macOS、Xcode、署名情報を使います。デスクトップでは対象 OS の Rust と Tauri の前提条件、システム SDK を準備します。`cap:sync` でリソースを同期したあとにネイティブビルドを実行し、実機で権限、安全なストレージ、通知を確認してください。
