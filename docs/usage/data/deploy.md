# deploy 数据结构

[English](deploy.en.md) · [日本語](deploy.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/deploy.md) · [功能说明](../function/deploy.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 核对要发布的那一批文件

对应结构：`manifest.json`。

发布包内的清单让部署脚本确认拿到的是预期应用和构建批次。

```json
{
  "version": 5,
  "primaryService": "serv",
  "appVersion": "1.0.0",
  "buildId": "example-20261117",
  "partial": false
}
```

example-20261117 是构建标识。真实包还需镜像、摘要和元信息；只改清单文字不能生成有效产物。

### 让人查到发布进行到了哪一步

对应结构：`steps-<id>.jsonl`。

每完成或失败一步就追加一行记录，连接中断后仍可定位故障阶段。

```json
{
  "stage": "health",
  "status": "passed",
  "durationSeconds": 2
}
```

health 步骤通过，用时2秒。这只证明该步骤通过，整个发布是否成功还要看最终结果文件。

### 连接中断后还能确认什么

对应结构：`DeployCommandState`。

部署命令出错时告诉调用者哪些进程已退出、哪些远端结果仍未知，防止盲目重试。

```json
{
  "reason": "timeout",
  "localTermination": "confirmed",
  "remoteExecution": "unknown",
  "deploymentId": "deploy-orders-42",
  "resultFile": "/opt/hai/apps/orders/result-deploy-orders-42.json"
}
```

本地进程已结束，但远端是否完成未知；先查对应 resultFile，再决定后续动作。

### 整个发布最后是否成功

对应结构：`result-<id>.json`。

部署脚本在退出前写最终结果，SSH 断线后也能根据同一部署编号核对。

```json
{
  "deploymentId": "deploy-orders-42",
  "stage": "complete",
  "exitCode": 0,
  "durationSeconds": 42,
  "recoveryStatus": "not-needed"
}
```

deploy-orders-42 在 complete 阶段以0退出，用时42秒且无需恢复；这不证明应用业务数据没有变化。

CLI 回执 `schemaVersion: 1` 带 `artifactDir`、`manifestPath` 与 v5 清单。私有部署包的 `deploymentTarget` 记录项目、远端目录、引擎及 Docker 模式、监听地址和端口、外部 HTTPS 地址。包摘要覆盖目标和部署 ID。核对成功返回 `proof.deploymentId` 以及各运行角色的 `imageId` 和 `archiveSha256`。前者始终是镜像配置内容的 SHA-256，后者是整个镜像 tar 的 SHA-256。Docker containerd 用运行容器的平台清单定位配置，返回的 `imageId` 含义相同。调用方保存部署包回执与核对结论。

## 字段、存储与清理参考

### 数据库与缓存

模块不创建 SQL 表或 Redis 键。项目目录存放本地构建结果。发布文件和结果写到目标服务器。通过云服务创建的资源由相应云服务记录。

<a id="files"></a>

### 文件状态

| 路径                         | 数据与用途                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| 构建目录的 `manifest.json`   | 产物类型、应用与构建标识、镜像或文件清单及校验信息                                   |
| 归档根目录的 `manifest.json` | 记录发布对象及其构建信息，随 `apply.sh`、`config/`、`images/`、`.hai/` 一起打包      |
| `.hai/SHA256SUMS`            | 各文件的 SHA-256 校验值，执行发布前核对包内容是否改动                                |
| `<root>/releases/<id>/`      | 按部署 ID 保存的发布目录，含 Compose 与运行配置                                      |
| `<root>/.deploy.lock`        | 同一个发布根目录只允许一个进程执行发布。进程退出后释放锁，手工删锁文件会破坏这个限制 |
| `<root>/steps-<id>.jsonl`    | 逐条保存 `stage` 步骤、`status` 结果和 `durationSeconds` 耗时                        |
| `<root>/result-<id>.json`    | 指定发布的最终结果，可在连接中断后读取                                               |
| 目标主机的运行配置           | 可能含连接与应用凭据，随发布和目标主机管理                                           |

发布状态只记录部署流程。应用数据库、对象存储等业务数据仍在各自使用的服务中。
