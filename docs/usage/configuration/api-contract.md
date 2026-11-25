# @h-ai/api-contract 配置

<a id="h-aiapi-contract-文件配置"></a>

[English](api-contract.en.md) · [日本語](api-contract.ja.md)

<a id="configuration-fields"></a>

## 配置入口

本模块没有独立配置文件。应用在代码中选择要组合的 API 契约。登录页所读的公开策略由服务端的 IAM 配置生成，例如验证码开关和允许的登录方式。修改这些策略时，应更新服务端实际加载的 [IAM 配置](iam.md)。

参数、默认值和调用示例见 [公开配置响应](../data/api-contract.md#public-settings)。
