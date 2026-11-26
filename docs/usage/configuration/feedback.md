# @h-ai/feedback 配置

[English](feedback.en.md) · [日本語](feedback.ja.md)

## 配置入口

应用从服务端配置目录读取 `_feedback.yml`，连接 RelDB 后把配置传给 `feedback.init(config)`。服务端初始化准备反馈表，并在本实例内存中缓冲带可信用户、范围和请求编号的近期 Core 日志。上传边界与固定容量见[关键限制](../function/feedback.md#feedback-limits)。

<a id="configuration-fields"></a>

## 配置清单

| 路径 | 类型 | 是否必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- |
| `appId` | 字符串，1 至 128 字符 | 是 | 无 | 同一数据库中区分应用的固定标识。 |

单次最多 5 个手动附件，每个文件最多 5 MiB。首帖现场与手动附件合计最多 10 MiB。开启加密传输时，在宿主的 `routePlaintextBytes` 合并 `apiContract.feedbackTransportRoutes(apiPrefix)`，给相关反馈路径 16 MiB 明文容量。正常业务的容量继续由宿主按其请求设置。 [功能说明](../function/feedback.md)

## 配置示例

把下例放到订单应用的 `config/_feedback.yml`，并在挂载 API 的服务端实例中加载。成功启动后，订单应用提交的反馈以 `orders` 隔离。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
```
