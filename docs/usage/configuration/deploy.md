# Deploy 配置

[English](deploy.en.md) · [日本語](deploy.ja.md)

[配置手册](README.md)

## 配置入口

`hai deploy` 读取项目根目录的 `hai.json`，使用 `deploy` 中设置的主机和容器参数。用 `deploy.environment` 或 `--env` 选环境。例如发布到 `prod` 时，可以把 SSH 凭据对应的 `HAI_DEPLOY_` 变量放在本机的 `.env.prod.local`。如果用 TypeScript 自己运行部署任务，把相同结构的配置传给 `deploy.init()`。[CLI 配置](cli.md)

<a id="configuration-fields"></a>

## 配置清单

下表把镜像发布所需设置分为主机连接、入口端口和容器。比如，只制作离线交付包时可以省略整个 `provider.ssh`。要由 CLI 连接目标机发布时，至少要填写主机地址和登录账号。

### `environment`

| 配置项        | 默认值/必填 | 说明                                                             |
| ------------- | ----------- | ---------------------------------------------------------------- |
| `environment` | 可省略      | 部署环境文件模式；dev/test/prod 或自定义模式，禁止 local/example |

### `provider`

| 配置项                                  | 适用条件                               | 默认值/必填                    | 说明                                                                                                                               |
| --------------------------------------- | -------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                              | 通用                                   | 必填                           | 应用部署目标平台及其连接参数，按 type 选择对应平台字段。可填 `type=vercel` 或 `type=docker-ssh`                                    |
| `provider.type`                         | `type=vercel`                          | 必填                           | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填 `"vercel"`                                                                     |
| `provider.token`                        | `type=vercel`                          | 必填                           | 应用部署：部署平台访问令牌。可填字符串，至少 1 个字符                                                                              |
| `provider.type`                         | `type=docker-ssh`                      | 必填                           | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填 `"docker-ssh"`                                                                 |
| `provider.ssh`                          | `type=docker-ssh`                      | 可省略                         | SSH 连接参数                                                                                                                       |
| `provider.ssh.host`                     | `type=docker-ssh`                      | 必填                           | 远程主机地址或 ~/.ssh/config 中的 Host 别名                                                                                        |
| `provider.ssh.port`                     | `type=docker-ssh`                      | `22`                           | SSH 端口。可填整数，1–65535                                                                                                        |
| `provider.ssh.username`                 | `type=docker-ssh`                      | 必填                           | SSH 用户名                                                                                                                         |
| `provider.ssh.auth`                     | `type=docker-ssh`                      | 可省略                         | 认证方式；省略时非空 password 使用密码，否则保留私钥/agent；显式 key 忽略残留密码。可填 `"key"`、`"password"`                      |
| `provider.ssh.password`                 | `type=docker-ssh`                      | 可省略                         | SSH 密码（保留原值）；密码方式必须非空、无 CR/LF/NUL，UTF-8 不超过 1023 字节                                                       |
| `provider.ssh.identityFile`             | `type=docker-ssh`                      | 可省略                         | 私钥文件路径（省略时使用 ssh-agent 或 ~/.ssh 默认密钥）。可填字符串，至少 1 个字符                                                 |
| `provider.ssh.knownHostsFile`           | `type=docker-ssh`                      | 可省略                         | known_hosts 文件路径（省略时使用默认；配合 CI/临时环境隔离主机指纹）。可填字符串，至少 1 个字符                                    |
| `provider.ssh.strictHostKeyChecking`    | `type=docker-ssh`                      | `true`                         | 严格主机密钥校验，默认开启（true→accept-new 首次信任并拒绝变更；false→关闭校验）                                                   |
| `provider.ssh.connectTimeoutSeconds`    | `type=docker-ssh`                      | `10`                           | 连接超时（秒）。正整数                                                                                                             |
| `provider.remote`                       | `type=docker-ssh`                      | `/opt/hai/apps`，运行时 `auto` | 远程主机运行参数                                                                                                                   |
| `provider.remote.baseDir`               | `type=docker-ssh`                      | `"/opt/hai/apps"`              | 远程应用根目录                                                                                                                     |
| `provider.remote.runtime`               | `type=docker-ssh`                      | `"auto"`                       | 远程容器运行时（auto 优先 podman）。可填 `"auto"`、`"docker"`、`"podman"`                                                          |
| `provider.remote.dockerMode` | `type=docker-ssh` | 可省略 | `rootless` 要求 `runtime: docker`，使用目标 SSH 账号的本机用户套接字。缺省或 `default` 沿用普通本机引擎选择。 |
| `provider.expose`                       | `type=docker-ssh`                      | 必填                           | 应用暴露方式                                                                                                                       |
| `provider.expose.type`                  | `type=docker-ssh`                      | `"port"`                       | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填 `"port"`                                                                       |
| `provider.expose.containerPort`         | `type=docker-ssh`                      | `3000`                         | 容器内监听端口（adapter-node 默认 3000）。可填整数，1–65535                                                                        |
| `provider.expose.hostPort`              | `type=docker-ssh`                      | 必填                           | 目标服务器对外监听的 HTTP 端口。可填整数，1–65535                                                                                  |
| `provider.expose.hostAddress` | 外部 HTTPS | 与 `publicUrl` 同时填写 | 绑定具体宿主 IPv4/IPv6。网关同机时可用 `127.0.0.1`。 |
| `provider.expose.publicUrl` | 外部 HTTPS | 与 `hostAddress` 同时填写 | 公开 HTTPS origin，含协议、主机和可选端口。应用路径取自制品。 |
| `provider.expose.https` | Hai 管理 HTTPS | 可省略 | `files` 使用已有证书，`letsencrypt` 由 Certbot 申请续期。与外部 `publicUrl` 二选一。 |
| `provider.expose.https.type`            | `type=docker-ssh` / `type=files`       | 必填                           | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填 `"files"`                                                                      |
| `provider.expose.https.domain`          | `type=docker-ssh` / `type=files`       | 必填                           | HTTPS 公开域名；证书必须匹配该域名。可填字符串，最多 253 个字符                                                                    |
| `provider.expose.https.port`            | `type=docker-ssh` / `type=files`       | `443`                          | 目标服务器对外监听的 HTTPS 端口，默认 443，须与 HTTP 端口不同。可填整数，1–65535                                                   |
| `provider.expose.https.redirectHttp`    | `type=docker-ssh` / `type=files`       | `true`                         | 普通 HTTP 请求是否以 308 跳转至 HTTPS，健康检查和 ACME 挑战除外                                                                    |
| `provider.expose.https.certificateFile` | `type=docker-ssh` / `type=files`       | 必填                           | PEM 完整证书链路径，相对工程根或绝对路径；打包时复制到私有发布目录。可填字符串，至少 1 个字符                                      |
| `provider.expose.https.privateKeyFile`  | `type=docker-ssh` / `type=files`       | 必填                           | 未加密 PEM 私钥路径，相对工程根或绝对路径；必须与证书匹配。可填字符串，至少 1 个字符                                               |
| `provider.expose.https.type`            | `type=docker-ssh` / `type=letsencrypt` | 必填                           | 应用部署：平台/暴露方式，按所在节点的枚举选择。可填 `"letsencrypt"`                                                                |
| `provider.expose.https.domain`          | `type=docker-ssh` / `type=letsencrypt` | 必填                           | Let’s Encrypt 单个公网域名，使用 HTTP-01，不支持 IP 或通配符。可填字符串，最多 253 个字符                                          |
| `provider.expose.https.port`            | `type=docker-ssh` / `type=letsencrypt` | `443`                          | 目标服务器对外监听的 HTTPS 端口，默认 443，须与 HTTP 端口不同。可填整数，1–65535                                                   |
| `provider.expose.https.redirectHttp`    | `type=docker-ssh` / `type=letsencrypt` | `true`                         | 普通 HTTP 请求是否以 308 跳转至 HTTPS，健康检查和 ACME 挑战除外                                                                    |
| `provider.expose.https.email`           | `type=docker-ssh` / `type=letsencrypt` | 必填                           | Let’s Encrypt 账号联系邮箱。可填字符串，邮箱地址                                                                                   |
| `provider.expose.https.acceptTerms`     | `type=docker-ssh` / `type=letsencrypt` | 必填                           | 明确同意 Let’s Encrypt 服务条款后才可设置为 true。可填 `true`                                                                      |
| `provider.trustedEdgeProxies`           | `type=docker-ssh`                      | 可省略                         | Nginx 前方可信负载均衡的 IP/CIDR；省略时不接受外部转发头。可填数组（元素为字符串，IPv4 或 字符串，IPv6 或 字符串），最多 1000 项   |

