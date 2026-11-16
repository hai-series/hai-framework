# Deploy 配置

[配置手册](README.md)

## 配置入口

CLI 读取项目根 `hai.json` 的 `deploy` 分区，并对选定环境使用 `DeployConfigSchema`。部署模式通过 `deploy.environment` 或 `--env` 选择，`HAI_DEPLOY_` 节点覆盖可以放在所选环境的私有环境文件；使用 `deploy.init()` 的自定义宿主传入同形对象。构建及命令参数见 [CLI 配置](cli.md)。

## 配置示例

```yaml schema=@h-ai/deploy:DeployConfigSchema
provider:
  type: docker-ssh
  ssh:
    host: staging.example.com
    username: deployer
  expose:
    hostPort: 8080
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

### `environment`

| 配置项        | 默认值/必填 | 说明                                                             |
| ------------- | ----------- | ---------------------------------------------------------------- |
| `environment` | 可省略      | 部署环境文件模式；dev/test/prod 或自定义模式，禁止 local/example |

### `provider`

| 配置项                                  | 适用条件                               | 默认值/必填       | 说明                                                                                                                              |
| --------------------------------------- | -------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                              | 通用                                   | 必填              | 应用部署目标平台及其连接参数，按 type 选择对应平台字段。可填`type=vercel` 或 `type=docker-ssh`                                    |
| `provider.type`                         | `type=vercel`                          | 必填              | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填`"vercel"`                                                                     |
| `provider.token`                        | `type=vercel`                          | 必填              | 应用部署：部署平台访问令牌。可填字符串，至少 1 个字符                                                                             |
| `provider.type`                         | `type=docker-ssh`                      | 必填              | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填`"docker-ssh"`                                                                 |
| `provider.ssh`                          | `type=docker-ssh`                      | 可省略            | SSH 连接参数                                                                                                                      |
| `provider.ssh.host`                     | `type=docker-ssh`                      | 必填              | 远程主机地址或 ~/.ssh/config 中的 Host 别名                                                                                       |
| `provider.ssh.port`                     | `type=docker-ssh`                      | `22`              | SSH 端口。可填整数，1–65535                                                                                                       |
| `provider.ssh.username`                 | `type=docker-ssh`                      | 必填              | SSH 用户名                                                                                                                        |
| `provider.ssh.auth`                     | `type=docker-ssh`                      | 可省略            | 认证方式；省略时非空 password 使用密码，否则保留私钥/agent；显式 key 忽略残留密码。可填`"key"`、`"password"`                      |
| `provider.ssh.password`                 | `type=docker-ssh`                      | 可省略            | SSH 密码（保留原值）；密码方式必须非空、无 CR/LF/NUL，UTF-8 不超过 1023 字节                                                      |
| `provider.ssh.identityFile`             | `type=docker-ssh`                      | 可省略            | 私钥文件路径（省略时使用 ssh-agent 或 ~/.ssh 默认密钥）。可填字符串，至少 1 个字符                                                |
| `provider.ssh.knownHostsFile`           | `type=docker-ssh`                      | 可省略            | known_hosts 文件路径（省略时使用默认；配合 CI/临时环境隔离主机指纹）。可填字符串，至少 1 个字符                                   |
| `provider.ssh.strictHostKeyChecking`    | `type=docker-ssh`                      | `true`            | 严格主机密钥校验，默认开启（true→accept-new 首次信任并拒绝变更；false→关闭校验）                                                  |
| `provider.ssh.connectTimeoutSeconds`    | `type=docker-ssh`                      | `10`              | 连接超时（秒）。正整数                                                                                                            |
| `provider.remote`                       | `type=docker-ssh`                      | 存在，见子项      | 远程主机运行参数                                                                                                                  |
| `provider.remote.baseDir`               | `type=docker-ssh`                      | `"/opt/hai/apps"` | 远程应用根目录                                                                                                                    |
| `provider.remote.runtime`               | `type=docker-ssh`                      | `"auto"`          | 远程容器运行时（auto 优先 podman）。可填`"auto"`、`"docker"`、`"podman"`                                                          |
| `provider.expose`                       | `type=docker-ssh`                      | 必填              | 应用暴露方式                                                                                                                      |
| `provider.expose.type`                  | `type=docker-ssh`                      | `"port"`          | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填`"port"`                                                                       |
| `provider.expose.containerPort`         | `type=docker-ssh`                      | `3000`            | 容器内监听端口（adapter-node 默认 3000）。可填整数，1–65535                                                                       |
| `provider.expose.hostPort`              | `type=docker-ssh`                      | 必填              | 宿主机映射端口。可填整数，1–65535                                                                                                 |
| `provider.expose.https`                 | `type=docker-ssh`                      | 可省略            | 可选 HTTPS 入口；files 使用已有证书，letsencrypt 使用官方 Certbot 申请续期，省略保持 HTTP。可填`type=files` 或 `type=letsencrypt` |
| `provider.expose.https.type`            | `type=docker-ssh` / `type=files`       | 必填              | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填`"files"`                                                                      |
| `provider.expose.https.domain`          | `type=docker-ssh` / `type=files`       | 必填              | HTTPS 公开域名；证书必须匹配该域名。可填字符串，最多 253 个字符                                                                   |
| `provider.expose.https.port`            | `type=docker-ssh` / `type=files`       | `443`             | HTTPS 宿主端口，默认 443，须与 HTTP 端口不同。可填整数，1–65535                                                                   |
| `provider.expose.https.redirectHttp`    | `type=docker-ssh` / `type=files`       | `true`            | 普通 HTTP 请求是否以 308 跳转至 HTTPS，健康检查和 ACME 挑战除外                                                                   |
| `provider.expose.https.certificateFile` | `type=docker-ssh` / `type=files`       | 必填              | PEM 完整证书链路径，相对工程根或绝对路径；打包时复制到私有发布目录。可填字符串，至少 1 个字符                                     |
| `provider.expose.https.privateKeyFile`  | `type=docker-ssh` / `type=files`       | 必填              | 未加密 PEM 私钥路径，相对工程根或绝对路径；必须与证书匹配。可填字符串，至少 1 个字符                                              |
| `provider.expose.https.type`            | `type=docker-ssh` / `type=letsencrypt` | 必填              | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填`"letsencrypt"`                                                                |
| `provider.expose.https.domain`          | `type=docker-ssh` / `type=letsencrypt` | 必填              | Let’s Encrypt 单个公网域名，使用 HTTP-01，不支持 IP 或通配符。可填字符串，最多 253 个字符                                         |
| `provider.expose.https.port`            | `type=docker-ssh` / `type=letsencrypt` | `443`             | HTTPS 宿主端口，默认 443，须与 HTTP 端口不同。可填整数，1–65535                                                                   |
| `provider.expose.https.redirectHttp`    | `type=docker-ssh` / `type=letsencrypt` | `true`            | 普通 HTTP 请求是否以 308 跳转至 HTTPS，健康检查和 ACME 挑战除外                                                                   |
| `provider.expose.https.email`           | `type=docker-ssh` / `type=letsencrypt` | 必填              | Let’s Encrypt 账号联系邮箱。可填字符串，邮箱地址                                                                                  |
| `provider.expose.https.acceptTerms`     | `type=docker-ssh` / `type=letsencrypt` | 必填              | 明确同意 Let’s Encrypt 服务条款后才可设置为 true。可填`true`                                                                      |
| `provider.trustedEdgeProxies`           | `type=docker-ssh`                      | 可省略            | Nginx 前方可信负载均衡的 IP/CIDR；省略时不接受外部转发头。可填数组（元素为字符串，IPv4 或 字符串，IPv6 或 字符串），最多 1000 项  |

### `services`

| 配置项                             | 默认值/必填 | 说明                                                                      |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `services`                         | 可省略      | 自动开通依赖服务的服务商及连接配置                                        |
| `services.db`                      | 可省略      | 自动开通关系数据库服务的服务商及连接配置                                  |
| `services.db.provisioner`          | 必填        | 自动开通 db 服务：资源开通服务商。可填`"neon"`                            |
| `services.db.apiKey`               | 必填        | 自动开通 db 服务：服务商 API 密钥。可填字符串，至少 1 个字符              |
| `services.cache`                   | 可省略      | 自动开通缓存服务的服务商及连接配置                                        |
| `services.cache.provisioner`       | 必填        | 自动开通 cache 服务：资源开通服务商。可填`"upstash"`                      |
| `services.cache.email`             | 必填        | 自动开通 cache 服务：服务商账号邮箱。可填字符串，邮箱地址                 |
| `services.cache.apiKey`            | 必填        | 自动开通 cache 服务：服务商 API 密钥。可填字符串，至少 1 个字符           |
| `services.storage`                 | 可省略      | 自动开通对象存储服务的服务商及连接配置                                    |
| `services.storage.provisioner`     | 必填        | 自动开通 storage 服务：资源开通服务商。可填`"cloudflare-r2"`              |
| `services.storage.accessKeyId`     | 必填        | 自动开通 storage 服务：服务商访问密钥 ID。可填字符串，至少 1 个字符       |
| `services.storage.secretAccessKey` | 必填        | 自动开通 storage 服务：对象存储访问密钥 Secret。可填字符串，至少 1 个字符 |
| `services.storage.accountId`       | 必填        | 自动开通 storage 服务：Cloudflare 账号 ID。可填字符串，至少 1 个字符      |
| `services.storage.apiToken`        | 必填        | 自动开通 storage 服务：Cloudflare API 令牌。可填字符串，至少 1 个字符     |
| `services.email`                   | 可省略      | 自动开通邮件服务的配置                                                    |
| `services.email.provisioner`       | 必填        | 自动开通 email 服务：资源开通服务商。可填`"resend"`                       |
| `services.email.from`              | 必填        | 自动开通 email 服务：已验证域名的发件邮箱。可填字符串，邮箱地址           |
| `services.email.apiKey`            | 必填        | 自动开通 email 服务：服务商 API 密钥。可填字符串，至少 1 个字符           |
| `services.sms`                     | 可省略      | 自动开通短信服务的配置                                                    |
| `services.sms.provisioner`         | 必填        | 自动开通 sms 服务：资源开通服务商。可填`"aliyun"`                         |
| `services.sms.signName`            | 必填        | 自动开通 sms 服务：短信服务审核通过的签名。可填字符串，至少 1 个字符      |
| `services.sms.accessKeyId`         | 必填        | 自动开通 sms 服务：服务商访问密钥 ID。可填字符串，至少 1 个字符           |
| `services.sms.accessKeySecret`     | 必填        | 自动开通 sms 服务：服务商访问密钥 Secret。可填字符串，至少 1 个字符       |

### `container`

| 配置项                                               | 默认值/必填 | 说明                                                                                             |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `container`                                          | 可省略      | Docker Compose 部署参数；构建配置位于项目 hai.json.build                                         |
| `container.s3Engine`                                 | `"rustfs"`  | 自建 S3 服务实现；协议仍为 storage.type=s3。可填`"rustfs"`、`"minio"`                            |
| `container.compose`                                  | 可省略      | 以项目镜像角色为单位附加 Compose 运行参数                                                        |
| `container.compose.services`                         | 必填        | 按已构建项目的镜像角色分别设置容器扩展                                                           |
| `container.compose.services.serv`                    | 可省略      | API 后端容器的 Compose 扩展                                                                      |
| `container.compose.services.serv.extra_hosts`        | 可省略      | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名                                   |
| `container.compose.services.serv.extra_hosts.<名称>` | 必填        | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名。可填字符串，IPv4 或 字符串，IPv6 |
| `container.compose.services.web`                     | 可省略      | Web 容器的 Compose 扩展                                                                          |
| `container.compose.services.web.extra_hosts`         | 可省略      | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名                                   |
| `container.compose.services.web.extra_hosts.<名称>`  | 必填        | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名。可填字符串，IPv4 或 字符串，IPv6 |

## 生效与核对

`docker-ssh` 使用本机 OpenSSH。未填写 `ssh` 时可用于生成离线交付物，远端 SSH 发布需要连接参数。配置验证通过后仍需验证目标身份、容器运行时和端口，并实际访问健康检查。HTTPS、离线和增量回滚见[部署场景](delivery.md)。
