# Core 配置

[配置手册](README.md)

## 配置入口

生成项目使用 `config/_core.yml`，配置注册名为 `core`，环境覆盖前缀为 `HAI_CORE_`。覆盖顺序和无敏感值示例见[运行配置](runtime.md#配置从哪里来)。

`core.init({ configDir })` 扫描配置目录，Core 基础配置使用 `CoreConfigSchema`。只有填入 `logging` 对象才套用该对象内的 Schema 默认值。

## 配置示例

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
version: 1.0.0
env: production
logging:
  level: warn
  redact: [customer.email]
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

| 配置项            | 默认值/必填                   | 说明                                                                                            |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `name`            | `"hai Admin"`                 | 应用名称                                                                                        |
| `version`         | `"0.1.0"`                     | 应用版本                                                                                        |
| `env`             | `"development"`               | 应用环境信息，供宿主读取。可填`"development"`、`"production"`、`"test"`、`"staging"`            |
| `logging`         | 可省略                        | 日志配置（可选）                                                                                |
| `logging.level`   | `"info"`                      | 日志级别。可填`"trace"`、`"debug"`、`"info"`、`"warn"`、`"error"`、`"fatal"`                    |
| `logging.format`  | `"json"`（存在 `logging` 时） | 按行输出结构化日志。没有 `logging` 时保留 Logger 初始的 `pretty` 格式。可填`"json"`、`"pretty"` |
| `logging.context` | 可省略                        | 添加到每条日志的稳定上下文，例如服务名和节点 ID                                                 |
| `logging.redact`  | `[]`                          | 额外脱敏路径。支持用 `*` 匹配一层；已知凭据字段始终脱敏。可填数组（元素为字符串）               |
| `defaultLocale`   | `"zh-CN"`                     | 供宿主读取的默认语言元数据。通过 `core.i18n.setGlobalLocale()` 切换 Core 消息语言               |

### 请求访问策略

`RequestAccessConfigSchema` 接受 `false`、`{ file }` 或内联策略。`file` 是服务工作目录下的 `.yml`/`.yaml` 路径，启动读取一次，文件最大 1 MiB。内联字段如下，`global` 和每条命中的 `rules` 取交集。

| 配置项                    | 默认值/必填 | 说明                                                                                                                                                                                      |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global`                  | 可省略      | 所有宿主请求的共同条件；包含健康检查，省略不增加全局限制                                                                                                                                  |
| `global.allowIps`         | `[]`        | 允许的 IPv4/IPv6 地址或 CIDR；空数组不限，最多 1000 项。可填数组（元素为字符串，IPv4 或 字符串，IPv6 或 字符串），最多 1000 项                                                            |
| `global.denyIps`          | `[]`        | 拒绝的 IP/CIDR；拒绝优先，空数组不限，最多 1000 项。可填数组（元素为字符串，IPv4 或 字符串，IPv6 或 字符串），最多 1000 项                                                                |
| `global.timezone`         | `"UTC"`     | 访问时间窗口使用的 IANA 时区，默认 UTC，使用服务器时钟                                                                                                                                    |
| `global.windows`          | `[]`        | 允许的访问时间窗口；空数组不限时间，最多 100 个。可填数组，最多 100 项                                                                                                                    |
| `global.windows[].days`   | 必填        | 允许窗口的开始日，周一 1 至周日 7，至少一项。可填数组（元素为整数，1–7），至少 1 项、最多 7 项                                                                                            |
| `global.windows[].start`  | 必填        | 允许窗口开始时间 HH:mm，包含开始时刻                                                                                                                                                      |
| `global.windows[].end`    | 必填        | 允许窗口结束时间 HH:mm，不含结束；早于开始表示跨午夜，不得与开始相同                                                                                                                      |
| `rules`                   | `[]`        | 路径访问规则，最多 1000 条；全局和所有匹配规则都必须通过。可填数组，最多 1000 项                                                                                                          |
| `rules[].allowIps`        | `[]`        | 允许的 IPv4/IPv6 地址或 CIDR；空数组不限，最多 1000 项。可填数组（元素为字符串，IPv4 或 字符串，IPv6 或 字符串），最多 1000 项                                                            |
| `rules[].denyIps`         | `[]`        | 拒绝的 IP/CIDR；拒绝优先，空数组不限，最多 1000 项。可填数组（元素为字符串，IPv4 或 字符串，IPv6 或 字符串），最多 1000 项                                                                |
| `rules[].timezone`        | `"UTC"`     | 访问时间窗口使用的 IANA 时区，默认 UTC，使用服务器时钟                                                                                                                                    |
| `rules[].windows`         | `[]`        | 允许的访问时间窗口；空数组不限时间，最多 100 个。可填数组，最多 100 项                                                                                                                    |
| `rules[].windows[].days`  | 必填        | 允许窗口的开始日，周一 1 至周日 7，至少一项。可填数组（元素为整数，1–7），至少 1 项、最多 7 项                                                                                            |
| `rules[].windows[].start` | 必填        | 允许窗口开始时间 HH:mm，包含开始时刻                                                                                                                                                      |
| `rules[].windows[].end`   | 必填        | 允许窗口结束时间 HH:mm，不含结束；早于开始表示跨午夜，不得与开始相同                                                                                                                      |
| `rules[].id`              | 必填        | 唯一规则编号，用于日志定位；1–64 个字母数字下划线、点或连字符。可填字符串，1–64 个字符                                                                                                    |
| `rules[].paths`           | 必填        | 完整请求路径列表，包含部署前缀；精确或末尾 /**，最多 100 项。可填数组（元素为字符串，1–2048 个字符），至少 1 项、最多 100 项                                                              |
| `rules[].methods`         | `[]`        | 受该规则约束的 HTTP 方法；空数组全部方法，GET 不隐含 HEAD。可填数组（元素为 `"GET"`、`"HEAD"`、`"POST"`、`"PUT"`、`"PATCH"`、`"DELETE"`、`"OPTIONS"`、`"CONNECT"`、`"TRACE"`），最多 9 项 |
| `rules[].encryption`      | 可省略      | 路径的应用层加解密模式；省略沿用宿主，required 强制加密，disabled 明文；重叠路径和方法不得冲突。可填`"required"`、`"disabled"`                                                            |

## 生效与核对

日志等级影响新写入的日志。重载配置时检查 `core.config.reload()` 的 `success`，并确认消费方是否重新读取了配置。请求访问策略由 [Serv](serv.md) 或 [Kit](kit.md) 载入，见[请求访问策略](request-access.md)。
