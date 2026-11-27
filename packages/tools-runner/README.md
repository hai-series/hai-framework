# @h-ai/tools-runner

[简体中文](./README.md) · [English](./README.en.md) · [日本語](./README.ja.md)

在 Node.js 中把 Tools 工具注册到宿主的 Runner。适配器保存任务回执，提供进度查询、恢复和取消，并把固定容器作业交给宿主登记的环境。

## 快速开始

用 `pnpm add @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner` 安装完整示例所需的包。先初始化 RelDB 和 Runner，再用 `toolsRunner.createService({ ...options, runner })` 登记工具服务。 [依赖和启动顺序](../../docs/usage/function/tools-runner.md#module-dependencies) · [可运行的任务服务](../../docs/usage/function/tools-runner.md#service-example)

## 配置清单

宿主在工厂参数中指定服务 ID、启用的工具和授权策略。容器环境、资源限额与任务保留期由注入的 Runner 管理。 [工具服务配置](../../docs/usage/configuration/tools-runner.md) · [Runner 配置](../../docs/usage/configuration/runner.md)

## 功能说明

- `toolsRunner.createService(options)` 创建可提交、查询、恢复和取消任务的服务。提交和执行分别检查授权。
- `toolsRunner.createJobTools(options)` 组装文档、Office、OCR、网页、预览和视频容器工具。镜像需要由部署方提前准备。 [容器作业的镜像与协议](../tools/jobs/README.md)

## 数据结构

工具任务沿用 Runner 的执行、事件和幂等记录，产物由宿主保存。 [工具回执与数据边界](../../docs/usage/data/tools-runner.md) · [Runner 持久记录](../../docs/usage/data/runner.md)

## 开发测试

```sh
pnpm --filter @h-ai/tools-runner typecheck
pnpm --filter @h-ai/tools-runner lint
pnpm --filter @h-ai/tools-runner build
pnpm --filter @h-ai/tools-runner test
```

## 许可证

Apache-2.0
