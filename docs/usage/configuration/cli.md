# CLI 配置

[配置手册](README.md)

## 配置入口

在项目根使用 `hai.json` 管理构建和部署；需要定位工程根的下载、配置扫描等工具从当前目录或服务 workspace 向上查找最近的 `hai.json`。服务各自持有 `config/_<名称>.yml`。`hai config env` 根据选定服务及配置模式整理环境变量。[配置来源与合并顺序](runtime.md#配置从哪里来)

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

## 配置清单

### `hai.json`

| 配置项                           | 默认值/必填       | 说明                                                                   |
| -------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `build.images`                   | 容器镜像构建必填  | 项目容器镜像构建清单；角色及 Dockerfile 与项目一致                     |
| `build.images[].name`            | 必填              | 镜像角色 `serv` 或 `web`，同一角色只能配置一次                         |
| `build.images[].context`         | `.`               | 项目内构建上下文                                                       |
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

### 环境和命令参数

| 配置项                                  | 默认值/必填                  | 说明                                                                                              |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `--yes`                                 | 省略时由当前是否交互终端决定 | 跳过交互选源，尚未配置时使用官方源                                                                |
| `--env`                                 | 依命令选择的模式             | 决定构建、部署或检查所用环境文件组合，以具体命令的 `--help` 为准                                  |
| `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` | 继承当前环境                 | `inherit` 模式下读取下载代理及例外域，也可识别相应的小写名称                                      |
| `HAI_BUILD_ID`、`HAI_BUILD_COMMIT`      | CLI 生成                     | 构建批次及提交标识，由构建器传给子进程                                                            |
| `PUBLIC_*`、`VITE_*`                    | 由工程的公开构建设置决定     | 提供静态页面允许暴露的配置；构建时检查实际编译环境                                                |
| `.env.<mode>.local`、`.env.local`       | 可省略                       | 运行和部署需要的私有变量载体，实际优先级与父 JSON/子路径规则见[运行配置](runtime.md#配置从哪里来) |

## 生效与核对

选源和代理由命令参数优先覆盖本次操作。首次交互选择可保存尚未配置的项目默认值。构建日志显示本次实际消费的下载源和制品位置；上线后核对服务目录、部署入口和制品批次。[构建、部署配置与失败恢复](delivery.md)
