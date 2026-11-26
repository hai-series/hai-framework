---
name: hai-feedback
description: "接入 @h-ai/feedback 首帖现场采集、本人反馈、双向回复和补充请求。"
---

# hai-feedback

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 提交首帖现场、本人反馈、双方回复、补充请求、状态和附件 |
| 适用场景 | 应用需要用户和处理人员在同一反馈下交流 |
| 输入 | 已初始化的 RelDB、服务端可信会话、手动选择的正文与附件 |
| 输出 | 可查询的反馈、会话、状态和私有附件 |
| 限制 | 用户权限和范围由服务端校验，正文和文件在同一事务中保存 |

## 接入

先初始化 RelDB，再以服务端 `_feedback.yml` 的固定 `appId` 调用 `feedback.init`。应用关闭时先等待 `feedback.close`，再关闭 RelDB。

- Kit 通过 `kit.createFeedbackHandler` 挂载 GET、POST、PATCH。Serv 通过 `serv.createFeedbackProcedures` 挂载 `apiContract.feedback`。可信回调从当前会话解析 `scopeId`、`userId` 和权限。反馈接口的范围用于数据隔离。
- 登录用户具备 `feedback:create` 可提交。作者使用 `reports.listMine` 查询并回复本人反馈。处理人员拥有 `feedback:read` 才能访问同范围的管理列表，另有 `feedback:process` 才能回复、要求补充或标记状态。
- `reports.submit({ id, body, attachments?, capture? })` 原子保存首帖、附件和选中的现场。`capture` 可带截图、浏览器日志、操作回放、录屏或服务端日志勾选。回复与补充请求使用 `reports.addMessage({ id, messageId, kind, body, attachments? })`。人员发送 `request_info` 时转为 `awaiting_user`，作者回复后回到 `pending`。`reports.setStatus` 可标记 `handled` 或恢复 `pending`。
- 每次最多 5 个手动附件，每个 5 MiB，首帖现场与附件共享 10 MiB。浏览器日志和操作回放最多回看 5 分钟，短录屏由用户授权，最长 60 秒。服务端日志按本实例内存中的可信用户、范围和请求编号匹配，宿主应在已认证业务请求中提供与反馈一致的范围。
- 先判断 `HaiResult.success`。调用方为提交或消息预生成 UUID，响应丢失时用原 ID 重试。先用 `reports.get` 读首帖，分页读取 `reports.listMessages`。点击文件时调用鉴权后的 `attachments.get`，按附件 `kind` 预览现场或下载。
- 用 `FeedbackModal` 提交、`FeedbackList` 查看列表和进入对话。已登录页面向 `FeedbackModal` 传入当前账号的 `captureKey`，换号时更新标识，退出时卸载。只给有处理权限的视图启用 `canProcess`。组件通过宿主提供的已鉴权操作读取与写入。
- 开启传输加密时，将 `@h-ai/api-contract/feedback` 的 `apiContract.feedbackTransportRoutes(apiPrefix)` 结果合入 `routePlaintextBytes`，同时确认反向代理容量。它给提交、消息和附件路径设置 16 MiB 明文上限。

验证用两个同范围账号实际走提交流程，检查双方回复、图片与文档、补充请求的状态变化及跨用户或跨范围拒绝。详细 API 和限制见已安装 `@h-ai/feedback` README 所链接的手册。
