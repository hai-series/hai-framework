---
name: hai-feedback
description: "接入 @h-ai/feedback 提交反馈、本人列表、双向回复、要求补充信息和附件。"
---

# hai-feedback

先初始化 RelDB，再以服务端 `_feedback.yml` 的固定 `appId` 调用 `feedback.init`。应用关闭时先等待 `feedback.close`，再关闭 RelDB。

- Kit 通过 `kit.createFeedbackHandler` 挂载 GET、POST、PATCH。Serv 通过 `serv.createFeedbackProcedures` 挂载 `apiContract.feedback`。可信回调从当前会话解析 `scopeId`、`userId` 和权限。反馈接口的范围用于数据隔离。
- 登录用户具备 `feedback:create` 可提交。作者使用 `reports.listMine` 查询并回复本人反馈。处理人员拥有 `feedback:read` 才能访问同范围的管理列表，另有 `feedback:process` 才能回复、要求补充或标记状态。
- `reports.submit({ id, body, attachments? })` 原子保存首帖和附件。`reports.addMessage({ id, messageId, kind, body, attachments? })` 保存双方回复。人员发送 `request_info` 时转为 `awaiting_user`，作者回复后回到 `pending`。处理人员通过 `reports.setStatus` 标记 `handled` 或恢复 `pending`。
- 附件由用户逐次选择，同一步随正文发送。每次最多 5 个，每个 5 MiB，合计 10 MiB。应用传文件名、媒体类型和 Base64 数据。先判断 `HaiResult.success`。调用方为提交或消息预生成 UUID，响应丢失时用原 ID 重试。
- 先用 `reports.get` 读首帖，分页读取 `reports.listMessages`。点击附件时调用鉴权后的 `attachments.get`，把安全的栅格图像作为图片预览，其他附件提供下载。正文按文本渲染。
- 用 `FeedbackModal` 提交、`FeedbackList` 查看列表和进入对话。只给有处理权限的视图启用 `canProcess`。组件通过宿主提供的已鉴权操作读取与写入。
- 开启传输加密时，将 `@h-ai/api-contract/feedback` 的 `feedbackTransportRoutes(apiPrefix)` 结果合入 `routePlaintextBytes`，同时确认反向代理容量。它给提交、消息和附件路径设置 16 MiB 明文上限。

验证用两个同范围账号实际走提交流程，检查双方回复、图片与文档、补充请求的状态变化及跨用户或跨范围拒绝。详细 API 和限制见已安装 `@h-ai/feedback` README 所链接的手册。
