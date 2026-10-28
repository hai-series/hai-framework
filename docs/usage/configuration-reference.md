# 配置索引

完整配置说明统一维护在[应用配置手册](configuration/README.md)，按领域解释用途、默认条件、取值影响、操作和结果。此页保留既有模块链接的查找入口。

## core

[基础、环境覆盖、日志与生命周期](configuration/runtime.md)。

## db

[数据库地址、SQLite、连接池与TLS](configuration/data.md#数据库类型与地址)。

## cache

[Redis、共享状态、超时与键前缀](configuration/data.md#缓存与共享状态)。

## storage

[私有文件、S3、桶与签名期限](configuration/data.md#文件存储与临时签名)。

## iam

[登录、密码、会话、来源、权限和登录页](configuration/identity.md)。

## serv

[监听、健康、文档、CORS与可信代理](configuration/http.md)。

## kit

[SvelteKit、Cookie与请求上下文](configuration/http.md#kitcookie与请求上下文)。

## ai

[模型、知识、记忆、音视频、工具与执行预算](configuration/ai.md)。

## vecdb

[向量Provider、地址、维度与持久条件](configuration/ai.md#向量存储)。

## feedback

[受理/采集/通知、预算、保留及客户端补传](configuration/operations.md#feedback通知采集和保留)。

## reach

[通知通道、免打扰、队列与未知结果](configuration/operations.md#reach通道免打扰与失败队列)。

## audit

[审计采集、保留保护、归档与告警](configuration/operations.md#audit采集保留保护归档与告警)。

## scheduler

[任务租约、时区与恢复](configuration/operations.md#scheduler租约时间与未知执行)。

## payment

[支付渠道、密钥、验签与环境](configuration/experience.md#支付渠道配置)。

## deploy

[构建、SSH、全量/增量、生产与回滚](configuration/delivery.md)。

## clean

[文本清洗参数](configuration/data.md#文本清洗和分块)。

## chunk

[文本分块参数与实际影响](configuration/data.md#文本清洗和分块)。

## 不使用统一YAML的能力

[UI参数、主题与提示](configuration/experience.md)、[API客户端与传输](configuration/http.md)、[原生地址与安全存储](configuration/experience.md#原生地址权限与安全存储)。这些能力使用真实公开工厂/参数，创建同名YAML不会自动启用。
