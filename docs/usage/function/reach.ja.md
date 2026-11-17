# @h-ai/reach API リファレンス

<!-- translation: partial -->

[原文（中国語）](reach.md) · [設定](../configuration/reach.ja.md) · [データ構造](../data/reach.ja.md)

<a id="quick-start"></a>

## クイックスタート

Reach と設定済みバックエンドを初期化します。プロバイダーと信頼できる宛先を指定して送信します。キュー配送を再試行するかは記録された状態から判断します。

```bash
pnpm add @h-ai/reach
```

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close()
  },
  {
    name: 'reach',
    start: () => reach.init({
      providers: [
        { name: 'local', type: 'console' }
      ],
      templates: [
        {
          name: 'welcome',
          provider: 'local',
          subject: 'Welcome',
          body: 'Hello {userName}'
        }
      ],
    }),
    close: () => reach.close()
  },
])
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
const closed = await runtime.close()
if (!closed.success) {
  throw new AggregateError(result.success
    ? [closed.error]
    : [result.error, closed.error], 'Reach cleanup failed')
}
if (!result.success)
  throw new Error(result.error.message)
```

```ts
const ready = reach.isInitialized // 无需参数，至少一个通知 Provider 已发布时为 true。
const activeConfig = reach.config // 无需参数，读取脱敏快照；关闭后为 null。
```

<a id="api-reference"></a>

## API 一覧

送信、テンプレート、キューの操作は HaiResult を返します。表は成功時のデータです。close に業務データはありません。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `reach.init` | プロバイダーと、キューを使う場合の依存先を準備 | `config, options?` | `void` | `await reach.init(config)` |
| `reach.close` | サービスを停止してリソースを解放 | なし | `Promise<void>` | `await reach.close()` |
| `reach.send` | 即時送信またはキューに登録 | `message` | `SendResult` | `await reach.send(message)` |
| `reach.template.resolve` | 実際に適用されるテンプレートを取得 | `name` | `ReachTemplate` | `await reach.template.resolve(name)` |
| `reach.template.save` | テンプレートを一件保存 | `template` | `void` | `await reach.template.save(template)` |
| `reach.template.saveBatch` | 複数テンプレートを保存 | `templates` | `void` | `await reach.template.saveBatch(templates)` |
| `reach.template.remove` | 保存済みテンプレートを削除 | `name` | `void` | `await reach.template.remove(name)` |
| `reach.template.list` | テンプレートを一覧取得 | なし | `ReachTemplate[]` | `await reach.template.list()` |
| `reach.template.render` | 変数を埋め込む。送信はしない | `name, vars` | `RenderedTemplate` | `await reach.template.render(name, { code: '123456' })` |
| `reach.queue.get` | 送信記録を一件取得 | `queueId` | `ReachQueueEntry or null` | `await reach.queue.get(queueId)` |
| `reach.queue.list` | 条件に一致する送信記録を一覧取得 | `options` | `ReachQueueEntry[]` | `await reach.queue.list({ status: 'unknown' })` |
| `reach.queue.requeueDead` | 再試行できる終了済みの失敗をキューに戻す | `queueId, options` | `void` | `await reach.queue.requeueDead(queueId, retryDecision)` |
| `reach.queue.resolveUnknown` | キュー外で確認できた配信結果を記録 | `queueId, resolution` | `void` | `await reach.queue.resolveUnknown(queueId, verifiedOutcome)` |

キューへの登録は受信の証明ではありません。結果不明の送信を照合する際は、プロバイダーの実際の結果を確認します。

未翻訳：送信結果の照合、失敗キューの復旧、本番での制約。[中国語の該当節](reach.md#detailed-workflow)を参照してください。