### `services`

| 配置项                             | 默认值/必填 | 说明                                                                      |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `services`                         | 可省略      | 自动开通依赖服务的服务商及连接配置                                        |
| `services.db`                      | 可省略      | 自动开通关系数据库服务的服务商及连接配置                                  |
| `services.db.provisioner`          | 必填        | 自动开通 db 服务：资源开通服务商。可填 `"neon"`                           |
| `services.db.apiKey`               | 必填        | 自动开通 db 服务：服务商 API 密钥。可填字符串，至少 1 个字符              |
| `services.cache`                   | 可省略      | 自动开通缓存服务的服务商及连接配置                                        |
| `services.cache.provisioner`       | 必填        | 自动开通 cache 服务：资源开通服务商。可填 `"upstash"`                     |
| `services.cache.email`             | 必填        | 自动开通 cache 服务：服务商账号邮箱。可填字符串，邮箱地址                 |
| `services.cache.apiKey`            | 必填        | 自动开通 cache 服务：服务商 API 密钥。可填字符串，至少 1 个字符           |
| `services.storage`                 | 可省略      | 自动开通对象存储服务的服务商及连接配置                                    |
| `services.storage.provisioner`     | 必填        | 自动开通 storage 服务：资源开通服务商。可填 `"cloudflare-r2"`             |
| `services.storage.accessKeyId`     | 必填        | 自动开通 storage 服务：服务商访问密钥 ID。可填字符串，至少 1 个字符       |
| `services.storage.secretAccessKey` | 必填        | 自动开通 storage 服务：对象存储访问密钥 Secret。可填字符串，至少 1 个字符 |
| `services.storage.accountId`       | 必填        | 自动开通 storage 服务：Cloudflare 账号 ID。可填字符串，至少 1 个字符      |
| `services.storage.apiToken`        | 必填        | 自动开通 storage 服务：Cloudflare API 令牌。可填字符串，至少 1 个字符     |
| `services.email`                   | 可省略      | 自动开通邮件服务的配置                                                    |
| `services.email.provisioner`       | 必填        | 自动开通 email 服务：资源开通服务商。可填 `"resend"`                      |
| `services.email.from`              | 必填        | 自动开通 email 服务：已验证域名的发件邮箱。可填字符串，邮箱地址           |
| `services.email.apiKey`            | 必填        | 自动开通 email 服务：服务商 API 密钥。可填字符串，至少 1 个字符           |
| `services.sms`                     | 可省略      | 自动开通短信服务的配置                                                    |
| `services.sms.provisioner`         | 必填        | 自动开通 sms 服务：资源开通服务商。可填 `"aliyun"`                        |
| `services.sms.signName`            | 必填        | 自动开通 sms 服务：短信服务审核通过的签名。可填字符串，至少 1 个字符      |
| `services.sms.accessKeyId`         | 必填        | 自动开通 sms 服务：服务商访问密钥 ID。可填字符串，至少 1 个字符           |
| `services.sms.accessKeySecret`     | 必填        | 自动开通 sms 服务：服务商访问密钥 Secret。可填字符串，至少 1 个字符       |

