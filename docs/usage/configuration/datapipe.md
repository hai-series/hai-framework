# Datapipe 配置

[配置手册](README.md)

## 配置入口

把一段文本和处理选项传给 `datapipe.clean(text, options)` 或 `datapipe.chunk(text, options)`。Datapipe 在每次调用时读取这次的选项。给 AI 知识库导入资料时，可以在 [AI 配置](ai.md#knowledge) 里设置 `knowledge.cleanOptions` 和 `knowledge.chunkOptions`，由知识库将它们传给清洗和切块函数。

## 配置示例

```yaml schema=@h-ai/datapipe:ChunkOptionsSchema
mode: paragraph
maxSize: 1000
overlap: 0
```

直接在代码中传入选项时，可以用下面的短文本看到按词切块的结果。`maxSize: 1` 表示每块最多一个词，原文中词之间的空格会保留。

```ts
import { datapipe } from '@h-ai/datapipe'

const result = datapipe.chunk('alpha beta gamma', { mode: 'word', maxSize: 1 })
if (!result.success)
  throw new Error(result.error.message)
const contents = result.data.map(chunk => chunk.content)
// ['alpha ', 'beta ', 'gamma']
```

## 配置清单

例如调用 `datapipe.chunk(text, { mode: 'paragraph' })`，不填写 `overlap` 会使用 `0`，相邻块不保留重叠内容。导入 AI 知识库时，知识库有自己的默认分块选项，对同一文本切出的块可能不同。

### 文本清洗

| 配置项                             | 默认值/必填 | 说明                                                     |
| ---------------------------------- | ----------- | -------------------------------------------------------- |
| `removeHtml`                       | `true`      | 移除 HTML 标签                                           |
| `removeUrls`                       | `false`     | 移除 URL                                                 |
| `removeEmails`                     | `false`     | 移除 Email 地址                                          |
| `normalizeWhitespace`              | `true`      | 标准化空白字符（多空格→单空格、去掉多余空行，默认 true） |
| `trim`                             | `true`      | 去除首尾空白                                             |
| `customReplacements`               | 可省略      | 传入需匹配的文字或正则，以及替换文本。按数组顺序处理     |
| `customReplacements[].pattern`     | 必填        | 匹配项，支持正则表达式对象及正则格式字符串               |
| `customReplacements[].replacement` | 必填        | 替换得到的字符串                                         |

### 文本分块

| 配置项              | 默认值/必填       | 说明                                                                                                                                  |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`              | 必填              | 按句子、段落、Markdown、页、词、字符或自定义正则分块。可选 `sentence`、`paragraph`、`markdown`、`page`、`word`、`character`、`custom` |
| `maxSize`           | `1500`            | 每块上限包含 overlap/分隔符；word 按非空白词，其他按 Unicode code point，默认 1500。正整数                                            |
| `overlap`           | `0`               | 重叠使用与 maxSize 相同的单位，必须严格小于 maxSize。非负整数                                                                         |
| `separator`         | `custom` 模式必填 | 自定义正则分隔符，由可信调用方提供                                                                                                    |
| `markdownMinLevel`  | `2`               | Markdown 标题分割深度（1-6，默认 2，即 # 和 ## 作为分块边界；设为 3 则 ### 也作为分块边界）。可填整数，1–6                            |
| `markdownKeepTitle` | `true`            | 是否保留 Markdown 标题在分块内容中                                                                                                    |

## 生效与核对

改变分块上限、重叠量或标题设置会改变索引内容。已有索引中保存的旧块需要重新分段后重新入库。
