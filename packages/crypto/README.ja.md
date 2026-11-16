# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

非対称暗号、ハッシュ、対称暗号、パスワードハッシュを提供する暗号モジュールです。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/crypto.md#最小接入示例)（中国語）を参照してください。

## 設定一覧

暗号化、署名、ハッシュのオプションは各メソッドに渡します。HTTP の通信を暗号化する場合、`crypto.transport.createServer(options)` にサーバーの鍵と鍵の保存先を渡し、`crypto.transport.createClient(options)` に鍵交換用の URL を指定します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/crypto.md)（中国語）を参照してください。

## 機能

[API 一覧](../../docs/usage/function/crypto.md#api-reference)（中国語）で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

RelDB の通信鍵レジストリはテーブルを作成します。Redis レジストリは公開鍵とリプレイ防止の情報をキャッシュキーに保存します。

鍵、通信セッション、nonce、差し替え可能なストレージについては[データ構造](../../docs/usage/data/crypto.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/crypto test
```

## ライセンス

Apache-2.0
