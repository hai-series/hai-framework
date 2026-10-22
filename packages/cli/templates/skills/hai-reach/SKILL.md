---
name: hai-reach
description: "接入邮件、短信、API 通知与模板，处理发送结果、免打扰和可选持久化。"
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

## 使用路径

- 先配置并注册 Provider，再保存绑定 Provider 的模板；模板发送只传 template/to/vars 即可，显式 provider 可覆盖；直接发送须提供 provider。发送结果须检查，DND/禁用与成功发送区分。
- 验证模板替换和错误分支时使用隔离测试收件人；真实通知须在用户授权范围内。

## 按需参考

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

- 运行环境
- 依赖
- 适用场景
- 使用步骤
- 核心 API
- 错误码
- 常见模式
- 相关 Skills

IAM 通知使用 `otp_email`、`otp_sms`、`password_reset`、`password_reset_sms` 标准模板；将已初始化的 `reach` 传入 `iam.init`。Console Provider 只记录元数据，不输出验证码/令牌，不代替实际邮件/短信发送。
