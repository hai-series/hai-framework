---
name: hai-reach
description: "接入邮件、短信、API 通知与模板，处理发送结果、免打扰和可靠延迟入队。"
---

# hai-reach

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/reach 配置邮件、短信、API 通知和多渠道消息模板 |
| 适用场景 | 配置业务通知、验证码渠道或发送模板 |
| 输入 | ReachConfigInput、Provider、模板、收件人与模板参数 |
| 输出 | 发送和模板操作的 HaiResult |
| 限制 | 仅服务端；模板绑定 Provider，遵守 DND。区分测试与真实发送，不记录验证码或收件人敏感内容。 |

API 空 2xx 表示受理成功；非空 JSON 回执上限 64 KiB。redirect 默认 error，敏感消息始终拒绝跳转；requireHttps:true 与 follow 互斥，生产敏感消息省略时要求 HTTPS。未知副作用不自动重投，不输出接收端正文。

## 使用路径

- 使用模板先初始化 reldb，再初始化 Reach；非空配置模板的仓库/保存失败会使 init 返回 CONFIG_ERROR 并关闭候选 Provider。单次发送从同一模板快照渲染内容和选择默认 Provider，显式 provider 仍可覆盖；直接发送须提供 provider。启用 DND delay 也必须先初始化 reldb 并确保队列表可用；成功时 `deferred: true` 与 `queueId` 表示可靠入队，尚未投递；缺库、断连或插入失败须按 HaiResult 失败处理。即时投递与排队状态须区分。
- API 自定义请求头整体视为私密数据，部署时写私有环境文件；`reach.config` 隐藏全部头值，不能只依靠 Authorization/token 等名称识别秘密。
- 验证模板替换和错误分支时使用隔离测试收件人；真实通知须在用户授权范围内。
- 阿里云短信直连需要已审核的编码。在 `templateCodes` 中按本地模板名配置，或发送时传 `extra.templateCode`。配置了 `gateway` 的 `aliyun-sms` 可在 `reach.init` 注入 `gatewayHooks`，并通过 POST 转发已签名查询。受信内网 HTTP 须显式启用，转发日志应脱敏查询串。
- 缓存锁只减少扫描，按实际执行逐条领取并在途续租。API 只有接收端真正具备原子持久去重时才能声明 idempotent=true，全部请求固定用 queueId 作为 Idempotency-Key；旧节点迟到请求也必须去重。SMTP/短信/默认 API 的在途失败或过期转 unknown，禁止自动重发；可信服务端用 queue.get/resolveUnknown 在人工隔离旧 worker、核对外部记录后裁定 sent/discarded。
- queue 重试策略随消息持久保存，默认最多领取 5 次，指数退避 60 秒至 1 小时；永久失败/超限进 dead，满批失败不会原地自旋。可信服务端用 queue.list 查询 dead/unknown；修复根因后以最新 updatedAt 调用 requeueDead，只能恢复 dead，保留同一 queueId 和接收端幂等要求。unknown 不能重排。

## 按需参考

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

- 运行环境
- 依赖
- 适用场景
- 使用步骤
- 核心 API
- 错误码
- 常见模式
- 租约、接收端幂等与未知结果
- 相关 Skills

IAM 通知使用 `otp_email`、`otp_sms`、`password_reset`、`password_reset_sms` 标准模板；将已初始化的 `reach` 传入 `iam.init`。Console Provider 只记录元数据，不输出验证码/令牌，不代替实际邮件/短信发送。

即时发送可传 `ignoreDnd: true`。验证码、重置链接和设密邀请还应传 `sensitive: true`，历史只写投递元数据，遇到免打扰限制时直接返回 `DND_BLOCKED`。IAM 内置通知会自动传入这两个选项。普通通知可用 `deferPolicy: 'reject'` 将免打扰等待交给调用方。
