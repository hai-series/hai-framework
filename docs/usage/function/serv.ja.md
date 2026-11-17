# @h-ai/serv API リファレンス

<!-- translation: partial -->

[原文（中国語）](serv.md) · [設定](../configuration/serv.ja.md) · [データ構造](../data/serv.ja.md)

<a id="quick-start"></a>

## クイックスタート

Serv は型付き HTTP 契約を独立した Node サーバーに配置します。待ち受けを始める前に、認証、通信暗号化、信頼できるリクエスト情報の取得を設定します。

```ts
import type { ServConfig } from '@h-ai/serv'
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

export function startApi(closeApp: () => Promise<void>) {
  // 用三个模块的契约生成 HTTP 路由契约。
  const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

  // 将已初始化的业务模块绑定为实现；存储检查所有 key 的归属。
  const procedures = {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    ai: createAiProcedures({ ai }),
  }

  // 使用契约、实现和 HTTP 设置构建 App。
  const app = serv.createApp({
    contract,
    procedures,
    iam,
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
    },
  })

  // 读取已加载的监听配置，返回包含地址和 close() 的句柄。
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  return serv.listen(app, {
    host: server.host,
    port: server.port,
    onListening: info => core.logger.info('API service listening', { port: info.port }),
    onClose: closeApp,
  })
}
```

<a id="api-reference"></a>

## API 一覧

Serv はアプリを組み立てます。Node の待ち受けは listen だけが開始します。ミドルウェア、処理、アダプターでエラーの扱いは異なります。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `serv.createApp` | 契約と処理を HTTP アプリに割り当てる | `options` | `ServHttpApp` | `serv.createApp({ contract, procedures })` |
| `serv.listen` | Node で待ち受け開始。既定は 127.0.0.1:3000 | `app, options?` | `ServNodeServer` | `serv.listen(app, { port: 3001 })` |
| `serv.toFetch` | Fetch リクエストを扱う実装に変換 | `app` | `ServFetchHandler` | `serv.toFetch(app)` |
| `serv.implement` | 型付きのルート処理を定義 | `contract` | `ServImplementer` | `serv.implement(contract)` |
| `serv.parseRequestContext` | リクエストのメタデータを取得。セッション認証はしない | `input` | `ServContext` | `serv.parseRequestContext({ request, remoteAddress })` |
| `serv.buildAuthContextFactory` | 渡したトークン検証を使うコンテキスト作成関数を組む | `verifyToken` | `CreateServContext` | `serv.buildAuthContextFactory(verifyToken)` |
| `serv.resolveRequestLocale` | リクエストヘッダーから言語を決める | `headers` | `string` | `serv.resolveRequestLocale(request.headers)` |
| `serv.cors` | オリジンをまたぐリクエストを設定 | `config?` | `ServMiddleware` | `serv.cors({ origin: 'https://app.example.com' })` |
| `serv.storageAssets` | 許可された公開 Storage オブジェクトを配信 | `config` | `ServMiddleware` | `serv.storageAssets(storageConfig)` |
| `serv.createRuntimeSecurityPolicy` | 配置環境に合うセキュリティ設定を解決 | `input` | `ServRuntimeSecurityPolicy` | `serv.createRuntimeSecurityPolicy(runtimeInput)` |
| `serv.generateSpec` | OpenAPI の仕様を生成 | `contract, options?` | `OpenAPI.Document` | `await serv.generateSpec(contract)` |
| `serv.validateInputOrFail` | 処理内で入力を検証し失敗時は翻訳済みの結果を返す | `schema, input, locale?` | `HaiResult<T>` | `serv.validateInputOrFail(schema, input)` |
| `serv.m` | 指定または現在の言語で文言を取得 | `key, options?` | `string` | `serv.m('serv_validationFailed')` |

借りているデータベースやキャッシュを閉じる前に Node の待ち受けを終了します。認証済みセッションとリクエストのメタデータは分けて扱います。

未翻訳：暗号化通信、ストリーミング・音声、ミドルウェアの接続例。[中国語の該当節](serv.md#detailed-workflow)を参照してください。
