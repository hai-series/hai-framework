# @h-ai/reach 設定

<a id="reach-の設定"></a>

[简体中文](reach.md) · [English](reach.en.md)

[設定一覧](README.ja.md) · [データ構造](../data/reach.ja.md) · [API リファレンス](../function/reach.ja.md)

## 設定の読み込み

生成したプロジェクトでは、送信チャネル、テンプレート、通知を控える時間帯を `config/_reach.yml` に書きます。アプリは起動時に設定を読み、`reach.init()` に渡します。設定を変えたらアプリを再起動します。テンプレート、遅延配信、認証情報の通知を使う場合は、先にデータベースに接続します。

チャネルごとに `email` や `warehouse-webhook` など、異なる `name` を付けます。アプリはこの名前でチャネルを選びます。`${HAI_REACH_...}` の値はサーバーの非公開環境から読み込みます。[設定の読み込み順（中国語）](runtime.md#配置从哪里来)を参照してください。

<a id="configuration-fields"></a>

## 設定一覧

### チャネル共通の項目

| 項目 | 型 | 必須または既定値 | 用途 |
| --- | --- | --- | --- |
| `providers` | リスト | 必須、1 件以上 | このサービスで使える送信チャネル |
| `providers[].name` | 空でない文字列 | 必須、各項目で一意 | アプリやテンプレートがチャネルを選ぶ名前 |
| `providers[].type` | 文字列 | 必須 | `console`（ローカルログ）、`smtp`、`aliyun-sms`、`api` |

### SMTP

`providers[]` で `type: smtp` を指定した項目に書きます。

| 項目 | 型 | 必須または既定値 | 用途 |
| --- | --- | --- | --- |
| `host` | 空でない文字列 | 必須 | SMTP サーバーのホスト名 |
| `port` | 整数、1–65535 | `465` | サーバーのポート |
| `secure` | 真偽値 | `true` | 接続の開始時から TLS を使うか |
| `user` | 文字列 | 省略可 | SMTP 認証を使う場合のユーザー名 |
| `pass` | 文字列 | 省略可 | サーバーの非公開環境から渡す SMTP パスワード |
| `from` | 空でない文字列 | 必須 | メールサービスで許可された差出人アドレス |

### Alibaba Cloud SMS

`providers[]` で `type: aliyun-sms` を指定した項目に書きます。

| 項目 | 型 | 必須または既定値 | 用途 |
| --- | --- | --- | --- |
| `accessKeyId` | 空でない文字列 | 必須 | 署名に使う Alibaba Cloud の AccessKey ID |
| `accessKeySecret` | 空でない文字列 | 必須 | サーバーの非公開環境から渡す署名用の AccessKey Secret |
| `signName` | 空でない文字列 | 必須 | 審査済みの SMS 署名 |
| `endpoint` | 文字列 | `dysmsapi.aliyuncs.com` | 直接送信する場合のホスト名 |
| `templateCodes` | キーと値が空でない文字列の対応表 | 省略可 | Reach のテンプレート名から審査済みコードを引く。直接送信では対応表か `extra.templateCode` でコードを指定する |
| `gateway` | オブジェクト | 省略可 | 署名付きリクエストをゲートウェイへ転送する |
| `gateway.url` | HTTP(S) URL | `gateway` を使う場合は必須 | パスを含む URL。認証情報、クエリ、フラグメントは含めない |
| `gateway.allowInsecureHttp` | 真偽値 | `false` | 信頼できる内部ネットワークで平文 HTTP を許可する |
| `gateway.headers` | 文字列から文字列への対応表 | 省略可 | ゲートウェイ向けの追加ヘッダー。`Host` や `Content-Length` は HTTP クライアントが管理する |
| `gateway.body` | 文字列、配列、またはオブジェクト | 省略可 | 文字列はそのまま送る。配列とオブジェクトは JSON にする |

### HTTP API

`providers[]` で `type: api` を指定した項目に書きます。

| 項目 | 型 | 必須または既定値 | 用途 |
| --- | --- | --- | --- |
| `url` | HTTP(S) URL | 必須 | 通知の受信先 |
| `method` | `POST` または `PUT` | `POST` | 通知の送信に使う HTTP メソッド |
| `headers` | 文字列から文字列への対応表 | 省略可 | `X-Api-Key` などの追加ヘッダー。`Idempotency-Key` は Reach が設定する |
| `timeout` | 0 以上の整数、ミリ秒 | `10000` | リクエストごとの待機時間。`0` はタイマーが発火した時点で中止する |
| `redirect` | `error` または `follow` | `error` | 既定でリダイレクトを拒否する。HTTPS を必須にしていない場合は `follow` を選べる |
| `requireHttps` | 真偽値 | 省略可 | `true` で HTTPS URL と `redirect: error` を必須にする |
| `idempotent` | 真偽値 | `false` | 受信側がリクエスト番号を保存し、重複した処理を防ぐことを Reach に伝えます。結果が不明なキュー項目を再試行するかの判定に使います。[倉庫通知の例](#reach-example-warehouse)を参照 |

### テンプレート

| 項目 | 型 | 必須または既定値 | 用途 |
| --- | --- | --- | --- |
| `templates` | リスト | 省略可 | 初期化時に名前ごとにデータベースに保存するテンプレート |
| `templates[].name` | 空でない文字列 | 必須 | 送信時にアプリが選ぶテンプレート名 |
| `templates[].provider` | 空でない文字列 | 必須 | テンプレートが使う既定のチャネル名 |
| `templates[].subject` | 文字列 | 省略可 | メール件名のひな形。`{変数名}` を書ける |
| `templates[].body` | 空でない文字列 | 必須 | 本文のひな形。`{変数名}` を書ける |

### 配信抑制時間と再試行

| 項目 | 型 | 必須または既定値 | 用途 |
| --- | --- | --- | --- |
| `dnd` | オブジェクト | 省略可 | すべてのチャネルに適用する配信抑制の設定 |
| `dnd.enabled` | 真偽値 | `false` | 時間帯と指定した方式を適用する |
| `dnd.strategy` | `discard` または `delay` | `discard` | `discard` は送信を拒否し、`delay` は通常メッセージを保存してあとで送る |
| `dnd.start` | `HH:mm` の文字列 | `'00:00'` | 配信抑制に入る時刻。この時刻を含む |
| `dnd.end` | `HH:mm` の文字列 | `'00:00'` | 配信抑制が終わり、通常送信できる時刻 |
| `queue` | オブジェクト | 省略時は以下の既定値 | 待機メッセージの試行回数と失敗後の待機時間 |
| `queue.maxAttempts` | 整数、1–100 | `5` | 最初の試行を含む合計回数 |
| `queue.retryDelayMs` | 整数、1000–86400000 ミリ秒 | `60000` | 最初の再試行可能な失敗のあとに待つ時間 |
| `queue.maxRetryDelayMs` | 整数、1000–86400000 ミリ秒 | `3600000` | 倍増していく待機時間の上限。`retryDelayMs` 以上 |

通知を控える時間帯にも即時送信を試みる場合は、`reach.send()` に `ignoreDnd: true` を渡します。`sensitive: true` を指定すると、履歴には配信メタデータだけが残ります。どちらの指定もその送信に適用されます。IAM の組み込みの確認コード、パスワード再設定、初期設定の招待では両方を自動で指定します。[通知を控える時間帯の例](../function/reach.ja.md#reach-quiet-hours)を参照してください。

## 設定例

各例は、そのまま 1 つの `_reach.yml` として使える構成です。例のアドレス、SMS テンプレートコード、接続用の認証情報は、実際に使う値に置き換えてください。

<a id="reach-example-local"></a>

### ローカルで送信処理を確認する

最初はコンソールチャネルを使えます。アプリが `local` を指定して送信すると、Reach に処理が渡ったことをローカルのログで確認できます。開発とテスト用の設定です。本番では `console` チャネルの初期化が拒否されます。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: local
    type: console
```

<a id="reach-example-email-code"></a>

### SMTP で確認コードと注文メールを送る

SMTP の `465` ポートを TLS で使い、`from` にはメールサービスが許可した差出人アドレスを指定します。ユーザー名とパスワードはサーバーの非公開環境に置きます。アプリが `order-received` テンプレートに `orderId: order-42` を渡すと、メールの件名は `Order order-42 received` になり、既定の `email` チャネルが使われます。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: smtp
    host: smtp.example.com
    port: 465
    secure: true
    user: ${HAI_REACH_PROVIDERS_0_USER}
    pass: ${HAI_REACH_PROVIDERS_0_PASS}
    from: orders@example.com
templates:
  - name: otp_email
    provider: email
    subject: Your sign-in code
    body: '<p>Your sign-in code is {code}.</p>'
  - name: order-received
    provider: email
    subject: 'Order {orderId} received'
    body: 'Order {orderId} was received.'
```

ログイン確認コードには `otp_email` を使います。テスト値 `vars: { code: '123456' }` を渡すと、件名は `Your sign-in code` で、本文の `{code}` は `123456` になります。実際の送信にはアプリが発行したコードを渡します。[確認コードをメールで送る](../function/reach.ja.md#reach-email-code)を参照してください。

### 社内の HTTP ゲートウェイに通知を送る

アプリが `company-notify` を選ぶと、Reach は宛先と本文などを JSON にして `url` に POST します。この例では、待ち時間の上限は 5 秒で、HTTPS を必須とし、リダイレクトを拒否します。受信サービスが空の HTTP `204` を返すと、Reach はチャネルが受け付けたと判断します。受信側が同じリクエストの重複を防ぐ機能を持たない場合は、`idempotent: false` を使います。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: company-notify
    type: api
    url: https://notify.example.com/messages
    method: POST
    timeout: 5000
    requireHttps: true
    redirect: error
    idempotent: false
    headers:
      X-Api-Key: ${HAI_REACH_PROVIDERS_0_HEADERS_X_API_KEY}
```

<a id="reach-example-sms-code"></a>

### Alibaba Cloud SMS に直接接続して確認コードを送る

Reach のテンプレート名を `otp_sms` とし、`provider: sms` で SMS チャネルを選びます。そのチャネルの `templateCodes` で、`otp_sms` を Alibaba Cloud の承認済みテンプレートコードに対応付けます。Alibaba Cloud 側の変数名も `code` にします。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_PROVIDERS_0_ACCESSKEYID}
    accessKeySecret: ${HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET}
    signName: ${HAI_REACH_PROVIDERS_0_SIGNNAME}
    endpoint: dysmsapi.aliyuncs.com
    templateCodes:
      otp_sms: SMS_100000001
      password_reset_sms: SMS_100000002
templates:
  - name: otp_sms
    provider: sms
    body: 'Your verification code is {code}.'
  - name: password_reset_sms
    provider: sms
    body: 'Reset your password: {resetUrl}. Expires at {expiresAt}.'
```

アプリが `template: 'otp_sms'` と `vars: { code: '123456' }` を渡すと、Reach はローカルのテンプレートの `{code}` を置換し、`TemplateCode=SMS_100000001` と `TemplateParam={"code":"123456"}` を Alibaba Cloud に渡します。利用者が受け取るのは Alibaba Cloud の承認済み本文に `code` を入れた SMS です。`123456` はテスト値です。実際には発行したコードを使います。[確認コードを SMS で送る](../function/reach.ja.md#reach-sms-code)を参照してください。

`endpoint` には直接接続するホスト名を指定します。既定は `dysmsapi.aliyuncs.com` です。Reach が `https://`、パス `/`、署名付きパラメーターを付けます。個別の送信では `extra.templateCode` が対応表より優先されます。

SMS でのパスワード再設定には `password_reset_sms` を使い、`token`、`expiresAt`、`resetUrl` を渡します。二つの例示コードをそれぞれ審査済みのコードに置き換えてください。

<a id="reach-example-sms-gateway"></a>

### 自社ゲートウェイ経由で Alibaba Cloud SMS に送る

`aliyun-sms` に `gateway` を追加すると、Reach は `gateway.url` へ POST します。`endpoint` は直接接続時の項目です。`gateway.url` はパスまで指定します。署名付きパラメーターは Reach がクエリに付けます。この例では、ゲートウェイ用の認証情報を `Authorization` ヘッダーに入れ、`body` を JSON にします。ゲートウェイは署名付きパラメーターを Alibaba Cloud に転送し、HTTP `2xx` と `{"Code":"OK","BizId":"<メッセージ番号>"}` のような受付結果を返します。クエリには電話番号とテンプレート変数が入るので、ゲートウェイやプロキシのログでは伏せてください。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_PROVIDERS_0_ACCESSKEYID}
    accessKeySecret: ${HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET}
    signName: ${HAI_REACH_PROVIDERS_0_SIGNNAME}
    templateCodes:
      otp_sms: SMS_100000001
    gateway:
      url: https://sms-gateway.example.com/dx
      allowInsecureHttp: false
      headers:
        Authorization: ${HAI_REACH_PROVIDERS_0_GATEWAY_HEADERS_AUTHORIZATION}
      body:
        app: orders
templates:
  - name: otp_sms
    provider: sms
    body: 'Your verification code is {code}.'
```

`body: {}` なら空の JSON オブジェクトを送ります。`body` を省略した場合、リクエスト本文はありません。信頼できる内部ネットワークで平文 HTTP が必要なときは、同じ `gateway` に `url: http://sms-gateway.internal/dx` と `allowInsecureHttp: true` を指定できます。リクエストごとに異なるヘッダーや本文を渡す場合は、このチャネルの[ゲートウェイフック](../function/reach.ja.md#reach-init-options)を使います。

### 夜間に不要なリマインダーを見送る

あとで送る必要がない通知には `dnd.strategy: discard` を使います。この設定で `23:10` に通常メッセージを送ると、`reach.send()` は `DND_BLOCKED` を返し、そのメッセージは待ち行列に入りません。翌朝 `08:00` から新しいメッセージを送れます。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: status-hook
    type: api
    url: https://notify.example.com/status
dnd:
  enabled: true
  strategy: discard
  start: '22:00'
  end: '08:00'
```

時刻はサービスプロセスのローカルタイムゾーンで、24 時間制で指定します。`22:00` は通知を控える時間帯に入り、`08:00` は時間帯の外です。複数ノードで運用する場合はタイムゾーンをそろえます。開始と終了が同じ値なら、通知を控える時間帯はありません。

<a id="reach-example-warehouse"></a>

### 夜間に注文通知を保存し、日中に送信と再試行を行う

日中は `vars: { orderId: 'order-42' }` が `order-received` テンプレートの `{orderId}` に入ります。`warehouse-webhook` チャネルで置換済みの本文と注文情報を倉庫へ送ります。[HTTP API で倉庫に通知する](../function/reach.ja.md#reach-api-notification)を参照してください。

あとで送りたい通常メッセージには `dnd.strategy: delay` を使います。先にデータベースに接続します。アプリが `23:10` に `order-received` と `orderId: order-42` を指定して送ると、保存後に `deferred: true` と `queueId` が返ります。翌朝 `08:00` 以降に Reach が待ち行列を確認したときに、送信を試みます。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: warehouse-webhook
    type: api
    url: https://warehouse.example.com/orders
    timeout: 5000
    requireHttps: true
    idempotent: true
templates:
  - name: order-received
    provider: warehouse-webhook
    subject: Order received
    body: 'Order {orderId} was received.'
dnd:
  enabled: true
  strategy: delay
  start: '22:00'
  end: '08:00'
queue:
  maxAttempts: 5
  retryDelayMs: 60000
  maxRetryDelayMs: 120000
```

`order-42` の `queueId` が `00000000-0000-4000-8000-000000000042` だとします。08:00 以降の初回配信では、この番号が `Idempotency-Key` ヘッダーと JSON の `idempotencyKey` に入ります。倉庫がピッキングリストを作成しても、応答が届かなければ Reach にはタイムアウトとして見えます。キューの同じ項目を再試行するときは、同じ番号を送ります。

倉庫側は `Idempotency-Key` ヘッダーから番号を読み取ります。番号に一意制約を付け、番号とピッキングリストを同じデータベーストランザクションで保存します。両方の書き込みが一緒に確定するか、両方とも取り消されます。同じ番号が再び届いたら、既存のリストを読み、`{"messageId":"warehouse-42"}` など元の結果を返します。再試行や遅れて届くリクエストがあり得る間は、番号を保持します。

この処理を受信側に実装してから `idempotent: true` を設定すると、Reach は結果不明の通知を同じ番号で再試行できます。`false` でも番号は送ります。上記のタイムアウト時は `unknown` にして運用担当者が倉庫側の結果を確認します。[即時送信とキューの HTTP リクエスト番号](../function/reach.ja.md#reach-idempotency-key)を参照してください。

最初の再試行可能な失敗から 1 分後に、次の試行が可能になります。その次の失敗後は 2 分待ち、以降も 2 分が上限です。`maxAttempts: 5` には最初の試行も含まれます。Reach は待ち行列に入れるときにこれらの設定を保存します。`queue` の変更は、その後に追加されたメッセージに反映されます。[送信記録](../data/reach.ja.md#send-log)を参照してください。

### 設定が反映されたか確認する

通常のテスト通知を送り、選んだチャネルが受け付けることを確認します。`delay` を有効にした場合は、通知を控える時間帯にも送り、返された `queueId` で `pending` を確認します。時間帯が終わったら配信結果を照会します。手順は[キューの操作](../function/reach.ja.md#queue)を参照してください。
