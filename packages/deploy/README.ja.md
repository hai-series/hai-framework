# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

既存イメージまたは Vercel prebuilt 成果物を配布します。完全オフライン、サービス選択、SSH 自動化、OS 別の手動配布スクリプトに対応します。SDK は成果物を消費し、CLI --build は構築から配布を明示的に実行します。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/deploy.ja.md#quick-start)を参照してください。

## 設定一覧

プロジェクトの `hai.json.deploy` で配布先を指定します。`hai deploy --env prod` を実行すると、CLI は prod 環境用の変数を読み込みます。アプリの接続先や認証情報は対象環境の設定に用意します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/deploy.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/deploy.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

配布成果物、成功時の基準、状態、環境ファイル、ミドルウェアデータについては[データ構造](../../docs/usage/data/deploy.ja.md)を参照してください。

## 開発とテスト

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/deploy test:e2e
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

実配置は API、SSR、静的モバイル、fullstack を代表として選びます。admin は website/h5 と共通の SSR Dockerfile と本番配置分岐を検証し、全アプリ種別の個別インストール、コンパイル、HTTP/ブラウザー検証は八つの scaffold シナリオで維持します。実測の資源競合に基づき scaffold と生成ルート runtime は逐次バッチとし、三つの軽い CLI ゲートは runtime と最大二つの worker で並列実行できます。生成シナリオは E2E の完全構築を再利用し、本番構築分離と実成果物の検証を維持します。CLI 配置ゲートは認証/暗号化、増分更新、破損成果物と復旧を維持し、本番と同じ Nginx で公開 bundle に `nginx -t` を実行します。fixture は init を有効化し、引き取った孤児 PID の実消失を検証します。

実際の生成プロジェクト、SSH と手動公開を検証します。レジストリー接続禁止、部分更新、破損アーカイブ、同一版での再公開、ヘルスチェック失敗を含めます。finally/teardown ではテスト自身が作成したプロジェクト、イメージ、コンテナー、ログ、プロセスのみを削除します。

`test:e2e` は現在のパッケージをビルドし、子プロセスで Linux のロックとプロセスの両ゲートを有効にしてファイルを順番に実行します。ルートの `pnpm e2e` もこの入口を含みます。接続可能な Podman（優先）または Docker を使い、公開 API が生成した `apply.sh` を実行します。同時実行、親の強制終了後の子によるロック保持、全終了と再起動からの復旧を確認します。Compose/HTTP は決定的なテスト用実装で、実サービス公開の検証を代替しません。

プロセス専用ゲートは `pnpm --filter @h-ai/deploy exec vitest run tests/deploy-command-process.test.ts tests/deploy-secret-masker.test.ts` です。同じ `HAI_DEPLOY_E2E=1` を設定し、deploy をビルドしてから `tests/deploy-command-runtime.e2e.test.ts` を実行すると、実 Linux/OpenSSH、公開 dist、遠隔の継続・完了、ローカルグループを検証します。sshd 導入にネットワークが必要で、Compose/HTTP はテスト用実装です。配置期限を 2500 ミリ秒に短縮し、出力消費を停止して応答喪失を再現します。

デプロイ用 fixture は固定版の公開基盤イメージを確認し、不在を確認した場合だけ取得します。HAI_DEPLOY_E2E_MIRROR を利用でき、公開キャッシュは回収対象にしません。create 成功時のコンテナー ID を先に記録し、専用 PID namespace 内で APT/pip/sshd を非同期準備します。準備失敗、期限超過、協調的取消ではローカルクライアントの終了を待ち、記録した ID だけを削除して消失を確認します。特権を使うのはネストした Podman fixture のみです。HAI_DEPLOY_E2E_APT_MIRROR はホスト名のみを受け付け、HTTPS を維持します。所有権テストは固定公開イメージに実行専用 tag を付け、同じ内容の外部 tag、tag の付け替え、動的ポート、外部 sentinel の保護を維持します。create の応答喪失で信頼できる ID がない場合や、テストが強制終了した場合は不明状態を残し、名前や label を根拠に回収しません。

## ライセンス

Apache-2.0
