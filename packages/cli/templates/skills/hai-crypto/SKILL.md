---
name: hai-crypto
description: "实现 SM2/SM3/SM4 加解密、验签、密码哈希，或通过 serv/kit/api-client 接入传输加密。"
---

# hai-crypto

transport 仅支持 v2：SM2 发送方签名、独立密钥的 Encrypt-then-HMAC、HTTP 上下文/响应状态绑定及共享原子防重放。GET/HEAD、空 POST 与空响应也认证；无降级开关。TLS 信任边界、5 分钟窗口、nonce 持久化与实现示例见 [参考](reference.md)。

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/crypto 进行 SM2/SM3/SM4、密码哈希与传输加密 |
| 适用场景 | 应用加密、验签、密码保存或传输保护 |
| 输入 | 无参 init、字节/文本、密钥和 transport 装配选项 |
| 输出 | 加解密/验签的 HaiResult；transport 工厂按公开类型使用 |
| 限制 | crypto 操作先 init；readTransportBody/parseTransportServerKeyRing 为无需 init 的纯工具。password 仅服务端，浏览器仅支持部分能力。传输通过 serv/kit/api-client 顶层装配，不导入内部工厂。 |

容量通过 resolveTransportBodyLimits(explicitLimit, { requiredPlaintextBytes }) 合并：省略/auto 才按模块需求推导，显式整数不足时报错，不得静默取大或覆盖。Serv/Kit auto 解析为 undefined；部署代理和 BODY_SIZE_LIMIT 与运行时复用同一结果，反馈业务预算独立。

## 使用路径

1. `crypto.init()` 无配置参数，检查结果；确认目标端是否支持所需能力，password 仅 Node。
2. 选用公开 asymmetric/hash/symmetric/password 操作，检查 HaiResult；SM3 HMAC 不等同于 SHA-256 HMAC。SM4 使用 `symmetric.generateKey()` 生成随机密钥，不提供密码 KDF；密码存储使用服务端 `password.hash()`。
3. 传输加密经 serv/kit/api-client 顶层配置接入，统一协商与刷新路径；不导入内部工厂。
4. 验证加解密往返、错误密钥/签名和关闭，密钥与明文不写日志或浏览器公开配置。

握手公钥先用无需 init 的 `isValidSM2PublicKey` 验证编码和 SM2 曲线点；内置 manager/registry 也校验，serv/kit 在写存储前拒绝。DB registry 用事务共享容量（maxClients 默认 10000、各节点一致），满容量拒绝、不驱逐有效 nonce；配置有限 ttlSeconds，并由应用周期调用 DB 工厂返回的 `pruneExpired()`（每次公钥/nonce 各最多 100 条）。Redis 使用原生 TTL，容量由部署管理。TTL 显式值只能为正整数秒，详见参考中的范围和迁移边界。

服务端必须显式注入受管 `serverKeyRing` 与共享 `keyStore`，没有进程随机私钥或内存 registry 默认值。请求携带协商 serverKeyId；各节点同 ring + registry 支持跨节点、重启和新旧版本轮换。密钥只从 Secret/私有环境注入，不进入公开配置、客户端或日志。开发/测试的内存 registry 须显式选择。

业务容量统一配置 transport.maxPlaintextBytes：UTF-8 JSON 明文字节，默认 1 MiB，有效整数范围 1 KiB～64 MiB，请求和响应共用。客户端从握手获取服务端预算，可选本地上限取较小值；resolveTransportBodyLimits 自动推导密文预算为两倍明文加 32 KiB。握手 JSON 16 KiB、公钥 4 KiB、认证头 16 KiB、路径 8 KiB、认证及防重放保持独立。原流超限/取消立即停止、取消并释放 reader；请求 413、响应返回加密的 500 容量错误，客户端识别 TransportBodyTooLargeError / hai:crypto:070。 自定义适配器使用 manager.bodyLimits 和 readTransportBody 消费原流，不 clone/tee；握手返回 maxPlaintextBytes。

serv/kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的报文返回加密的 HTTP 400 时间错误；客户端抛 `TransportTimeError`（`hai:crypto:071`），提示同步设备和服务器时间后刷新重试。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 保留该原因。不会自动重放请求或放宽防重放窗口；篡改或未认证报文仍返回通用认证失败。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [运行环境](reference.md#运行环境)
- [适用场景](reference.md#适用场景)
- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [错误码 — `HaiCryptoError`](reference.md#错误码--haicryptoerror)
- [常见模式](reference.md#常见模式)
- [相关 Skills](reference.md#相关-skills)
