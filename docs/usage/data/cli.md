# cli 数据结构

[English](cli.en.md) · [日本語](cli.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/cli.md) · [功能说明](../function/cli.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 构建产物的版本和镜像清单

对应结构：`manifest.json (DeploymentArtifact)`。

CLI 构建后写清单，部署器据此核对应用版本、构建批次和镜像，避免拿错产物。

```json
{
  "version": 5,
  "primaryService": "serv",
  "appVersion": "1.0.0",
  "buildId": "example-20261117",
  "source": {
    "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "dirty": false
  },
  "partial": false,
  "hasWeb": false,
  "images": []
}
```

此例主服务是 serv、应用版本1.0.0；这里只展示身份字段，空 images 是省略表示，不是一份可发布的完整制品。

## 字段、存储与清理参考

### 数据库与缓存

CLI 生成项目、构建产物或查看诊断包时不建数据库表，也不写 Redis。启动生成的应用后，只有已启用的业务模块会创建用于运行的表或键。

### 文件产物

| 文件                             | 数据与用途                                             |
| -------------------------------- | ------------------------------------------------------ |
| 目标目录的源码及清单             | 新应用、工作区与所选功能对应的配置和资源               |
| 构建成功后生成的 `manifest.json` | 产物及构建来源，随构建目录保留                         |
| 离线诊断包                       | 路径由调用方选择。包内结构参见 [feedback](feedback.md) |
| 发布文件                         | 归档和服务端发布状态参见 [deploy](deploy.md)           |
