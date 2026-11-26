# @h-ai/feedback

[简体中文](README.md) · [English](README.en.md)

利用者はフィードバックを提出し、同じ問題票で担当者とやり取りできます。提出、双方の返信、追加情報の依頼には画像やファイルを添付できます。担当者は追加情報を依頼し、処理状態を変更できます。

## クイックスタート

```bash
pnpm add @h-ai/feedback @h-ai/reldb
```

[クイックスタート](../../docs/usage/function/feedback.ja.md#quick-start) · [RelDB](../../docs/usage/function/reldb.ja.md)

## 設定一覧

RelDB に接続し、`appId` を渡して Feedback を初期化します。接続例は `config/_feedback.yml` から読み込みます。 [設定](../../docs/usage/configuration/feedback.ja.md)

## 機能

提出、自分の問題票の確認、返信、追加情報の依頼、状態変更、添付の取得方法を確認できます。 [API リファレンス](../../docs/usage/function/feedback.ja.md#api-reference)

## データ構造

問題票、メッセージ、添付はリレーショナル DB に保存します。本文、ファイル、状態変更を 1 トランザクションで保存します。 [データ構造](../../docs/usage/data/feedback.ja.md)

## 開発とテスト

リポジトリのルートで次を実行します。

```bash
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
```

## ライセンス

Apache-2.0
