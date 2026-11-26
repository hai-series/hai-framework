# 请求来源、时段、路径与接口加密

[配置手册](README.md) · [HTTP、代理与加密](http.md) · [登录与账号策略](identity.md) · [部署与恢复](delivery.md)

本章适用于需要限定接口来源、工作时段或传输协议的应用。例如，对外提供的 `/api/v1/external/sync` 通过普通 HTTPS 接收合作方请求，只接受指定网段在工作时间内访问；后台业务接口继续使用框架的双向应用层加密。

先确定受限接口，再配置来源和时间。策略在每次请求时执行：即使用户已经登录，时间窗口结束后的新请求也会被拒绝。IAM 的 `loginAccess` 则只决定能否建立新的登录会话，两者可以分别设置。

## 1. 开发人员：把策略接入正确的入口

### 1.1 选择 Serv 或 SvelteKit

| 应用入口 | 配置位置 | 生效参数 | 默认行为 |
| --- | --- | --- | --- |
| 独立 API、Fullstack 的 Serv 后端 | `config/_serv.yml` | `http.access` → `serv.createApp({ http })` | `false`，不限制请求来源和时段 |
| SvelteKit 的动态页面与接口 | `config/_kit.yml` | `http.access` → `kit.createHandle({ http })` | `false`，不限制请求来源和时段 |
| 浏览器 Vite、静态导出、Nginx 静态文件 | 由实际入口服务器配置 | 没有 Node 请求处理链 | 本章 Node 策略不处理这些请求 |

CLI 生成的 API 和 Fullstack 后端会把 `_serv.yml` 的 `http` 传给 `serv.createApp()`。生成的 SvelteKit 服务会把 `_kit.yml` 的 `http` 传给 `kit.createHandle({ http })`。已有应用可在启动文件或 `hooks.server.ts` 中核对这一步。策略的 IP 名单、时段和文件路径只在服务器上使用。页面加载函数只返回浏览器需要的字段，例如用于发起请求的传输设置。

Serv 的最小配置如下。示例网段只用于说明，正式使用前替换为实际可信来源。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  trustedProxies: auto
  access:
    rules:
      - id: partner-sync
        paths: [/api/v1/external/sync]
        methods: [POST]
        allowIps: [192.0.2.0/24]
        timezone: Asia/Shanghai
        windows:
          - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
```

SvelteKit 使用同一种策略内容，配置层级如下：

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  trustedProxies: auto
  access:
    rules:
      - id: partner-api
        paths: [/yyy/api/v1/external/**]
        allowIps: [192.0.2.0/24]
        timezone: Asia/Shanghai
        windows:
          - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
transport: false
```

第二个示例中的 `/yyy` 是实际网站挂载目录。策略匹配完整 URL pathname；应使用用户请求到达后端时的真实路径。Serv 独立 API 的前缀与 Web 网站目录分别配置，不应把网站目录自动加到所有 API 路径上。

### 1.2 策略执行到哪里

Serv 的业务路由和自定义响应都经过访问策略。内置 CORS 保留在加密外层，预检同样检查适用的规则；正常业务的拒绝响应在传输加密管线内返回。客户端可以读到稳定错误码和可读说明。

Kit 对进入 Handle 的动态页面、接口和数据请求执行策略。SvelteKit adapter 或 Nginx 在 Handle 之前直接提供的静态资源不经过这条处理链。

