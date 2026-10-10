---
name: hai-core
description: "使用 @h-ai/core 配置、日志、i18n、ID、Zod 错误本地化和 HaiResult。"
---

# hai-core

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/core 配置、日志、i18n、ID、Zod 错误本地化和 HaiResult |
| 适用场景 | 启动配置、日志脱敏、国际化或公共错误处理 |
| 输入 | CoreOptions、YAML、环境变量、locale、日志上下文 |
| 输出 | core.init 为同步 void；配置校验为 HaiResult；工具返回直接值 |
| 限制 | core 无 close；浏览器不加载 YAML。配置日志需脱敏，ID 不能当作密钥。 |

## 使用路径

- Node 启动用 core.init({ configDir }) 加载配置；勿传 logging 覆盖 _core.yml 中的日志设置，除非任务明确要求。
- 应用名称、版本、环境、默认语言和日志设置统一从 `_core.yml` 经 core.config 获取，日志使用 core.logger；UI 不另维护硬编码副本。SvelteKit layout / fullstack app.info 仅下发公开字段白名单；独立 Vite mobile-app 在 Node 构建时解析并注入公开值，修改配置后重新构建。浏览器不加载 YAML，不接收完整模块配置、密钥或日志脱敏上下文。
- HAI_<配置名>_<路径> 可整体覆盖根/对象/数组；父节点优先，未覆盖时才遍历已有叶子。camelCase 不拆词，约定变量优先于显式插值。
- 配置 getter 与 ID/logger 方法不是 HaiResult；validate/load 等须检查 success。
- 初始化前创建的默认、模块与嵌套 child Logger 在后续输出中应用当前全局 logging；configure/setLevel 也作用于已有实例。create 的显式 level/format/context 优先，未指定项动态继承。浏览器 json/pretty 与附加 redact 路径实际生效，消息文本仍由调用方脱敏。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- 运行环境
- 适用场景
- 使用步骤
- 核心 API
- 错误码
- 常见模式
- 相关 Skills
- 浏览器侧使用
