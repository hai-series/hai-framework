# @h-ai/runner

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · [关系数据库](../reldb/README.md) · [AI 智能体](../ai/README.md)

Runner 在 Node.js 服务端运行受管的 Agent Worker 和工具作业。API 节点提交任务、查询状态和发送取消请求，执行节点领取任务并持有实际容器。任务、租约、事件和执行结果通过关系数据库共享。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/runner @h-ai/reldb`。

[跟着最小示例完成接入](../../docs/usage/function/runner.md#quick-start)。

## 配置清单

<a id="配置"></a>

启动进程时用 `runner.init(options)` 指定这个节点是否执行任务、允许使用的容器环境，以及完成的任务记录保留多久。只提交和查询任务的节点可以关闭执行。

在[模块配置清单](../../docs/usage/configuration/runner.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/runner.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

查看[数据结构](../../docs/usage/data/runner.md)，了解持久任务、执行租约、事件、工作区和容器产物。

## 开发测试

在仓库根目录执行（PowerShell 使用 `pnpm.cmd`）。SQLite 验证任务流程，PostgreSQL/MySQL 验证跨节点归属，Podman/Docker 验证真实容器限制、取消和产物。`HAI_TEST_CONTAINER_ENGINE` 可选择容器引擎；数据库测试还需可用的 Docker 兼容 Testcontainers 接口。`HAI_TEST_RUNNER_ARTIFACT_IMAGE` 指定预先构建的测试工具镜像，启用产物和跨节点预热测试。

```sh
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

## 许可证

Apache-2.0
