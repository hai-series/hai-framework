# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/core](../core/README.md)

统一支付模块，支持微信支付、支付宝和 Stripe，提供 Provider 模式的后端支付处理与浏览器支付调起能力。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/payment`。

[跟着最小示例完成接入](../../docs/usage/function/payment.md#quick-start)。

## 配置清单

生成的项目在 `config/_payment.yml` 中设置各支付渠道的账号和服务端密钥。应用启动代码读取该文件，把配置对象传给 `payment.init(config)`。

在[模块配置清单](../../docs/usage/configuration/payment.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/payment.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

查看[数据结构](../../docs/usage/data/payment.md)，了解支付渠道状态、商户订单映射与通知幂等记录。

## 开发测试

```bash
pnpm --filter @h-ai/payment typecheck
pnpm --filter @h-ai/payment lint
pnpm --filter @h-ai/payment build
pnpm --filter @h-ai/payment test
node scripts/check-module-jsdoc.mjs --package payment
pnpm --filter @h-ai/payment exec vitest run tests/payment-provider-alipay.test.ts tests/payment-provider-wechat.test.ts tests/payment-provider-stripe.test.ts
```

声明中的示例使用真实 `@h-ai/payment` / `@h-ai/payment/client` 入口，区分配置输入与解析输出、`HaiResult.success` 与业务付款/退款状态。内部签名、协议解析和持久操作仓库标注“模块内部上下文”，不能作为应用的深层导入入口。运行 `node scripts/check-module-jsdoc.mjs --package payment` 校验覆盖及示例类型；它不会执行真实支付、网络请求、设备桥接或业务履约，渠道集成仍需对应验收。详见 [模块 JSDoc 规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
