# @h-ai/kit 設定

[原文（中国語）](kit.md) · [データ構造](../data/kit.ja.md) · [API リファレンス](../function/kit.ja.md)

## 設定の読み込み

SvelteKit サーバーの起動時に `config/_kit.yml` を読み込みます。起動コードは `server` で待ち受け先を決めます。`hooks.server.ts` ではアクセスルールと信頼するプロキシを `kit.createHandle()` に渡します。アプリ層の暗号化を使う場合、サーバーは `transport` を `crypto.transport` にも渡します。秘密鍵や共有ストレージへの接続はサーバー側に置きます。

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `server` | 省略可 | 待ち受けの設定。省略すると以下の既定値を使う。 |
| `server.host` | `127.0.0.1` | 待ち受けるホスト名または IP。環境変数 `HOST` が空でなければそちらを優先。 |
| `server.port` | `3000` | 待ち受けポート（1～65535）。有効な環境変数 `PORT` を優先。 |
| `trustedProxies` | `auto` | 転送ヘッダーでクライアント IP を伝えられるプロキシの IP または CIDR。`auto` ではフレームワークが作成した非公開 Compose ネットワーク内のプロキシだけを信頼する。それ以外の環境では既定で転送ヘッダーを無視する。 |
| `access` | `false` | リクエストごとにパス、IP、時刻を確認する。インラインのルールか別の YAML ファイルを指定。詳細は[アクセスルール](core.ja.md#request-access)を参照。 |
| `transport` | `false` | オブジェクトを渡すとアプリ層の暗号化を有効にする。サーバーとクライアントの両方に設定する。 |
| `transport.maxPlaintextBytes` | `auto` | 送受信する平文のサイズ上限。追加の容量指定がなければ 1 MiB。整数で指定するときは 1024～67108864 バイト。 |
| `transport.maxFutureSkewSeconds` | `30` | リクエストの時刻がサーバーより進んでいても許容する秒数（0～1800）。 |
| `transport.maxRequestAgeSeconds` | `300` | リクエストの時刻から有効とみなす秒数（1～3600）。 |
| `transport.routePlaintextBytes` | 省略可 | パスごとの送受信上限（各 1024～67108864 バイト）。キーは `/` で始め、`*` はパスの 1 区間に一致する。 |
| `transport.excludePaths` | `[]` | アプリ層の暗号化を通さないパス。 |
| `transport.keyExchangePath` | `/api/_hai/key-exchange` | 鍵交換のパス。クライアントに設定する URL でアクセスできるようにする。 |

設定を変更したらサービスを再起動します。利用者と同じ URL から Cookie、プロキシ経由で認識される IP、アクセスを拒否すべきリクエストを確認します。暗号化を有効にした場合は、クライアントが鍵交換を終えてリクエストを送れることも確認します。

## 設定例

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  port: 3000
trustedProxies: auto
access: false
```

### 既知のリバースプロキシだけを信頼する

`config/_kit.yml` に記述します。例のプロキシ `192.0.2.10` からの転送元情報だけを信頼し、`203.0.113.0/24` のクライアントだけを許可します。両方を実際のネットワークに置き換えます。プロキシの報告を信頼する設定と、クライアントを許可する設定は別です。

```yaml schema=@h-ai/kit:KitConfigSchema
trustedProxies: [192.0.2.10]
access:
  global:
    allowIps: [203.0.113.0/24]
```

### エクスポート API を業務時間内だけ許可する

`/api/v1/reports/export` だけを上海時間の月曜から金曜、09:00〜18:00 に制限します。ログイン済みでも時間外の新しいリクエストは拒否されます。ほかのルートはこの規則に一致せず、認証・権限確認は引き続きアプリが行います。

```yaml schema=@h-ai/kit:KitConfigSchema
access:
  rules:
    - id: report-hours
      paths: [/api/v1/reports/export]
      timezone: Asia/Shanghai
      windows:
        - days: [1, 2, 3, 4, 5]
          start: '09:00'
          end: '18:00'
```
