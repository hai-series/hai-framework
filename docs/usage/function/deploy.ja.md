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

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `deploy.scan`, `provisionAll`, `deployApp` | プロジェクトを調査、選択したサービスを作成、または指定の設定でデプロイ。 | `await deploy.scan(appDir)` |
| `deploy.credentials.getPath`, `load`, `save`, `saveAll` | 認証情報ファイルの場所を確認・読み込み、後続実行のために保存。 | `deploy.credentials.getPath()` |
| `hai deploy --plan`, `--build`, `--services`, `--artifact-dir`, `--bundle-only` | 計画の確認、デプロイ用ビルド、サービス選択、成果物の再利用、または単独バンドルの作成。 | `hai deploy --env staging --plan` |

追加の設定項目や利用例は[中国語リファレンス](deploy.md)に掲載しています。
