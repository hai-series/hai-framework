# datapipe 数据结构

[English](datapipe.en.md) · [日本語](datapipe.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/datapipe.md) · [功能说明](../function/datapipe.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 清洗和分块后的结果

对应结构：`PipelineResult`。

导入前先清洗文本，再分成便于检索或交给模型的小段。结果由调用返回，Datapipe 不自行保存。

```json
{
  "text": "abcdef",
  "chunks": [
    {
      "index": 0,
      "content": "abc"
    },
    {
      "index": 1,
      "content": "cde"
    },
    {
      "index": 2,
      "content": "ef"
    }
  ]
}
```

abcdef 每块最多3个字符、相邻块重复1个字符，得到 abc、cde、ef；index 从0开始只是块序号。

### Markdown 分块的标题信息

以下是 `datapipe.chunk` 成功结果的 `data`。原文是 `# Q\r\nabcdef`，选 Markdown 模式、每块最多 4 个码点、关闭标题保留。

```json
[
  { "index": 0, "content": "abcd", "metadata": { "title": "Q", "level": 1, "subChunk": true } },
  { "index": 1, "content": "ef", "metadata": { "title": "Q", "level": 1, "subChunk": true } }
]
```

两个块都属于一级标题 `Q`。`subChunk` 表示同一节拆成了多个块，未拆分时省略。标题前没有归属标题的正文使用空标题和级别 `0`。

## 字段、存储与清理参考

### 数据库与缓存

模块不创建 SQL 表或 Redis 键。解析、转换和分块的结果由当前调用返回，可写入 [AI 知识库](ai.md) 或应用存储。

### 处理数据

`PipelineResult.text` 是全部步骤结束后的正文。`chunks` 来自最近一次分块，可由后续分块转换继续修改。URL、文件名、内容类型等来源信息由调用方保存并关联到返回的正文或分块。跨调用去重和清理历史也由调用方负责。
