---
name: hai-payment
description: "接入微信、支付宝或 Stripe 的订单、回调验签、查单与退款，并处理客户端调起和幂等履约。"
---

# hai-payment

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/payment 创建支付订单、验证回调、查单和退款，客户端调起支付 |
| 适用场景 | 服务端支付集成及客户端调起流程 |
| 输入 | Provider 配置、订单/退款参数、原始回调内容 |
| 输出 | 服务端 HaiResult；客户端 invokePayment 按 client 契约使用 |
| 限制 | 服务端保存凭据并验签；客户端完成不代表付款成功，以可信回调/查单为准。订单履约与重试需幂等。 |

## 使用路径

1. 服务端校验 Provider 配置后 init，真实凭据经私有配置注入；浏览器只导入 `/client`。
2. 订单号、金额单位、商品与用户由服务端可信数据决定，先保存业务订单再创建支付。
3. 回调使用原始 body 与 headers 验签；核对订单、金额、币种及状态，以共享持久存储幂等更新且防止乱序回退。Stripe completed/unpaid 为 pending，只有 status=paid 才履约；eventId 用于去重。客户端调起成功不代表付款完成。
4. 查单、退款与回调重试覆盖成功、失败和重复路径；真实支付仅在用户授权范围内，最后 close。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [运行环境](reference.md#运行环境)
- [依赖](reference.md#依赖)
- [适用场景](reference.md#适用场景)
- [使用步骤](reference.md#使用步骤)
- [核心 API（服务端）](reference.md#核心-api服务端)
- [客户端 API](reference.md#客户端-api)
- [错误码 — `HaiPaymentError`](reference.md#错误码--haipaymenterror)
- [Provider 模式](reference.md#provider-模式)
- [常见模式](reference.md#常见模式)
- [审计日志](reference.md#审计日志)
- [相关 Skills](reference.md#相关-skills)
