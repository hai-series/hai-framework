# @h-ai/kit データ構造

[原文（中国語）](kit.md) · [設定](../configuration/kit.ja.md) · [API リファレンス](../function/kit.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### ある利用者の期間内アクセス数

対応する構造：`rate-limit cache value`。

利用者や範囲ごとの頻度を制限し、複数ノードでも枠を共有します。

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

count:2 は2回、resetAt は Unix ミリ秒の期間終了時刻です。この例の期間は60秒で、更新しても延長しません。

### ブラウザー要求のアクセス Cookie

対応する構造：`hai_access_token`。

Kit が検証してから身元を処理側に渡します。

```json
"<access-token:redacted>"
```

値は秘匿、既定は HttpOnly・Lax・Path=/ で、有効時間は認証結果に従います。

### 暗号化対象の一般 Cookie

対応する構造：`encrypted application cookie`。

通常 Cookie の内容を隠し、改ざんを検証します。

```json
"enc:v2:<encrypted-content>"
```

enc:v2: は形式で、後続は実際に復号できない例です。リクエスト番号や期限の変更ではありません。

## 項目・保存・削除のリファレンス

Kit はリクエスト処理を担当します。セッションの永続化は IAM、暗号化通信の状態は Crypto が管理します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai:kit:ratelimit:{<digest>}` | 値は `count` とミリ秒の `resetAt`。ダイジェストにはアプリの名前空間、集計時間、対象を含む。複数インスタンスでは共有 Redis アダプターを使用。 |
| `hai_access_token` | アクセストークンを格納する認証 Cookie。名前は設定可能。 |
