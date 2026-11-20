# コンパイル・イメージ作成・ネイティブパッケージ

<!-- translation: partial -->

[初回リリースの手順](workflow.ja.md) · [前へ：開発](develop.ja.md) · [次へ：デプロイ](../operations/deployment.md) · [中国語の原文](build.md)

配布する成果物に合ったターゲットを選び、生成したプロジェクトのルートでコマンドを実行します。

```sh
pnpm build
pnpm build --target image --concurrency 2
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
pnpm build --target app --platform android --runtime auto --debug
pnpm build --target app --platform android --runtime auto
```

最初のコマンドはソースをコンパイルします。イメージのビルドでは `serv`、`web`、または両方を作成します。デスクトップ用の例は Windows x64 のリリースをビルドします。Android 用の二つはそれぞれデバッグ用とリリース用のインストーラーを作ります。一度に一つだけイメージを作成する場合は `--concurrency 1` を使います。`cap:sync` はパッケージ作成前に Web リソースをネイティブプロジェクトへ同期します。ビルドとデプロイは [`hai.json`](../configuration/delivery.md#配置入口和角色) の別々の項目を参照します。

設定済みのミラーを使うには `--image-source cn --npm-source cn` を指定します。プロキシは `--proxy-mode` の `inherit`、`system`、`custom`、`none` から選びます。初回の対話で選んだ値は保存され、`--yes` で再利用できます。[ダウンロード元とプロキシ](../configuration/delivery.md#下载源和代理)

<a id="browser-startup"></a>

## ブラウザの起動前チェック

ページの HTML にある独立したスクリプトが、アプリを読み込む前にブラウザを調べます。最低バージョンより古いと確認できた場合は、現在のバージョンと提供元の更新リンクを含む案内ページを表示します。更新後は元のサイトを開き直してください。バージョンを特定できない場合は通常どおり起動を試みます。

| ブラウザ・プラットフォーム | 最低バージョン |
| --- | --- |
| Chrome、Edge | 111 |
| Firefox | 114 |
| Safari | 16.4 |
| iOS・iPadOS のブラウザ | OS 16.4 |

新規の admin、website、h5、fullstack Web にはチェックが組み込まれています。既存アプリに追加する場合は [startup.js と同じディレクトリのファイル](../../../packages/cli/templates/shared/browser-check/) を、SvelteKit なら `static/_hai/browser-check/`、Vite なら `public/_hai/browser-check/` にコピーします。アプリのスクリプトとスタイルより前に対応するタグを追加します。

```html
<!-- SvelteKit src/app.html -->
<script id="hai-browser-startup" src="%sveltekit.assets%/_hai/browser-check/startup.js"></script>
<!-- Vite Web index.html -->
<script id="hai-browser-startup" src="./_hai/browser-check/startup.js"></script>
```

三つのファイルをサイトと同じパスの下に配置します。古いブラウザを模擬してアプリ本体の JavaScript と CSS を遮断しても案内が表示されること、対応ブラウザでは通常起動することを確認します。

<a id="verify-artifact"></a>

## 成果物の識別と確認

ルートの `package.json` がプロジェクト名とバージョンの取得元です。イメージのビルド結果は `.hai/build/docker/build-<project>-image-<buildId>/` に保存されます。マニフェストにはサービスの種類、プラットフォーム、チェックサム、部分ビルドかどうかが記録されます。すべての出力に成功するとローカルの `latest` が更新されます。同じバージョンを再ビルドすると異なるビルド ID が割り当てられます。

```sh
# 現在のプロジェクトのイメージをビルドし、自動処理用の JSON 結果を出力する。
hai build --target image --json
```

成功時の標準出力は、`schemaVersion: 1` と絶対パスの `artifactDir`、`manifestPath` を含む JSON 一行です。進捗とエラーは標準エラーに出力します。アーカイブは `manifest.images[].file` を使って成果物ディレクトリから探します。並行実行では各タスクの結果を保存し、その `artifactDir` を `hai deploy --artifact-dir` に渡します。`readDeploymentArtifact(artifactDir)` でアーカイブと SHA-256 を検証できます。

`manifest.source` は認識した Git コミットと、プロジェクトおよび対象のビルド入力に変更があるかを記録します。コミットが判定できない場合は `unknown`、変更を完全に確認できない場合は `null` です。リリースを追跡できるように、対象コミットを固定し、未コミットの変更がない状態でビルドします。`manifest.images[].platform` と対象アーキテクチャも比較してください。ソースとイメージは実行時の認証情報を含めずにビルドします。部分ビルドを配布する前に対象環境の条件を確認します。

<a id="native-builds"></a>

## ネイティブアプリをパッケージ化する

Android をコンテナでビルドするには `--runtime auto`、`docker`、`podman` のいずれかを指定します。初回のデバッグビルドでは作業用コピーに Android プロジェクトを生成できます。リリースには既存の Android プロジェクトと署名用の `HAI_ANDROID_KEYSTORE`、`HAI_ANDROID_STORE_PASSWORD`、`HAI_ANDROID_KEY_ALIAS`、`HAI_ANDROID_KEY_PASSWORD` が必要です。パスワードはビルドプロセスや CI から渡します。iOS の署名と出力には macOS と Xcode、デスクトップには対象 OS 上の Tauri を使います。

既定はリリースビルドです。`--debug` でデバッグ版を選びます。プラットフォームとビルド種別ごとに、`.hai/build/app/` または `.hai/build/desktop/` の下に成果物と `latest` が作られます。オフラインでビルドする場合はベースイメージと依存関係のキャッシュを前もって用意します。

Core の `name` は Capacitor の表示名と Tauri の製品名・メインウィンドウのタイトルに使われます。`HAI_CORE_NAME` には他の Core 設定と同じ上書き順序が適用されます。fullstack ではサーバーワークスペースの `_core.yml` とプロジェクトルートの環境ファイルを参照します。既存のネイティブプロジェクトではプラットフォーム側の表示名も更新してインストーラーを作り直します。命名規則、環境の選択、ウィンドウごとの上書き、既存の成果物の扱いは [中国語の原文](build.md#原生应用名称) にあります。

配布前にインストーラーを実機で確認します。サーバーのリリースではイメージのチェックサム、ユーザー操作、永続データを確認します。
