# 搭建多用户 Agent 工作台

[开发指南](README.md) · [ACP 接入](ai-acp.md) · [工作台示例](../../../apps/agent/README.md)

`apps/agent` 是一个登录后就能提问、查资料或改代码的完整示例。左侧管理自己的任务，中间继续对话及审批，右侧打开工具结果、引用和代码差异。

## 从登录到第一次对话

1. 按[快速开始](../../../apps/agent/README.md#快速开始)启动。先使用本地数据库和文件存储，接入 Codex 的 Responses 网关或 DeepSeek Harness 的 Chat 网关。
2. 创建账号和任务。在「任务设置」保持自动模式，或手动选择共享、个人和独占。预览可查看实际模式、环境和模型。
3. 发出第一条消息后刷新。已经提交的轮次可从原任务继续读取。点击停止才会取消执行；资源释放由执行器核验。

共享模式在固定 DeepSeek Harness 镜像中提供只读对话，资料、工具、技能和个人上下文用个人或独占模式。选择工作区、写文件或完全访问时使用独占 Worker。

## 接入资料和权限

- 知识库由 `ai.knowledge.setup` 建立，`ingest` 导入，`retrieve` 只取授权范围内的命中片段。答案旁边可以查看实际引用。
- ACP 用 `scoped.sessions.create` 开启会话，`session.submit` 取得持久回执，`tasks.events` 带事件序号重新读取。通过 `approvals.respond` 记录一次授权、会话授权、长期同类规则或拒绝。
- 文件、代码补丁和工具产物经过当前账号的授权才可下载。保存的任务分支发布显式确认，Git 目标由服务器登记。
- 转写和朗读复用 `ai.audio`。个人偏好通过 `ai.persona` 组装，记忆使用 `ai.memory.scoped`，长对话保留原历史并让新会话使用有界摘要。

扩容时分别运行 API 和领取任务的节点。各节点共用 PostgreSQL、Redis、Qdrant 和对象存储，并保留一致的环境定义。执行节点使用固定镜像与限域出口代理。 [应用配置和输入输出示例](../../../apps/agent/README.md#配置)
