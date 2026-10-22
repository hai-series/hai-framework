---
name: hai-crypto
description: "实现 SM2/SM3/SM4 加解密、验签、密码哈希，或通过 serv/kit/api-client 接入传输加密。"
---

# hai-crypto

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/crypto 进行 SM2/SM3/SM4、密码哈希与传输加密 |
| 适用场景 | 应用加密、验签、密码保存或传输保护 |
| 输入 | 无参 init、字节/文本、密钥和 transport 装配选项 |
| 输出 | 加解密/验签的 HaiResult；transport 工厂按公开类型使用 |
| 限制 | 先 init；password 仅服务端，浏览器仅支持部分能力。传输通过 serv/kit/api-client 顶层装配，不导入内部工厂。 |

## 使用路径

1. `crypto.init()` 无配置参数，检查结果；确认目标端是否支持所需能力，password 仅 Node。
2. 选用公开 asymmetric/hash/symmetric/password 操作，检查 HaiResult；SM3 HMAC 不等同于 SHA-256 HMAC。
3. 传输加密经 serv/kit/api-client 顶层配置接入，统一协商与刷新路径；不导入内部工厂。
4. 验证加解密往返、错误密钥/签名和关闭，密钥与明文不写日志或浏览器公开配置。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [运行环境](reference.md#运行环境)
- [适用场景](reference.md#适用场景)
- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [错误码 — `HaiCryptoError`](reference.md#错误码--haicryptoerror)
- [常见模式](reference.md#常见模式)
- [相关 Skills](reference.md#相关-skills)
