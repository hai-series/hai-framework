# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

对象存储模块，提供统一 `storage` 访问入口，支持 S3 兼容存储与本地文件系统。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/storage`。

[跟着最小示例完成接入](../../docs/usage/function/storage.md#quick-start)。

## 配置清单

生成的项目在 `config/_storage.yml` 中设置本地目录或 S3 兼容存储的连接参数。应用启动代码读取该文件，把配置对象传给 `storage.init(config)`。

在[模块配置清单](../../docs/usage/configuration/storage.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

读取完整对象并同时使用 MIME 或 ETag 时，用 `storage.file.getStreamWithMetadata()` 取得同一次读取的元数据和正文。

浏览器从 `@h-ai/storage/client` 导入 `storage`，通过 `storage.client.uploadWithPresignedUrl()` 上传已授权的文件；下载、保存和文件工具也统一放在 `storage.client`，无需初始化。Node 根入口和 Browser 条件入口使用相同的客户端调用方式。

需要显示进度和允许用户取消时，参考[取消上传示例](../../docs/usage/function/storage.md#cancel-upload)。

`storage.dir.delete(prefix)` 按对象键的字符串前缀逐页删除。例如 `reports/draft-` 匹配 `reports/draft-1.txt`，`reports/` 匹配该目录样式的键。空前缀清空容器中的对象。

[查 API 清单](../../docs/usage/function/storage.md#api-reference)，包含调用入口、输入、返回值和用法。

<a id="api-概览"></a>

[API 概览](../../docs/usage/function/storage.md#api-概览)

<a id="存储输入约束与跨端能力"></a>

[存储输入约束与跨端能力](../../docs/usage/function/storage.md#存储输入约束与跨端能力)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/storage.md)，了解本地文件和 S3 对象、键、元数据与生命周期。

## 开发测试

```bash
pnpm --filter @h-ai/storage test
```

S3 集成测试需要可用的 Docker 或兼容运行时；同一套初始化、文件、目录、预签名及真实 HTTP 上传下载用例分别在 MinIO 和 RustFS 上运行，不跳过容器启动失败。

- MinIO：[`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio)，从上游源码构建的社区镜像。
- RustFS：[`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs)，官方镜像。

容器使用临时生成的测试凭据，等待服务就绪后通过 S3 API 建桶；最后一个租约释放时移除容器及匿名卷。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package storage`；示例编译不代替真实后端行为验证。

真实 Chrome 回归：先安装可用的 Chrome，设置 `HAI_STORAGE_RUN_BROWSER_GATES=1` 后执行 `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts`。该门禁实际发送 HTTP PUT 并检查原生取消和监听清理；缺少浏览器会失败。

## 许可证

Apache-2.0
