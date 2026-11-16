# Core の設定

[简体中文](core.md) · [English](core.en.md) · [設定 API](../function/core.ja.md#config-api)

## アプリの設定

Node の起動時に `core.init({ configDir: './config' })` を実行すると、`config/_core.yml` が読み込まれます。検証に通った値は `core` という名前で取得できます。たとえば `HAI_CORE_NAME` で YAML の名前を上書きできます。

| 設定              | 既定値                       | 動作                                                                                                                     |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`            | `"hai Admin"`                | ページや起動ログに表示するアプリ名                                                                                       |
| `version`         | `"0.1.0"`                    | アプリが表示・報告するバージョン。ビルド対象のパッケージバージョンは `package.json` で指定                               |
| `env`             | `"development"`              | 実行環境の情報。`production`、`test`、`staging` も指定できます。`NODE_ENV` はプロセスの起動時に別途設定                  |
| `defaultLocale`   | `"zh-CN"`                    | `core.i18n.setGlobalLocale()` に渡して Core のメッセージ言語を選択                                                       |
| `logging`         | 省略時は現在のログ設定を保持 | オブジェクトを指定するとその設定が反映されます。新規プロセスは `info` と `pretty` で開始                                 |
| `logging.level`   | `"info"`                     | 最低出力レベル。`trace`、`debug`、`info`、`warn`、`error`、`fatal` から選択                                              |
| `logging.format`  | `"pretty"`                   | 端末向け形式。Node で `pino-pretty` が利用できない場合は JSON で出力します。行単位で収集するときは `json` を指定できます |
| `logging.context` | 任意                         | サービス名など、すべてのログに共通で追加する項目                                                                         |
| `logging.redact`  | `[]`                         | 追加で隠すログ項目のパス。`*` は一階層に一致します。既知の認証情報は常に隠されます                                       |

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
defaultLocale: ja-JP
logging:
  level: warn
  format: json
  redact: [customer.email]
```

この例では警告以上を JSON で出力し、メールアドレスを隠します。`format` を省略すると `pretty` になります。`core.init()` に直接渡したログ設定は YAML より優先されます。設定変更後はアプリを再起動するか、ログ設定を明示的に反映します。`core.config.reload()` は保存済みの設定を更新します。

<a id="request-access"></a>

## HTTP リクエストのアクセス制御

Serv では `config/_serv.yml` の `http.access`、SvelteKit では `config/_kit.yml` の最上位にある `access` に設定します。サービスが HTTP アプリやリクエストハンドラーを作るとき、Core の機能でルールを確認します。`_core.yml` は `access` や `global` を受け付けません。

`access` を省略するか `false` にするとアクセスルールは無効です。有効にするには `access` に `global` または `rules` を書きます。別ファイルを使う場合は `access.file` で指定し、ファイルの最上位に `global` または `rules` を書きます。起動時に作業ディレクトリから相対パスを解決して読み込みます。上限は 1 MiB です。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    global:
      allowIps: [192.0.2.0/24]
      denyIps: [192.0.2.7]
    rules:
      - id: orders-hours
        paths: [/api/v1/orders/**]
        timezone: Asia/Shanghai
        windows:
          - days: [1, 2, 3, 4, 5]
            start: '09:00'
            end: '18:00'
```

`global` はヘルスチェックを含め、サービスが受け付けるすべてのリクエストに適用されます。この例では、許可ネットワーク内の `192.0.2.7` も拒否されます。`192.0.2.10` から注文パスにアクセスする場合は、平日の時間条件にも従います。18:00 ちょうどで許可時間が終わります。SvelteKit では `access` のブロック全体を `_kit.yml` の最上位に置きます。

### SvelteKit のリクエストを営業時間に制限する

時間帯の設定は `config/_kit.yml` の最上位に書きます。この例では、上海時間の平日 09:00 から 18:00 になるまで、SvelteKit のハンドラーに届いたリクエストを許可します。対象を API に限定するにはパスルールに設定し、ログイン画面へのアクセスを妨げないようにします。

```yaml schema=@h-ai/kit:KitConfigSchema
access:
  global:
    timezone: Asia/Shanghai
    windows:
      - days: [1, 2, 3, 4, 5]
        start: '09:00'
        end: '18:00'
```

### 別ファイルにポリシーを保存する

次の内容を `config/security/request-access.yml` に保存します。

```yaml schema=@h-ai/core:RequestAccessPolicySchema
global:
  denyIps: [192.0.2.7]
```

Serv では `config/_serv.yml` から参照します。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    file: ./config/security/request-access.yml
```

SvelteKit では `config/_kit.yml` から参照します。

```yaml schema=@h-ai/kit:KitConfigSchema
access:
  file: ./config/security/request-access.yml
```

`file` を使う場合はすべてのルールを参照先に書きます。別の Node HTTP フレームワークでは、起動時に `core.access.createRequestCheck({ file: './config/security/request-access.yml' })` を呼び出します。返された関数にリクエストのパス、メソッド、確認済みのクライアント IP を渡します。

### ポリシーの設定項目

| 項目                          | 既定値                   | 動作                                                                                                                                                                |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global`                      | 任意                     | サービスが処理するリクエストすべてに適用                                                                                                                            |
| `rules`                       | `[]`                     | 最大 1,000 件。`global` と一致したルールのすべてに通る必要があります                                                                                                |
| `allowIps`、`denyIps`         | `[]`                     | 各リストに最大 1,000 件。全体またはルールごとに IPv4、IPv6、CIDR を指定。許可リストが空でなければ、登録されたアドレスに限定されます。拒否が優先です                                          |
| `timezone`                    | `"UTC"`                  | サーバー時刻と組み合わせる IANA タイムゾーン                                                                                                                        |
| `windows`                     | `[]`                     | 最大 100 件。許可する時間帯。`HH:mm` の `start` を含み、`end` は含みません。`days` は月曜が 1、日曜が 7。日付をまたぐ場合は開始日を指定                                          |
| `rules[].id`、`rules[].paths` | 必須                     | 一意の ID（1～64 文字）と 1～100 件のパス（各 1～2048 文字）。配布先の接頭辞も含めます。末尾の `/**` は配下のパスにも一致                                                                                             |
| `rules[].methods`             | `[]`                     | 空配列はすべてのメソッドに一致。`GET` だけを指定した場合、`HEAD` は別途指定                                                                                         |
| `rules[].encryption`          | サービスの通信設定を使用 | `required` は Hai のリクエスト暗号化を必須にし、`disabled` は通常の HTTP リクエスト形式を使います。同一パス・メソッドに指定が競合するとチェック関数を作成できません |

ルール保存後にバックエンドを再起動します。リバースプロキシや別ファイルの詳しい手順は[リクエストアクセスガイド](request-access.md)（中国語）を参照してください。
