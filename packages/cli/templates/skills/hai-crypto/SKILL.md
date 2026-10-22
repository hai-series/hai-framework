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
| 限制 | crypto 操作先 init；readTransportBody/parseTransportServerKeyRing 为无需 init 的纯工具。password 仅服务端，浏览器仅支持部分能力。传输通过 serv/kit/api-client 顶层装配，不导入内部工厂。 |

## 使用路径

1. `crypto.init()` 无配置参数，检查结果；确认目标端是否支持所需能力，password 仅 Node。
2. 选用公开 asymmetric/hash/symmetric/password 操作，检查 HaiResult；SM3 HMAC 不等同于 SHA-256 HMAC。
3. 传输加密经 serv/kit/api-client 顶层配置接入，统一协商与刷新路径；不导入内部工厂。

服务端必须显式注入受管 `serverKeyRing` 与共享 `keyStore`，没有进程随机私钥或内存 registry 默认值。请求携带协商 serverKeyId；各节点同 ring + registry 支持跨节点、重启和新旧版本轮换。密钥只从 Secret/私有环境注入，不进入公开配置、客户端或日志。开发/测试的内存 registry 须显式选择。

传输字节预算统一使用根入口 `TRANSPORT_BODY_LIMITS`：握手 JSON 16 KiB、公钥 4 KiB、明文 1 MiB、密文 JSON 2 MiB + 4 KiB。自定义适配器用纯函数 `readTransportBody` 消费原流并有界读取；不要 clone/tee。客户端握手超时 30 秒；取消和超限释放 reader，异常密文响应 reject。
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
