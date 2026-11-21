# Crypto 配置文件

[English](crypto.en.md) · [日本語](crypto.ja.md)

[配置手册](README.md)

Crypto 没有独立的 `config/_crypto.yml`，`crypto.init()` 不接收文件配置。算法选项、传输管理器参数和缓存 registry 的 TTL/分钟配额均由代码调用传入，见[调用参数](../function/crypto.md#call-options)。

HTTP 服务的文件配置分别在 `config/_serv.yml` 和 `config/_kit.yml`，字段及生效方式见 [Serv 配置](serv.md)和 [Kit 配置](kit.md)。缓存后端的文件配置见 [Cache](cache.md)；生产私钥由可信启动代码提供，不能写进公开配置。

开发和测试的示例应用从 `.env.dev`、`.env.test` 读取 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`。这两个文件中的密钥仅供示例使用，可以随工程提交，克隆后不需要测试脚本补密钥。生产使用独立私有密钥，保存在 `.env.prod.local` 或 Secret Manager，不能使用公开示例值。所有环境都正常解析并校验密钥环；缺失、无效或不配对会阻止启动。
