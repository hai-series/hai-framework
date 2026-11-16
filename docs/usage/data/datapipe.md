# datapipe 数据结构

[English](datapipe.en.md) · [日本語](datapipe.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/datapipe.md) · [功能说明](../function/datapipe.md)

## 数据库与缓存

模块不创建 SQL 表或 Redis 键。解析、转换和分块的结果由当前调用返回，可写入 [AI 知识库](ai.md) 或应用存储。

## 处理数据

处理输入时，文本、片段和附加信息留在当次函数调用中。应用可以读取返回的正文或分块，以及输入中提供的 URL、文件名、内容类型等来源信息。想跨多次调用去重或保留历史时，由应用保存、比较和清理结果。