### `container`

| 配置项                                               | 默认值/必填 | 说明                                                                                             |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `container`                                          | 可省略      | Docker Compose 部署参数；构建配置位于项目 hai.json.build                                         |
| `container.s3Engine`                                 | `"rustfs"`  | 自建 S3 服务实现；协议仍为 storage.type=s3。可填 `"rustfs"`、`"minio"`                           |
| `container.compose`                                  | 可省略      | 以项目镜像角色为单位附加 Compose 运行参数                                                        |
| `container.compose.services`                         | 必填        | 按已构建项目的镜像角色分别设置容器扩展                                                           |
| `container.compose.services.serv`                    | 可省略      | API 后端容器的 Compose 扩展                                                                      |
| `container.compose.services.serv.extra_hosts`        | 可省略      | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名                                   |
| `container.compose.services.serv.extra_hosts.<名称>` | 必填        | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名。可填字符串，IPv4 或 字符串，IPv6 |
| `container.compose.services.web`                     | 可省略      | Web 容器的 Compose 扩展                                                                          |
| `container.compose.services.web.extra_hosts`         | 可省略      | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名                                   |
| `container.compose.services.web.extra_hosts.<名称>`  | 必填        | 容器内的主机名到 IPv4 或 IPv6 地址映射，不能覆盖框架内部服务名。可填字符串，IPv4 或 字符串，IPv6 |

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

