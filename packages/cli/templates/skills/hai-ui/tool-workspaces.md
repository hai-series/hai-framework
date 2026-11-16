# 工具与产物工作台

从 `@h-ai/ui/components/scenes/tools/index` 导入 `ArtifactWorkspace`、`ToolWorkspace` 及对应 Props 类型。组件是业务无关的交互层，没有 init/close；不在页面复制编辑器、参数表单或任务轮询状态机。

## 先连接宿主服务

`ArtifactWorkspace` 最小参数是 `artifacts` 和 `onread(id, version, signal)`。摘要使用 `id/title/kind/version`；读取结果可包含文本 `content` 或授权 `mediaUrl`。`kind` 为 markdown/html/table/chart/image/audio/video/file，版本与 Git revision 分开。

需要新建时提供 `oncreate({ title, kind, content }, signal)`，成功返回 `ArtifactDocument` 并把新项加入宿主列表；组件内置四种格式的表单和模板。

需要编辑时，产物声明 `editable: true` 并提供 `onsave({ id, baseVersion, content }, signal)`。成功返回 `{ status: 'saved', document }`；冲突返回 `{ status: 'conflict', currentVersion }`。不要把 409 转成强制覆盖。组件保留草稿、提供复制和读取最新版本；服务端执行 CAS/事务及资源授权。

`onhistory(id, signal)` 返回版本摘要；`onrewrite({ id, baseVersion, content, selectedText, instruction }, signal)` 返回 `{ content }` 提议。提议先预览，用户应用后再保存。宿主必须继续传递 signal，检查 HaiResult，并把安全错误交给组件；未知异常原文不作为用户提示。

## 内容类型和边界

- Markdown 复用现有 `AiDocumentEditor`。普通段落/标题可视修改，复杂块保留原文并提供源码编辑。结构无法还原时先保留现场，不用 innerText 覆盖整篇 Markdown。
- table 的 content 为 `AiTableData` JSON；chart 为 type/data/x/y 的 JSON，复用现成表格和图表组件。
- image/audio/video 的 URL 由服务端核验归属后提供，视频支持 Range。不可把任意字符串放入可执行地址。
- HTML 通过仅 allow-scripts 的 iframe 交互预览，无 same-origin。离线资源 CSP 限制资源加载；宿主仍负责独立来源、父页面 frame-src 和实际网络隔离，不能把客户端预览当作完整执行沙箱。
- 草稿只保存在组件内存中。宿主关闭或替换整个工作台前，需按实际产品流程处理未保存状态。

## 工具表单和长任务

`ToolWorkspace` 的 `tools` 每项提供 name/description/inputSchema，可选 title 与 examples。examples 的每项为 `{ label, input }`，label 是业务文案；内置按钮无需应用传翻译。

`onrun({ name, input }, signal)` 返回 `ToolRun`：id、status，可选 progress/message/result/artifacts。status 为 queued/running/cancelling/succeeded/failed/cancelled/unknown，progress 为 0..1。简单字段自动表单化，预设只填值；复杂结构留在高级参数，最终 Schema 和身份校验仍在服务端。

长任务尽快返回回执，然后提供 `onstatus(id, signal)` 和 `oncancel(id, signal)`。轮询默认 1000 毫秒，最低 250 毫秒。回调必须返回真实状态；请求超时和取消等待不能伪装为远端已停止。组件卸载终止自己的等待与计时器，不擅自取消持久任务。

`onartifact` 由宿主打开产物；`onerror` 可用于诊断。组件内置中英日文错误通知，不要在宿主重复弹出同一个错误。
