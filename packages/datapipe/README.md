# @h-ai/datapipe

数据处理管线模块，提供文本清洗（clean）、分块（chunk）和可组合管线（pipeline）功能。纯函数模块，无需初始化。

## 快速开始

```ts
import { datapipe, DatapipeErrorCode } from '@h-ai/datapipe'

// 直接清洗
const cleaned = datapipe.clean('<p>Hello</p>', { removeHtml: true })

// 按 Markdown 标题分块
const chunks = datapipe.chunk(text, { mode: 'markdown', maxSize: 2000 })

// 管线模式（链式组合多步操作）
const result = await datapipe.pipeline()
  .clean({ removeHtml: true, removeUrls: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
  .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
  .run(rawText)
```

## 分块模式

| 模式      | 说明                             |
| --------- | -------------------------------- |
| sentence  | 按句子分块                       |
| paragraph | 按段落分块                       |
| markdown  | 按 Markdown 标题分块             |
| page      | 按分页符分块                     |
| word      | 按字数分块                       |
| character | 按字符数分块                     |
| custom    | 自定义分隔符（需提供 separator） |

## 错误处理

所有操作返回 `Result<T, DatapipeError>`，通过 `result.success` 判断成功或失败。

```ts
const result = datapipe.chunk(text, { mode: 'custom' })
if (!result.success) {
  switch (result.error.code) {
    case DatapipeErrorCode.MISSING_SEPARATOR:
      // mode='custom' 时需要提供 separator
      break
    case DatapipeErrorCode.CONFIG_ERROR:
      // 配置参数校验失败
      break
  }
}
```

## 测试

```bash
pnpm --filter @h-ai/datapipe test
```

## License

Apache-2.0
