# 请求访问策略与真实客户端地址

用于 Serv/SvelteKit 的每次请求限制、独立策略文件和入口代理排查。先确认应用实际宿主和安装版本，不把 IAM 的登录条件当作全部请求的守卫。

## 装配与默认值

独立文件建议置于 `config/security/` 并显式引用，避免 Core 自动把配置根目录的 YAML 当作业务配置预读。Core 不递归自动加载此子目录；策略始终由宿主创建时验证和编译，改变文件后重建宿主。

- Serv：服务端 `_serv.yml` 的 `http.access` / `http.trustedProxies`，转发到 `serv.createApp({ http })`。
- SvelteKit：服务端 `_kit.yml` 的 `access` / `trustedProxies`，初始化后一次性传给 `kit.createHandle`。仅加载配置不代表安装守卫。
- `access` 默认 `false`。内联对象与 `{ file: './config/security/request-access.yml' }` 二选一，不能混合。文件按服务工作目录解析，最大 1 MiB，只在创建宿主时读取；缺失、未知字段、重复键、YAML 别名导致启动失败。修改后重建 App/Handle，不在请求中轮询文件。
- `global` 约束宿主处理的全部请求，包括健康检查；`rules` 按完整 URL pathname 限制指定入口。静态服务器和 S3 直接返回的资源不经过 Node 守卫，另设入口/对象授权。

```yaml
rules:
  - id: external-api
    paths: [/api/v1/external/**]
    methods: [POST]
    encryption: disabled
    allowIps: [192.0.2.0/24]
    denyIps: [192.0.2.42]
    timezone: Asia/Shanghai
    windows:
      - days: [1, 2, 3, 4, 5]
        start: '09:00'
        end: '18:00'
```

全局和所有命中规则取交集；deny 优先。地址/时间列表默认空，不限对应维度；时区默认 UTC。配置了地址限制而无法取得可信地址时拒绝。星期一至日为 1～7，含开始、不含结束，跨午夜按开始日，相同起止无效。路径只支持精确或末尾 `/**`，包含部署 base、大小写敏感；末尾 `/**` 同时匹配该节点和子路径。空 methods 匹配全部，GET 不隐含 HEAD。现有会话、OPTIONS 和密钥交换也受策略约束；不要靠公开认证路径或 transport.excludePaths 绕过它。

## 接口加解密

`rules[].encryption` 只控制应用层协议：`required` 强制加密，`disabled` 使用普通 HTTPS 请求响应，省略沿用宿主。disabled 不跳过 IP、时间、认证或业务授权，不能接收框架加密信封；required 优先于宿主 excludePaths。重叠路径/方法的相反模式在装配时失败，不按先后覆盖。没有宿主 transport 却声明 required 同样失败。密钥交换保持框架协议，OPTIONS 不携带业务密文，均继续检查适用访问条件。

`core.access.createRequestCheck` 返回可调用检查器；`.encryption(path, method)` 只查询索引，`.requiresEncryption` 供宿主验证必需装配，全部公开类型在 core-types。Core 不执行加解密。没有加密规则时选择器是常量空结果，不增加路径扫描；不要为此增加请求期文件读取或逐条正则。

SvelteKit CLI 模板选择 crypto 后可启用 `_kit.yml.transport`；服务端显式装配密钥环和 registry，根 layout 只投影公开 transport 并安装浏览器包装。生产选择 db 和共享数据库，无 db 的内存 registry 仅限开发/测试；不支持的示例明确拒绝配置，不能静默忽略。Fullstack 管理默认强制加密并拒绝 transport:false，外部接口用 scoped disabled 例外。

调用方协议必须匹配服务端。普通外部 HTTP 客户端直接使用 HTTPS；安装全局 fetch 加密的浏览器若需调用明文接口，使用独立接口前缀并同步公开 transport.excludePaths。排除列表按路径段前缀匹配，不能误扩大。服务端访问策略的 IP/时间/文件内容仍不公开，不自动重试或降级协议。

## 真实 IP 的信任链

`trustedProxies` 默认 `auto`，普通宿主相当于 `[]`，不信任转发头。只有受管 Compose 设置 `HAI_DEPLOY_PRIVATE_PROXY=1` 且后端私有、存在入口代理时，才编译本容器网络。不要在公开后端或宿主机手动设置这个内部标志。自管入口明确列出实际代理 IP/CIDR；`[]` 显式关闭。

Node listener 使用 socket 对端；Fetch 必须传可信平台 `remoteAddress`，不能复制头字段。SvelteKit 从受信平台取得对端，解析后的 `event.getClientAddress()` 与 IAM、审计和限流共用。可信 XFF 从右向左停在首个不可信地址；无效链不回退到一个伪造客户端身份。

生成 Nginx 用 `$remote_addr` 覆盖 XFF/X-Real-IP，客户端伪造头不会直接进入后端。外层负载均衡通过 Docker SSH Provider 的 `trustedEdgeProxies` 显式信任；省略或 `[]` 均不信任上游。源 IP 若已被 rootless 端口转发器抹除，应用不能恢复；实际核对代理与后端日志后再启用白名单。

## 部署与公共边界

`.env.<环境>` 或私有覆盖可设置 `HAI_SERV_HTTP_ACCESS='{"file":"./config/security/request-access.yml"}'` / `HAI_KIT_ACCESS=...`。Core 父节点覆盖优先；已有 `HAI_SERV` / `HAI_KIT` 时应修改父对象，不能假定叶子变量会叠加。

部署校验当前选中后端的配置文件，规范化快照放入交付包并参加 SHA-256 校验，容器通过 `/run/hai/request-access.yml` 只读挂载。工程原始引用不回写成容器路径。仅更新前端时保留后端原文件；失败恢复使用旧发布的 Compose/文件。交付 `.env.runtime` 不可随意编辑，配置变化重新打包发布；镜像/配置回退不能撤销数据库和业务效果。

完整 Kit 配置只留在服务端；layout data 只下发 transport 等公开字段，不把策略、代理网段和文件路径用 `?raw` 打入浏览器。

Core 工具只从 `core.access` 调用：`createClientIpResolver`、`normalizeClientIp`、`createConditionCheck`、`createRequestCheck`、`loadPolicy`。仅 Node 有执行能力，浏览器无同名伪实现。公共类型以包入口的 `core-types` 为准，不跨包导入内部函数文件。

## 验证与定位

按变更影响验证精确/子路径/前缀、方法、deny 优先、未知 IP、伪造头、窗口边界、已有会话、预检、握手与加密拒绝；增加明文的允许/拒绝、实际密文成功、模式冲突和未装配加密的失败启动。文件覆盖读取一次和无正文泄漏；部署核对全量、后端增量、仅前端保留、模式快照和失败恢复。

规则在启动时编译，路径走索引、CIDR 走 BlockList、时区格式化按分钟复用；热路径不读文件、不解析配置或全表扫规则。新增性能变化用已构建的公开入口测单规则、多路径仅命中一条、无命中、大地址列表及重叠规则；预热后有界批次，报告环境和指标定义，不把批次均值或 mock 当成生产请求尾延迟。

请求拒绝为 HTTP 403 / `hai:common:104`，登录条件拒绝为 `hai:iam:026`；普通加密请求保留响应加密。提示走 ToastContainer，可读原因优先，traceId 默认隐藏、排查图标展开。日志保留规则 ID、原因、可信地址与 requestId，策略正文及敏感数据不返回客户端。
