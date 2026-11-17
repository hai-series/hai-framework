# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

向量数据库模块，通过统一的 `vecdb` 对象访问 LanceDB、pgvector、Qdrant、Chroma。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/vecdb`。

[跟着最小示例完成接入](../../docs/usage/function/vecdb.md#quick-start)。

## 配置清单

生成的项目在 `config/_vecdb.yml` 中设置向量数据库的类型和连接参数。应用启动代码读取该文件，把配置对象传给 `vecdb.init(config)`。

在[模块配置清单](../../docs/usage/configuration/vecdb.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/vecdb.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

查看[数据结构](../../docs/usage/data/vecdb.md)，了解集合、向量、元数据、过滤条件与各 Provider 的物理结构。

## 开发测试

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant 测试需要 Docker。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package vecdb`；示例编译不代替真实后端行为验证。

## 许可证

Apache-2.0
