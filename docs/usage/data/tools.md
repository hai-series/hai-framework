# @h-ai/tools 数据结构

[English](tools.en.md) · [日本語](tools.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/tools.md) · [功能说明](../function/tools.md)

通过注册器执行工具时，定义保存在当前进程。需要读写文件时，宿主按业务权限和版本规则管理文件。

<a id="runtime-data"></a>

## 进程内数据

已登记的工具留在当前进程。用 `registry.getNames()` 查看可调用的名字，关闭进程或调用 `registry.clear()` 会清空这组登记。

| 数据 | 谁保存 | 什么时候使用 |
| --- | --- | --- |
| 工具实现、参数 Schema、标题、预设和分组 | 应用在每个进程装配 | Tools 生成目录、校验输入和调用处理函数 |
| 启用范围和权限 | 应用的服务端配置和业务权限系统 | 授权规则由宿主提供，直接执行时检查当前调用者与已经校验的参数 |
| 文件字节、归属、版本和保留期 | 宿主的文件存储和业务服务 | 宿主根据当前身份读写文件，并在发布或保存时检查权限和版本 |

<a id="artifact-access"></a>

## 产物访问契约

工具需要文件时，由宿主实现 `ToolArtifactAccess`。宿主可以接入 [Storage](storage.md) 或应用已有的存储。多个节点共同处理任务时，各节点都要能访问同一份业务文件。

| 宿主回调 | 数据和权限 |
| --- | --- |
| `read(context, { id })` | 检查当前主体能否读取文件，返回含 `id/name/mediaType/data` 的文件，按需带上 `kind/version` |
| `publish(context, { name, kind, mediaType, data, id? })` | 核验发布权限，保存字节并返回产物引用。工具可提供稳定 ID，例如 `artifact_create` 会从可信的执行 ID 派生产物 ID。宿主负责去重和保留期 |
| `publishBatch(context, [table, chart])` | 可选。一次提交表格与图表，按顺序返回两个引用。两份均提交后才成功，失败时本次新产物均不可读。启用 `data_analyze` 时提供此回调。 |
| `save(context, { id, baseVersion, content })` | 可选。核对归属和基础版本后保存新内容，版本冲突由宿主返回 |

<a id="artifact-storage"></a>

### 文件保存位置

[示例注册器](../function/tools.md#artifact-setup) 的 `files.publish` 将字节存入进程内的 `Map`，`files.read` 按 ID 从中取回。进程结束后这些文件随之丢失。应用接入时，由宿主在这两个回调内连接实际存储和权限检查。

Agent 工作台从 `config/_storage.yml` 读取 Storage 配置。默认 `type: local` 把字节写到服务启动目录下的 `./data/uploads`，可通过 `HAI_STORAGE_ROOT` 设置根目录。Agent 的 `.env.prod` 选择 `s3`，字节写到 `HAI_STORAGE_BUCKET` 对应的 S3 兼容桶。Agent 在数据库的 `hai_agent_resources` 保存文件条目，在 `hai_agent_resource_versions` 保存各版的对象键和校验和。读取时先核对归属，再通过相应版本的对象键取回正文。 [本地与 S3 配置](../configuration/storage.md)

### 指向工具生成的文件或页面

`artifact_create` 成功时返回文件引用，如下所示。`id` 是宿主文件库中用于查找文件的标识。宿主提供 `files.save` 时，把读取到的 `version` 作为 `baseVersion` 传给 `artifact_save`。Agent 保存成功后沿用同一 `id` 并递增版本号，已有更新版本时返回版本冲突。 [Markdown 示例](../function/tools.md#artifact-example)

```json
{
  "id": "artifact-1",
  "title": "Project notes",
  "kind": "markdown",
  "version": 1,
  "mediaType": "text/markdown"
}
```

<a id="runtime-tasks"></a>
<a id="example-data"></a>
<a id="tool-events"></a>
<a id="size-and-retention"></a>

应用通过持久工具服务提交任务时，可查看 [工具回执、事件及保留期](tools-runner.md#runtime-tasks)。
