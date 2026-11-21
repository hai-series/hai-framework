# @h-ai/reach 設定

<!-- translation: partial -->

[原文（中国語）](reach.md) · [データ構造](../data/reach.ja.md) · [API リファレンス](../function/reach.ja.md)

`_reach.yml` に名前付きプロバイダーとテンプレートを設定します。キュー配送では永続データベースを使い、認証情報はサーバー側に保持します。

## 設定例

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: console
```

### SMTP で注文メールを送る

`config/_reach.yml` に記述します。呼び出し側は `email` という名前でこの送信先を選びます。465 番ポートで TLS を使い、認証情報はサーバーの非公開環境変数から渡します。送信元はメールサービスで許可されたアドレスにします。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: smtp
    host: smtp.example.com
    port: 465
    secure: true
    user: ${SMTP_USER}
    pass: ${SMTP_PASSWORD}
    from: orders@example.com
```

### 社内の HTTP ゲートウェイに通知を送る

サーバーからゲートウェイへ POST し、最大 5 秒待ちます。独自の本文が必要なら初期化時に `gatewayHooks` を渡します。設定ファイルに JavaScript のコールバックは書きません。利用者が任意に指定した URL ではなく、信頼できるサービスを設定します。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: company-notify
    type: api
    url: https://notify.example.com/messages
    method: POST
    timeout: 5000
    headers:
      X-Api-Key: ${NOTIFY_API_KEY}
```

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `providers[]` | 必須 | 一意な名前と `console`、`smtp`、`aliyun-sms`、`api` のいずれかを指定。 |
| `templates[]` | 省略可 | 名前と本文をチャネル・件名に任意で対応付ける。 |
| `dnd` | 省略可 | 通知を控える時間帯と、遅延・拒否の扱いを設定。 |
| `queue` | 省略可 | 配送の再試行を設定。プロバイダーが安全な再試行を保証する場合のみ再実行。 |

未翻訳：プロバイダーの全項目とキュー、再試行、配信抑制時間の設定。[中国語の該当節](reach.md#configuration-fields)を参照してください。
