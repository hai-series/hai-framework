# @h-ai/deploy API リファレンス

<!-- translation: partial -->

[原文（中国語）](deploy.md) · [設定](../configuration/deploy.ja.md) · [データ構造](../data/deploy.ja.md)

<a id="quick-start"></a>

## クイックスタート

リモート変更の前にアプリを調べ、デプロイ計画を作成します。成果物の識別情報と対象を検証します。リモートコマンドの結果が不明な場合は復旧手順に従います。

```sh
pnpm run deploy --env prod --plan
pnpm run deploy --env prod --build
```

<a id="api-reference"></a>

## API 一覧

HaiResult を返す配置操作と認証情報操作では、success を確認し、認証情報の値は公開しないでください。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `deploy.init` | 設定済みのデプロイ先を準備 | `config` | `void` | `await deploy.init(config)` |
| `deploy.close` | デプロイ先のリソースを解放 | なし | `Promise<void>` | `await deploy.close()` |
| `deploy.scan` | アプリとデプロイに必要な素材を確認 | `appDir, options?` | `ScanResult` | `await deploy.scan('./apps/orders', { environment: 'prod' })` |
| `deploy.provisionAll` | 選んだ基盤サービスを準備 | `projectName, services?` | `ProvisionResult[]` | `await deploy.provisionAll('orders', ['db', 'cache'])` |
| `deploy.deployApp` | 配布用の束を作るか設定済みの対象へ配置 | `appDir, options?` | `DeployResult` | `await deploy.deployApp('./apps/orders', { environment: 'prod', bundleOnly: true })` |
| `deploy.credentials.getPath` | ローカル認証情報ファイルのパスを取得 | なし | `string` | `deploy.credentials.getPath()` |
| `deploy.credentials.load` | 非公開の値を読み込み、読み込んだ変数名を返す | なし | `HaiResult<string[]>` | `deploy.credentials.load()` |
| `deploy.credentials.save` | 認証情報を一件保存 | `key, value` | `HaiResult<void>` | `deploy.credentials.save(key, secret)` |
| `deploy.credentials.saveAll` | 渡した非公開認証情報をまとめて保存 | `entries` | `HaiResult<void>` | `deploy.credentials.saveAll(privateEntries)` |

bundleOnly の場合は配置前に配布ファイルを確認します。この呼び出しは配置先を更新しません。

未翻訳：直接配置とオフライン配置、失敗時の復旧。[中国語の該当節](deploy.md#detailed-workflow)を参照してください。
