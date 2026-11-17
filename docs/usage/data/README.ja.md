# モジュールのデータ構造

[ガイドのトップ](../README.ja.md) · [モジュール設定](../configuration/README.ja.md#modules) · [モジュール API](../function/README.ja.md)

各モジュールは構造と[サンプルデータ](crypto.ja.md#example-data)を示し、表・キー・型、時刻単位、投影、秘匿を明記します。自前の保存先がない場合は応答や実行時構造を示します。

モジュールごとに、管理するテーブル、列、キャッシュキーを調べられます。再起動後もレコードが残るか判断するには、保存先と使用中のバックエンドを確認します。削除される時期は有効期限とクリーンアップの説明を参照してください。

## 実行基盤と API

[core](core.ja.md) · [api-contract](api-contract.ja.md) · [api-client](api-client.ja.md) · [crypto](crypto.ja.md) · [serv](serv.ja.md) · [kit](kit.ja.md)

## データとファイル

[reldb](reldb.ja.md) · [cache](cache.ja.md) · [storage](storage.ja.md) · [vecdb](vecdb.ja.md) · [datapipe](datapipe.ja.md)

## アプリ機能

[iam](iam.ja.md) · [ai](ai.ja.md) · [tools](tools.ja.md) · [audit](audit.ja.md) · [feedback](feedback.ja.md) · [payment](payment.ja.md) · [reach](reach.ja.md) · [scheduler](scheduler.ja.md) · [ui](ui.ja.md) · [capacitor](capacitor.ja.md)

## ビルドと実行

[cli](cli.ja.md) · [deploy](deploy.ja.md) · [runner](runner.ja.md)
