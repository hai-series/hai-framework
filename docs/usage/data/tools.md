# @h-ai/tools 数据结构

[English](tools.en.md) · [日本語](tools.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/tools.md) · [功能说明](../function/tools.md)

提交服务端工具后，客户端用受领回执看进度，再凭产物引用读取生成的文件或页面。执行记录由 Runner 保存，产物访问由宿主验证。

<a id="runtime-data"></a>

## 进程内数据

Tools 没有自有数据库表、缓存键或持久租约。轻量定义和注册器保存在当前进程；`clear()` 或进程退出后不保留。服务端任务复用 Runner 原有存储，不另建队列或执行状态表。

| 数据 | 所有者与生命周期 |
| --- | --- |
| 工具实现、Schema、标题、示例和分组 | 宿主按配置装配，各节点各自持有；不是任务共享状态 |
| 工具启用和授权 | 宿主可信配置；提交与执行节点重新检查 |
| 任务、幂等键、租约、状态和事件 | [Runner](runner.md) 保存与清理，任务类型为 `hai.tools.<id>.v1` |
| 文件及产物字节 | [Storage](storage.md) 保存；Tools 通过宿主回调读取和发布 |
| 文档版本、资源归属和冲突 | 实际业务服务负责；`baseVersion` 用于最终写入条件 |
| MCP 服务清单与 Broker | [AI](ai.md) 和宿主管理；不复制到 Tools |

<a id="runtime-tasks"></a>

## 任务与回执

`ToolRun` 返回 `receipt: { id, key }`、Runner `status`、可选 `output/failure`、`events` 和增量游标 `next`。`inspect(receipt, context, { after })` 继续读取事件。保存完整回执，跨节点仍按当前主体和服务核验，不只凭任务 ID 获取或取消任务。

`queued/running/cancelling` 还不是终态；取消仅提交停止请求。实际完成、失败和资源清理以 Runner 记录为准。`service.close()` 不删除任务或代表任务已停止。

<a id="example-data"></a>

### 一次工具任务的进度和结果

调用方保存回执，稍后可以继续查状态或读取后续事件，不必重新提交相同任务。

```json
{
  "receipt": {
    "id": "execution-42",
    "key": "order-42-preview"
  },
  "status": "succeeded",
  "output": {
    "artifactId": "artifact-42"
  },
  "events": [],
  "next": 0
}
```

execution-42 已成功，结果指向 artifact-42；events 为空、next 为0表示这份示例没有展示事件。回执不是公开访问凭据。

<a id="artifact-access"></a>

## 产物访问契约

`ToolArtifactAccess` 由宿主实现，每次操作都要复核当前主体和最终提交条件。

| 回调/数据 | 结构与用途 |
| --- | --- |
| `read(context, { id })` | 返回 `HaiResult<ToolArtifact>`；包括 `id/name/mediaType/data` 和可选 `kind/version` |
| `publish(context, { name, kind, mediaType, data, id? })` | 保存字节并返回授权引用；宿主处理幂等、归属和保留期 |
| `save(context, { id, baseVersion, content })` | 可选；以版本条件保存并返回引用，冲突由宿主返回 |
| `ToolArtifactReference` | `{ id, title, kind, version, mediaType }`；用于工具结果和后续界面读取 |

作业输出使用稳定的执行与输出身份帮助重试去重，宿主仍须验证发布权限和幂等。共享部署使用同一 Storage 和 Runner 数据库；不能把某个节点的内存或本地临时路径当作其他节点可读取的产物。

浏览器出口代理是宿主部署配置，经 `HAI_TOOL_BROWSER_PROXY` 传给作业，不是用户输入或共享业务状态；不要把代理凭据放进模型参数或结果。

模型消息、任务事件和日志只保留需要的结构化信息、脱敏错误及授权引用。不要把密钥、图片、音视频或大文件字节写入工具定义和 LLM 上下文。下载、Range 请求和版本读取继续经过宿主授权。

website_video 的采集、脚本、可编辑分镜、逐镜音频、字幕、封面、工程和视频均是宿主授权产物；captureId/storyboardId/audioIds 是可恢复引用，不是公开下载权限。修改分镜后只复用内容仍匹配的音频，最终发布继续复核归属。

`service.find(key, context)` 直接读取 Runner 原有幂等记录，不存在时返回 success: true、data: undefined（应用 HTTP 投影为 null），不新增待提交状态表。取消、停用和查询是不同操作；工具停用后仍可读取同主体旧回执。

`preview_build` 只读取宿主授权的 ZIP 并发布新的自包含 HTML 引用；ZIP、源文件和最终 HTML 使用相同的归属检查。构建目录为任务临时数据，结束后由 Runner 清理，不保留常驻构建服务。展开限额为 8 MiB，单源码与最终 HTML 各 1 MiB，固定构建命令 60 秒；这些更小的限额优先于通用文件上限。构建失败不产生可预览的新产物。

### 指向工具生成的文件或页面

工具只返回产物标识和展示信息，大文件正文由宿主保存，读取时仍要检查权限。

```json
{
  "id": "artifact-42",
  "title": "Order preview",
  "kind": "html",
  "version": "version-1",
  "mediaType": "text/html"
}
```

artifact-42 是一个 HTML 预览，version-1 用于检查后续编辑是否基于当前版本；这里不包含 HTML 字节。

## 大小与保留期

ToolService 继承 Runner 的 512 KiB JSON 上限，分别作用于提交、单事件和最终输出。作业文件/产物最多 50 MiB；容器输入合计另受 scratchMiB 限制，按两者较小值执行。这些限制不能互相替代，文件正文应经授权引用传递。事件总量、条数和任务/幂等键保留期由 [Runner](runner.md) 管理，默认已结算任务保留七天；清理后 find 成功但 data 为 undefined，不证明请求从未受理或已取消。更长期的业务去重需由宿主管理。