### 将服务的 3000 端口发布到主机的 8080

这是项目根目录 `hai.json` 的完整外层结构。目标主机已安装容器运行环境，部署账号具备相应权限。SSH 私钥通过部署机的私有环境提供；`expose` 只设置入口端口，不会让任意业务接口绕过认证。

```json
{
  "deploy": {
    "environment": "staging",
    "provider": {
      "type": "docker-ssh",
      "ssh": { "host": "staging.example.com", "username": "deployer" },
      "expose": { "hostPort": 8080 }
    }
  }
}
```

### 使用不同的发布环境文件

将 `environment` 改为 `prod` 后，CLI 按 prod 模式读取环境文件，私有值可以保存在 `.env.prod.local`。主机地址和账号只是示例；运行前核对实际目标，不能只改环境名而沿用错误主机。

```json
{
  "deploy": {
    "environment": "prod",
    "provider": {
      "type": "docker-ssh",
      "ssh": { "host": "production.example.com", "username": "deployer" },
      "expose": { "hostPort": 8080 }
    }
  }
}
```

<a id="rootless-docker-external-https"></a>

### 用 Rootless Docker 发布到现有 HTTPS 网关

例如用户访问 `https://app.example.com/`，同机网关转发至 `http://127.0.0.1:18070`。以下是 `hai.json.deploy` 的内容。SSH 账号应拥有 Rootless Docker 的用户套接字并能写入 `baseDir`。远端网关使用受防火墙限制的具体私网地址。

```yaml schema=@h-ai/deploy:DeployConfigSchema
environment: prod
provider:
  type: docker-ssh
  ssh:
    host: deployment.example.com
    username: deploy
  remote:
    runtime: docker
    dockerMode: rootless
    baseDir: /home/deploy/hai-apps
  expose:
    hostAddress: 127.0.0.1
    hostPort: 18070
    publicUrl: https://app.example.com
```

网关配置好 DNS 和证书，并覆盖 Host、客户端地址和协议头。在 `trustedEdgeProxies` 填写部署侧实际看到的可信对端地址，特别是 rootless 端口转发后的地址。先用 `hai deploy --env prod --plan` 核对两层地址，再全量发布。换域名或监听地址时重新生成全量包，按[网关配置与验收](delivery.md#外部-https-网关)检查登录、跳转和探活。

### 生效与核对

`docker-ssh` 使用本机 OpenSSH。未填写 `ssh` 时可用于生成离线交付物，远端 SSH 发布需要连接参数。配置验证通过后仍需验证目标身份、容器运行时和端口，并实际访问健康检查。HTTPS、离线和增量回滚见[部署场景](delivery.md)。
