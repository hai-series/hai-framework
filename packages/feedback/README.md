# @h-ai/feedback

[English](README.en.md) · [日本語](README.ja.md)

用户提交反馈并在同一份反馈下与处理人员交流。首帖、双方回复和补充请求均可附上图片和文件。处理人员可要求补充信息或更新状态。

## 快速开始

```bash
pnpm add @h-ai/feedback @h-ai/reldb
```

[快速开始](../../docs/usage/function/feedback.md#quick-start) · [RelDB](../../docs/usage/function/reldb.md)

## 配置清单

应用连接 RelDB 后，以 `appId` 初始化反馈服务。示例部署从 `config/_feedback.yml` 读取配置。 [配置](../../docs/usage/configuration/feedback.md)

## 功能说明

查看提交、读取本人反馈、回复、要求补充信息、标记状态和下载附件的接口与场景。 [功能说明](../../docs/usage/function/feedback.md#api-reference)

## 数据结构

关系库存储反馈、消息和附件。每次提交原子保存正文、文件和相关状态变更。 [数据结构](../../docs/usage/data/feedback.md)

## 开发测试

从仓库根目录运行以下命令。

```bash
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
```

## 许可证

Apache-2.0
