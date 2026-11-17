# @h-ai/reach 設定

<!-- translation: partial -->

[原文（中国語）](reach.md) · [データ構造](../data/reach.ja.md) · [API リファレンス](../function/reach.ja.md)

`_reach.yml` に名前付きプロバイダーとテンプレートを設定します。キュー配送では永続データベースを使い、認証情報はサーバー側に保持します。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: console
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `providers[]` | 必須 | 一意な名前と `console`、`smtp`、`aliyun-sms`、`api` のいずれかを指定。 |
| `templates[]` | 省略可 | 名前と本文をチャネル・件名に任意で対応付ける。 |
| `dnd` | 省略可 | 通知を控える時間帯と、遅延・拒否の扱いを設定。 |
| `queue` | 省略可 | 配送の再試行を設定。プロバイダーが安全な再試行を保証する場合のみ再実行。 |

追加の設定項目や利用例は[中国語リファレンス](reach.md)に掲載しています。