Nginx 直达对象存储的下载也不经过 Node。若文件下载本身需要 IP 或时段约束，应在实际对象入口另行实施；限制“生成下载链接”的 API 并不会提前终止已签发的有效链接。对象访问方式见[文件存储与临时签名](data.md#文件存储与临时签名)。

## 2. 配置管理人员：理解默认值和组合规则

### 2.1 策略入口

按实际处理 HTTP 请求的服务选择 [Serv 的 `http.access`](serv.md#配置清单) 或 [Kit 的 `http.access`](kit.md#配置清单)。条件字段、默认值和文件约束见 [Core 请求访问策略](core.md#请求访问策略)。

文件引用与内联的 `global/rules` 二选一，混合配置会报错。文件只包含策略正文，不再包一层 `http`、`access` 或 `serv`。

可以把规则文件放在 `config/security/request-access.yml`。`core.init()` 只扫描配置目录直属的 YAML，因此放在 `security/` 下的文件会等到 HTTP 服务创建检查器时再读。`file` 中的相对路径从运行后端进程的工作目录起算。改完规则后重启后端，或由应用重新调用 `serv.createApp()` / `kit.createHandle()`，让新建的检查器读取文件。

全局条件和所有命中规则必须同时满足。例如，全局只允许办公网段，某个接口再要求工作日 09:00–18:00，该接口必须同时满足两项。更具体的路径不会覆盖全局规则；任何一条适用规则拒绝，请求就会停止。没有命中的规则不影响该请求，但仍需满足全局条件。

### 2.2 地址和时间条件

`global` 与每条路径规则均可设置以下字段：

每个 `global` 或路径规则可以分别设允许/拒绝来源和时间窗口，按自己的 IANA 时区解释。拒绝列表优先；同一个规则存在多个时间窗口时，时刻满足其中一个即可。

地址列表各最多 1000 项，时间窗口最多 100 个。配置了地址条件却没有可信客户端 IP 时，请求会被拒绝；不会把代理地址或请求正文里的 IP 当作用户地址。

例如，周一 22:00 到周二 02:00 的窗口写为 `days: [1], start: '22:00', end: '02:00'`。周二凌晨属于周一开始的窗口，02:00 起拒绝。全天允许应省略时间窗口，不用相同起止值表达。

### 2.3 路径边界

`/api/v1/external` 只匹配该路径；`/api/v1/external/**` 同时匹配它和子路径，不匹配 `/api/v1/external-other`。路径大小写敏感，末尾斜杠按同一路径处理。

启用策略后会校验路径编码。正常编码先解码一次再匹配；编码斜杠、反斜杠、双重编码、无效编码、控制字符、重复分隔符和点段会被拒绝，避免入口与业务路由对同一地址产生不同解释。

### 2.4 外部接口使用普通 HTTPS，内部接口保持加密

`encryption` 控制框架的应用层加解密，不控制 HTTPS。选择 `disabled` 后，请求体是普通 JSON，响应也是普通 JSON；不需要 `X-Client-Id` 或密钥协商。生产仍须使用 HTTPS，并保留接口需要的认证、签名、API Key、资源归属或重放控制。

| 取值 | 请求和响应如何处理 | 前置条件 |
| --- | --- | --- |
| 省略 | 用该服务的 `transport` 和 `transport.excludePaths` 决定是否加密 | 默认 `transport: false` |
| `required` | 接口要求使用框架的请求加密，成功与业务拒绝的响应也会加密 | 启动代码须初始化 `crypto`、加载服务端密钥环、连接保存客户端公钥和防重放记录的存储，否则启动失败 |
| `disabled` | 使用普通请求和响应；携带框架加密信封会得到 400，避免密文被误作业务内容 | 调用方按明文接口契约发起 HTTPS 请求；IP、时段和身份守卫仍执行 |

即使路径在 `excludePaths` 中，只要匹配了 `required` 仍须加密。相同路径和方法同时匹配 `required` 和 `disabled` 时，服务创建检查器失败。规则可以为 GET 和 POST 分别设置不同模式。无论使用哪种模式，请求都须满足全局条件和每条匹配规则的 IP 与时段要求。

下面的 Serv 示例将两个接口域分开。路径是业务示例，需要先实现相应路由；网段和工作时段也应替换为实际值。

```yaml schema=@h-ai/serv:ServConfigSchema
transport:
  keyExchangePath: /api/v1/_hai/key-exchange
http:
  access:
    rules:
      - id: partner-sync
        paths: [/api/v1/external/**]
        encryption: disabled
        allowIps: [192.0.2.0/24]
        timezone: Asia/Shanghai
        windows:
          - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
      - id: management
        paths: [/api/v1/internal/**]
        encryption: required
```

使用独立文件时，把 `http.access` 内的 `rules` 移到该文件，把 `transport` 留在 `_serv.yml` 或 `_kit.yml`。第 4 节说明如何引用、校验和发布此文件。服务端密钥通过私有环境变量或密钥管理服务提供。

SvelteKit 在 `_kit.yml` 的 `http.access` 写入相同规则，并在 `transport` 打开请求加密。选择 `crypto` 的生成项目会从私有环境读取密钥环，并使用 Cache 保存客户端公钥和防重放记录。生产环境为所有实例配置同一个 Redis；开发和测试可用内存 Cache。页面加载函数只返回浏览器建立加密连接所需的路径和选项。部署在 `/yyy` 这类目录时，服务端和浏览器的 `basePath` 都要设置成同一个 `/yyy`。生成模板会传入构建基路径。将 `transport.keyExchangePath` 显式设为 `/yyy/api/v1/_hai/key-exchange`，让浏览器通过 SvelteKit 挂载目录协商。已有应用见 [Kit 配置](kit.md#transport)。生产版启用加密时，Redis 不可用或使用内存 Cache 会导致启动失败。此模板默认 `transport: false`。

Fullstack 管理模板的默认选择不同：它要求启用业务传输加密，并明确拒绝 `transport: false`；需要向外部系统提供普通 HTTPS 接口时，使用独立路径的 disabled 规则。这样不会通过关闭全局传输而意外影响后台管理链路。

在已有项目中，修改 YAML 后还要确认后端已传入密钥与存储，并且浏览器已启用相应的加密客户端。仓库的 Admin Console 有完整接入。静态 GitHub Pages 的文件由静态服务器直接返回，HTTP 请求不会进入这里的 Node 检查函数。

调用与确认步骤：

1. 对 disabled 接口发送普通 HTTPS 请求，确认没有框架密钥协商要求，响应也不带 `X-Encrypted: true`。
2. 从不允许的地址或时段访问同一接口，确认返回 403、`hai:common:104` 和追踪编号；不能因为“明文”就跳过限制。
3. 对 required 接口发送缺少协议的普通请求，确认业务处理器没有执行；再用框架加密客户端完成正常请求，确认原始响应在线路上为密文。
4. 浏览器的全局 `fetch` 如果已经启用加密，把普通 HTTPS 外部接口放在独立路径下，并把前缀写到浏览器收到的 `transport.excludePaths`。列表按完整路径段匹配。IP 和时间条件只在服务器判断，请求失败后客户端仍沿用自己设置的加密模式。

required 路径也要从客户端的排除列表中移除，否则客户端仍可能发送普通请求并被服务端拒绝。全局 fetch 的排除列表不按 HTTP 方法区分；同一路径按方法选择不同协议时，调用方必须明确选择相应协议。对外服务优先使用独立前缀，可以减少客户端配置冲突。

密钥交换端点使用自己的协商协议，适用的 IP 和时段限制仍会执行。Serv 挂载 `serv.cors()` 后，会在加密管线外处理带 `Origin` 和 `Access-Control-Request-Method` 的浏览器预检。普通 `OPTIONS` 请求按业务路由处理。Kit 的传输加密跳过所有 `OPTIONS` 请求，适用的 IP 和时段限制仍会执行。

## 3. 运维人员：先确认真实 IP 的来源

![可信代理、HTTP 访问条件与业务资源授权的关系](../images/http-request-boundaries.svg)

### 3.1 直连与自建代理

Serv 从 Node socket 获取对端地址；Kit 使用平台提供的 `getClientAddress()`。不要将请求 JSON 或任意转发头复制为可信地址。

`http.trustedProxies` 默认是 `auto`。直接运行 Node 服务时，它忽略转发头。使用自己的反向代理时，填写代理连接后端所用的 IP 或 CIDR 网段。填写 `[]` 时，后端一律忽略转发头。只有后端确认连接来自已配置的代理，才从右向左读取 `X-Forwarded-For`。缺少该头时再读 `X-Real-IP`。转发链无效或过长时，返回无法确认的客户端地址。

Kit 接入代理解析后，IAM、审计、限流和业务路由的 `getClientAddress()` 使用同一结果。使用 SvelteKit Node adapter 时，保留原始 socket 地址给框架校验，不同时用未经边界校验的 `ADDRESS_HEADER` 覆盖它；其他平台按平台对客户端地址的保证配置。

### 3.2 本框架生成的 Compose

受管部署入口的 `provider.trustedEdgeProxies` 见 [Deploy 配置清单](deploy.md#provider)。

Fullstack 的 Web Nginx，以及自建对象存储所需的 SSR/API 网关，会把后端收口到项目私有容器网络。部署器仅在这种拓扑中向后端注入内部标记 `HAI_DEPLOY_PRIVATE_PROXY=1`。auto 在服务启动时收敛本容器的实际网段，Nginx 则用自己确认的 `$remote_addr` 覆盖 XFF 和 X-Real-IP，清除客户端伪造的转发链。

该模式的条件是后端没有另外发布公网端口，项目容器网络中的成员受同一部署边界管理。不要把该内部标记移植到公网裸机或 `host` 网络模式。自建拓扑应改用明确的代理 IP/CIDR。

如果 Nginx 前面还有可信负载均衡，可在 Docker SSH 部署 Provider 中设置 `trustedEdgeProxies`。未设置时没有可信上游默认值，外部转发头不会被采用。

```yaml schema=@h-ai/deploy:ProviderConfigSchema
type: docker-ssh
expose: { hostPort: 18080, containerPort: 3000 }
trustedEdgeProxies: [192.0.2.10/32]
```

这会让 Nginx 只从指定上游解析 XFF，再向应用发送经过确认的地址。填写的应是入口代理的实际来源，不能填所有公网地址。

受管 Web 代理和独立 SSR/API gateway 只接受白名单真实对端提供的单值 `http` 或 `https` 协议头。其他来源和组合值使用代理自身协议。Host 使用入口请求的 Host，外部 `X-Forwarded-Host`、`X-Forwarded-Port` 和 `Forwarded` 不直接透传。使用[外部 HTTPS 网关](delivery.md#外部-https-网关)时，由网关覆盖客户端提交的转发头。

`trustedEdgeProxies` 只影响实际生成的 Nginx。直接公开 Node 的部署若没有 Nginx，应在 Serv/Kit 的 `http.trustedProxies` 中配置连接它的上游，不能只设置部署 Provider。浏览器配置只接收 `transport` 等公共字段，不应包含内部代理网段和策略文件路径。

rootless 端口转发器有时会把外部来源替换为网关地址。已经丢失的地址无法通过增加一个转发头恢复；应选择保留来源的网络模式，或在外层可信入口完成真实 IP 解析，并实际检查后端收到的结果。

## 4. 运维人员：携带独立 YAML 交付

### 4.1 准备文件

在后端应用目录的 `config/security/request-access.yml` 写入完整策略：

```yaml schema=@h-ai/core:RequestAccessPolicySchema
rules:
  - id: partner-read
    paths: [/api/v1/external/**]
    methods: [GET, HEAD]
    allowIps: [192.0.2.0/24, '2001:db8::/32']
    denyIps: [192.0.2.7]
    timezone: Asia/Shanghai
    windows:
      - { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
  - id: scheduled-sync
    paths: [/api/v1/sync]
    methods: [POST]
    allowIps: [198.51.100.8]
```

规则文件使用字面配置，不解析 dotenv 插值或继续引用其他文件。重复 YAML 键、别名、未知字段、非法地址或时区会导致初始化失败，不会忽略失败后继续开放接口。修改后重新创建服务实例，运行中不监视文件变化。

在 `_serv.yml` 设置 `http.access: { file: ./config/security/request-access.yml }`；SvelteKit 在 `_kit.yml` 设置 `http.access: { file: ./config/security/request-access.yml }`。

### 4.2 从环境变量选择文件

也可以在所选环境文件中整体覆盖策略入口。下面两项按后端类型选择一项：

```dotenv
# Serv 后端
HAI_SERV_HTTP_ACCESS='{"file":"./config/security/request-access.yml"}'
# SvelteKit 后端
HAI_KIT_HTTP_ACCESS='{"file":"./config/security/request-access.yml"}'
```

完整 `HAI_SERV` 或 `HAI_KIT` JSON 是基础，同一来源的子字段变量继续覆盖。生成命令优先输出 `HAI_SERV_HTTP_ACCESS_FILE` / `HAI_KIT_HTTP_ACCESS_FILE` 等细项，JSON 位于对应模块的细项之前。完整环境优先级见[配置来源](runtime.md#配置从哪里来)。

内联规则同样可以用 JSON 传入。例如只对外部同步接口限制来源，并关闭该接口的框架应用层加密：

```dotenv
HAI_SERV_HTTP_ACCESS='{"rules":[{"id":"delivery-sync","paths":["/api/v1/sync"],"allowIps":["192.0.2.10"],"encryption":"disabled"}]}'
```

将示例地址替换为真实允许来源；接口原有认证、API Key 与权限校验继续执行，HTTPS 仍需保留。当前 SDK 的 Node 后端可以修改实际挂载的发布 `.env.runtime` 后重启；已有 `HAI_SERV` 或 `HAI_SERV_HTTP` 上层 JSON 时，分别修改其中的 `http.access` 或 `access`，不能只增加已被覆盖的叶子变量。Kit 同理修改 `HAI_KIT` 的 `http.access` 或 `HAI_KIT_HTTP` 的 `access`。具体路径与保护范围见[重启加载运行配置](runtime.md#部署后重启加载运行配置)。

自行维护且只使用 Compose `env_file` 注入环境的容器，修改该文件后需要**重新创建容器**；`docker compose restart serv` 会保留创建时的变量，见[Docker 说明](https://docs.docker.com/reference/cli/docker/compose/restart/)。通常执行 `docker compose up -d --no-deps --force-recreate serv`，无需重建镜像；沿用原项目名和全部 Compose 文件参数。

### 4.3 全量、增量与回滚

部署器在打包前读取当前应用的配置，并验证独立文件。相对路径按所部署的后端应用目录解析。文件内容形成该次交付的 `request-access.yml` 快照，纳入 SHA-256 校验，并以只读文件挂到后端的 `/run/hai/request-access.yml`。

交付包内的 `.env.runtime` 指向容器中的快照路径；生产者的环境文件仍保留原始路径。服务以非 root 用户运行时也可读取该只读快照，服务器的发布父目录继续限制访问。

| 更新方式 | 策略如何处理 |
| --- | --- |
| 全量部署 | 后端与本次策略快照一起启动，按健康检查确认 |
| 包含后端的增量 | 后端切换到新发布目录的策略；可以调整规则或关闭策略 |
| 仅更新其他服务 | 未选择的后端保留其旧配置、旧挂载和旧策略 |
| 本次更新失败后恢复旧版 | 使用旧服务定义及其对应的旧策略快照，再检查旧版健康 |

归档内的 `.env.runtime` 和策略快照都参加交付校验，上传前不要编辑已经校验的包。替换 SDK 管理的策略快照时，修改源文件并生成新包。已部署 Node 后端的挂载运行文件可按 4.2 修改后重启，不能因此改写归档或策略快照。健康接口也受全局条件约束，因此只想限制外部业务 API 时，优先使用路径规则，避免让部署器的本地探测被误拒绝。

镜像和配置回退不会撤销已经完成的业务写入，数据库迁移和数据恢复按业务方案处理。

### 4.4 运维独立管理文件：修改后重启生效

如果只想改规则并重启容器，让 Compose 把服务器上的策略目录以只读方式挂进容器，配置里的 `file` 始终指向容器内的同一路径。服务启动时读取并检查 YAML，之后用内存中的规则处理请求。修改服务器上的文件后重启后端，下一次启动才会读取新内容。

**自行维护 Compose 的项目**可以使用目录挂载，便于在宿主原子替换文件。以下配置合并到现有 Compose，保留原镜像、端口和其他配置：

```yaml
services:
  serv:
    env_file: .env.runtime
    volumes:
      - ./runtime/security:/run/hai/security:ro
```

`.env.runtime` 中固定使用以下入口；SvelteKit 对应改为 `HAI_KIT_HTTP_ACCESS`：

```dotenv
HAI_SERV_HTTP_ACCESS='{"file":"/run/hai/security/request-access.yml"}'
```

前提是没有完整 `HAI_SERV` 父对象覆盖它；若已经使用父对象，就在父对象的 `http.access` 中设置同一引用，不能同时依赖叶子变量叠加。宿主准备 `runtime/security/request-access.yml`，内容采用 4.1 的完整规则。限制宿主目录的修改权限，并确保容器运行用户可读。新增挂载或首次改变引用时先重新创建容器，此后只改变 YAML：

```sh
docker compose up -d --no-deps --force-recreate serv
# 后续规则文件修改并保存后执行
docker compose restart serv
```

**部署器生成的交付包**默认仍使用 4.3 的不可变快照。若明确由运维独立管理策略，可在交付之外保存一份宿主文件与 Compose override，将已有 `/run/hai/request-access.yml` 挂载替换为外部文件，保持部署器注入的完整 `HAI_SERV` / `HAI_KIT` 引用不变：

```yaml
services:
  serv:
    volumes:
      - type: bind
        source: /opt/hai-config/request-access.yml
        target: /run/hai/request-access.yml
        read_only: true
```

`serv` 要换成实际后端服务名；同源模板可能为 `web`。Compose 按容器目标路径合并挂载，所以只替换这一项。启动或重建时，把该 override 作为**原有完整 `-f` 列表的最后一项**，并使用原项目名。首次应用需要重新创建后端容器；之后原子替换宿主文件并重启同一后端即可。不要编辑校验过的归档或 SDK 策略快照。Node 后端挂载的 `.env.runtime` 按 4.2 更新；它不会改写外部文件或 Nginx。

该 override 及外部文件需要纳入运维自己的部署与备份流程，后续 SDK 发布不会自动保存人工附加的参数。**SDK 回滚不恢复这份外部策略**；如需规则与制品一起自动回滚，继续使用默认快照模式。修改前备份，重启后检查健康状态，并实际请求一条允许路径和一条拒绝路径；规则只限制业务路径时，保留健康探测可达。SvelteKit 可能在首个请求时才创建 Handle，容器显示运行中不足以证明策略已加载。

无效文件或权限错误会阻止服务初始化，不会自动放行。恢复最后可用文件并再次重启，再核对接口响应。对下载或长连接较多的应用，重启前安排连接排空或多实例切换。

## 5. 安全审查与排错

| 现象 | 应检查什么 | 处理方式 |
| --- | --- | --- |
| `hai:common:104` | 当前请求的地址、时间或路径不符合策略 | 用户按提示更换网络或在允许时间重试；管理员用追踪编号查规则编号和原因类别 |
| `hai:iam:026` | 新登录不符合 IAM 的 `loginAccess` | 检查登录来源与时段；与本章请求规则分别核对 |
| 明文接口收到 400 | 请求携带了框架的加密标记或信封 | 调用方关闭该接口的应用层加密；浏览器核对公开排除路径，不关闭 HTTPS |
| `required` 接口启动失败 | 服务端缺少加密配置，或同一路径和方法匹配了相反模式 | 核对路径和方法、Crypto 初始化、服务端密钥和保存客户端公钥的存储。冲突规则应改为互不重叠 |
| 配置文件读取/解析失败 | 文件位置、权限、大小、字段和 YAML 格式 | 修正后重启或重新打包；保留原策略及可用制品 |
| 后端只看到网关地址 | Nginx 入口、可信代理设置或 rootless 网络转换 | 先验证地址链，再配置允许列表；不要用扩大允许范围掩盖地址错误 |

用户界面统一通过 ToastContainer 提示。默认只显示可读说明；点击信息图标可查看或复制追踪编号，供客服或开发进一步定位。日志记录规则编号、原因类别、可信客户端 IP 和请求关联，不向用户回显策略文件正文或完整来源列表。

访问策略与账号权限共同生效。它不会授予接口权限，也不会替代 API Key、租户归属或数据范围检查。关闭策略后，原有认证和权限规则继续执行。

本章策略在 Serv/Kit 请求链执行。Nginx 直接返回的静态资源及[对象存储直连](data.md#配置人员区分三个访问地址)不经过这条链；文件下载需依赖 S3 签名及入口网络策略，不能仅靠 Serv/Kit 的全局配置限制已发出的存储链接。

## 6. 性能与验证

### 6.1 初始化与请求阶段分别做什么

文件读取、Schema 校验、CIDR 编译和路径索引在初始化时完成。请求阶段不读取文件，不重新解析全部规则；精确路径走 Map，前缀路径沿路径树查询，只检查命中的条件。相同时区复用时间格式化器和当前分钟的结果，跨分钟重新计算。

默认关闭时，Serv 不注册请求策略中间件。规则越多不意味着每次都检查全部规则；同一路径若刻意叠加许多规则，则需要满足其中每一条。大规模配置应按业务分组，避免无意义的重复条件。

### 6.2 按真实负载检查容量

规则规模、命中数量和网络处理影响不同：大量不命中的路径主要增加启动索引成本，同一路径叠加大量条件会增加每次请求工作量。先合并相同条件，再按实际业务路径组织规则。

| 输入场景 | 应检查的输出 |
| --- | --- |
| 单条路径，同时设置 IP 与时段 | 允许请求进入业务，任意条件不符时拒绝，记录相同规则编号 |
| 大量不同路径，只命中一条 | 响应正确；分别测启动耗时和稳态延迟，不把编译时间算成每次请求成本 |
| 同一路径命中多条规则 | 每条都生效；测量最坏命中数量下的延迟与CPU，避免重复条件堆叠 |
| 经真实网关启用认证与加密 | 测端到端成功、拒绝、P95延迟和错误率，包含下游服务及实际并发 |

测试时记录硬件、Node版本、规则快照、并发与预热方法。微基准不能代替生产负载；配置上限允许保存的规则数量也不是服务吞吐承诺。

### 6.3 如何复核

从源码仓库运行 Core 策略测试和 CLI 真实代理门禁；后者需要可用容器引擎及测试基础镜像：

```sh
pnpm --filter @h-ai/core exec vitest run tests/core-access.test.ts
pnpm --filter @h-ai/cli test:deploy-gates --testNamePattern 私有后端共享客户端
```

分别检查允许与拒绝地址、时间窗口前后、方法与路径边界、文件加载失败和代理伪造。文件要验证全量交付、后端增量、未选后端保留及失败恢复。复核结果与所测版本关联；配置解析、真实网络请求、浏览器流程和生产恢复分别记录，不互相替代。
