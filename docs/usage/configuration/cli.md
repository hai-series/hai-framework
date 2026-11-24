# CLI 配置

[English](cli.en.md) · [日本語](cli.ja.md)

[配置手册](README.md)

## 配置入口

项目根目录的 `hai.json` 保存构建和部署设置。`hai build` 用其中的 `build` 选择要构建的网站或镜像。`hai deploy` 用 `deploy` 查找要发布到的主机和容器参数。各服务自己的数据库、缓存等参数放在它的 `config/_<名称>.yml` 中。[配置来源与合并顺序](runtime.md#配置从哪里来)

## 配置清单

### `hai.json`

| 配置项                           | 默认值/必填       | 说明                                                                   |
| -------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `build.images`                   | 容器镜像构建必填  | 项目容器镜像构建清单；角色及 Dockerfile 与项目一致                     |
| `build.images[].name`            | 必填              | 镜像角色 `serv` 或 `web`，同一角色只能配置一次                         |
| `build.images[].context`         | `.`               | Dockerfile 可读取的目录，`.` 指项目根目录                              |
| `build.images[].dockerfile`      | 必填              | 项目内 Dockerfile 路径                                                 |
| `build.images[].containerPort`   | 可省略            | 容器监听端口，部署时与入口映射匹配                                     |
| `build.app`                      | 可省略            | Capacitor 原生工程目录列表                                             |
| `build.desktop`                  | 可省略            | Tauri 原生工程目录列表                                                 |
| `build.sources.image.type`       | `official`        | 镜像源 `official`、`cn` 或 `custom`。可由 `--image-source` 覆盖        |
| `build.sources.image.registries` | `custom` 时必填   | 原镜像仓库到实际镜像仓库的映射。可由 `--image-mirrors` 覆盖            |
| `build.sources.npm.type`         | `official`        | npm 源 `official`、`cn` 或 `custom`。可由 `--npm-source` 覆盖          |
| `build.sources.npm.registry`     | `custom` 时必填   | 自定义 HTTP(S) registry，不含认证信息。可由 `--npm-registry` 覆盖      |
| `build.proxy.mode`               | `inherit`         | 可选 `inherit`、`system`、`custom` 和 `none`。可由 `--proxy-mode` 覆盖 |
| `build.proxy.url`                | `custom` 时需提供 | 自定义代理地址，可由 `--proxy-url` 提供                                |
| `build.proxy.bypass`             | 可省略            | 代理排除项，可由 `--proxy-bypass` 覆盖                                 |
| `deploy`                         | 部署时提供        | 发布目标、服务开通和容器参数，见 [Deploy 配置](deploy.md)              |

### 环境文件和进程变量

| 配置项                                  | 默认值/必填                  | 说明                                                                                                                          |
| --------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` | 继承当前环境                 | `inherit` 模式下读取下载代理及例外域，也可识别相应的小写名称                                                                  |
| `PUBLIC_*`、`VITE_*`                    | 由项目设置                   | 前端可以读取的变量，例如 API 地址。发布后的页面可能直接包含这些值，密码和密钥留在服务端                                       |
| `.env.<mode>.local`、`.env.local`       | 可省略                       | 保存数据库密码、部署凭据等私有变量。任选一个写入测试值，按[环境变量合并顺序](runtime.md#配置从哪里来)确认它是否会替换已有设置 |

## 配置示例

```json
{
  "build": {
    "images": [{ "name": "serv", "context": ".", "dockerfile": "images/serv.Dockerfile", "containerPort": 3000 }],
    "sources": { "image": { "type": "official" }, "npm": { "type": "official" } },
    "proxy": { "mode": "inherit" }
  }
}
```

### 分别构建移动端和桌面端工程

这是项目根目录的 `hai.json`。两个路径均须指向已有的原生工程目录，分别具备 Capacitor 或 Tauri 配置。声明路径不会自动创建工程；选择对应构建目标时才会使用这些设置。

```json
{
  "build": {
    "app": ["apps/orders-app"],
    "desktop": ["apps/orders-desktop"]
  }
}
```

### 容器构建使用公司的 npm 镜像

保留项目实际的 Dockerfile 路径。此例把容器构建的 npm 下载指向公司镜像，并明确不使用代理；它不会修改开发者机器的全局 npm 配置。镜像地址必须由构建环境直接访问，认证信息不写在 URL 中。

```json
{
  "build": {
    "images": [{ "name": "serv", "context": ".", "dockerfile": "images/serv.Dockerfile", "containerPort": 3000 }],
    "sources": { "npm": { "type": "custom", "registry": "https://npm.example.com/" } },
    "proxy": { "mode": "none" }
  }
}
```

### 生效与核对

以 `hai build --image-source cn` 为例，本次构建选用国内镜像源。项目已有的默认选源只在运行这条命令时被覆盖。首次交互选择可能为项目写入默认选项。构建日志里可以看到所用下载源和产物路径，部署后再按产物批次核对实际运行的服务。[构建、部署配置与失败恢复](delivery.md)
