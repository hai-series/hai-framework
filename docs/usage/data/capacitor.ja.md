# @h-ai/capacitor データ構造

[原文（中国語）](capacitor.md) · [設定](../configuration/capacitor.ja.md) · [API リファレンス](../function/capacitor.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### 端末のアクセス認証情報

対応する構造：`hai_access_token`。

ネイティブアプリが安全な保存先から読み、認証 API に使います。

```json
"<access-token:redacted>"
```

トークンは秘匿表示です。ログアウト時に削除し、有効性は IAM が判定します。

### 端末の更新用認証情報

対応する構造：`hai_refresh_token`。

期限後に新しいトークンを取得するための値です。

```json
"<refresh-token:redacted>"
```

通常 Preferences ではなく安全な保存先に置きます。ローカル TTL がなくてもサーバーで失効します。

### 端末の一般的な好み

対応する構造：`example:last-tab`。

機密でない画面設定をアプリ独自のキーに保存します。

```json
"orders"
```

orders は次回表示するタブで、組み込みの認証状態ではありません。

## 項目・保存・削除のリファレンス

端末の認証情報は Android のキーストアで保護された暗号化ストレージ、または iOS の Keychain に格納します。サーバーのセッションは IAM が管理します。一般の設定は安全な認証情報ストレージと区別します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_access_token`, `hai_refresh_token` | 安全なトークンアダプターで共有する固定キー。未保存は空。アダプターが読み書き・削除。 |
| Preferences / 設定値 | アプリ指定のキーと一般の文字列。有効期限はなし。同じキーは上書き。 |
