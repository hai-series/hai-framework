# @h-ai/feedback

[English](README.en.md) · [日本語](README.ja.md)

用户提交反馈并在同一份反馈下与处理人员交流。首帖可以保存截图、近期日志、操作回放和录屏。双方可在回复和补充请求中发送文字、图片和文件，处理人员可更新状态。

## 快速开始

```bash
pnpm add @h-ai/feedback @h-ai/reldb
```

[快速开始](../../docs/usage/function/feedback.md#quick-start) · [RelDB](../../docs/usage/function/reldb.md)

## 配置清单

应用连接 RelDB 后加载 `config/_feedback.yml` 并初始化 Feedback。文件提供应用标识、发送与采集上限和保留期限。 [配置](../../docs/usage/configuration/feedback.md)

## 功能说明

查看采集现场、提交、读取本人反馈、回复、要求补充信息和标记状态的操作与接口。 [完整流程](../../docs/usage/function/feedback.md#feedback-workflow) · [功能说明](../../docs/usage/function/feedback.md#api-reference)

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
