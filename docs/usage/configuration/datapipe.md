# Datapipe 配置

[配置手册](README.md)

## 配置入口

宿主通过 `datapipe.clean(text, options)` 和 `datapipe.chunk(text, options)` 为每次任务传入选项。纯文本工具由调用方准备参数和输入；由 AI 知识库使用时，依据 [AI 配置](ai.md#knowledge) 中的 `knowledge.cleanOptions` 与 `knowledge.chunkOptions`。

## 配置示例

```yaml schema=@h-ai/datapipe:ChunkOptionsSchema
mode: paragraph
maxSize: 1000
overlap: 0
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

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
