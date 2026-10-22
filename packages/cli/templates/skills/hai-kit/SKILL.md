---
name: hai-kit
description: "在 SvelteKit 中接入 hooks、认证守卫、输入校验、响应和同源加密客户端；不用于独立 serv 服务。"
---

# hai-kit

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/kit 集成 SvelteKit hooks、守卫、校验、响应及同源客户端传输 |
| 适用场景 | SvelteKit hooks、load 和同源端点集成 |
| 输入 | SvelteKit handle/RequestEvent、schema、guard、transport |
| 输出 | handle、Response、校验值和客户端请求结果 |
| 限制 | 无 init/close；保留 SvelteKit 控制流异常。跨端共享 HTTP contract 用 api-contract + serv，勿复制到 kit。 |

## 使用路径

1. 仅在 SvelteKit 集成；先查现有 hooks、配置、守卫与路由，不将其套用于独立 serv 应用。
2. 用 createHandle 编排已初始化模块；认证 API 与公开路径复用 kit.auth，客户端复用框架动作。
3. 区分返回 HaiResult 的业务操作与抛 Response/redirect/error 的框架控制流，不吞掉控制流。
4. 对齐 Cookie/CSRF/transport 与服务端配置，验证匿名、登录、权限拒绝和表单失败。

服务端 transport 使用含受管 serverKeyRing、共享 keyStore 的对象，不再接受单独 true。公开 _kit.yml 只保留路径/开关，不放私钥；浏览器无 ring。请求携带协商 serverKeyId，各节点同 ring + registry，不依赖粘性路由；轮换见 hai-crypto。

传输加密按实际请求/响应 body 判断空正文，不信任 Content-Type/Length；非空明文不能借缺头、chunked 或伪造零长度旁路，实际空流保留无 input POST 行为。

transport 与 serv/客户端共享固定 UTF-8 字节预算：握手 JSON 16 KiB、公钥 4 KiB、明文 1 MiB、密文 JSON 2 MiB + 4 KiB。直接有界读取原流，超限/取消停止读取、取消流并释放 reader；请求超限 413、响应超限 500。重建 Request 保留 signal，重建正文移除旧长度/编码头；预算不属于 `_kit.yml` 或环境变量。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [常见模式](reference.md#常见模式)
- [声明式 CRUD 表单字段](reference.md#声明式-crud-表单字段)

Node 请求/SSR 必须用 `core.i18n.runWithLocale(locale, callback)`（kit 同名方法）包裹实际异步 resolve；serv 自动建立请求语言上下文。浏览器 setGlobalLocale/createLocaleStore 继续管理应用语言，SSR 的 UI setter/store 不写全局值。显式 MessageOptions.locale 优先；进程默认语言仅在启动时设置。
