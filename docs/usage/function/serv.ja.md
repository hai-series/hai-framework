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

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `serv.implement(contract)`, `createApp(options)` | 契約に処理を対応付けて HTTP アプリを作成。 | `serv.implement(contract)` |
| `serv.listen(app, options?)`, `toFetch(app)` | Node で待ち受けるか Fetch ハンドラーに変換。 | `serv.toFetch(app)` |
| `serv.parseRequestContext(input)`, `buildAuthContextFactory(verifyToken)` | 信頼済みリクエスト情報を解析し、指定した検証関数で認証情報を作成。 | `serv.buildAuthContextFactory(verifyToken)` |
| `serv.cors(config?)`, `createRuntimeSecurityPolicy(input)`, `storageAssets(config)` | オリジン処理、リクエスト規則、静的ファイル配信を設定。 | `serv.cors()` |
| `serv.generateSpec(contract, options?)` | 契約から OpenAPI 仕様を生成。 | `serv.generateSpec(contract)` |
| `serv.validateInputOrFail(schema, input, locale?)`, `resolveRequestLocale(headers)`, `m(key, options?)` | リクエストの言語を選択し、入力検証と翻訳済みメッセージの整形を行う。 | `serv.resolveRequestLocale(request.headers)` |

追加の設定項目や利用例は[中国語リファレンス](serv.md)に掲載しています。
