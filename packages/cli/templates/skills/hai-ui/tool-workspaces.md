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
- 草稿只保存在组件内存中。提供 onleaveguard(guard|undefined) 注册异步离开确认：宿主所有菜单、切任务、新建、登出和 SPA beforeNavigate 都先调用 guard，返回 false 时保留原工作台；卸载清理注册。组件自己为硬刷新/关闭提供 beforeunload 提示。不要通过只监听产物下拉框保护草稿。

## 工具表单和长任务

`ToolWorkspace` 的 `tools` 每项提供 name/description/inputSchema，可选 title 与 examples。examples 的每项为 `{ label, input }`，label 是业务文案；内置按钮无需应用传翻译。

`onrun({ name, input, idempotencyKey }, signal)` 返回 `ToolRun`：id、status，可选 idempotencyKey/progress/message/result/artifacts；idempotencyKey 仅用于未知提交恢复，拿到真实回执后省略。status 为 queued/running/cancelling/succeeded/failed/cancelled/unknown，progress 为 0..1。简单字段自动表单化，预设只填值；复杂结构留在高级参数，最终 Schema 和身份校验仍在服务端。

资源字段可传 `resources: readonly { id, title, kind?, mediaType? }[]`。Schema 的 `format: artifact-id/artifact-ids` 自动复用可搜索单选/多选，`contentMediaType` 可限制候选 MIME（例如 image/*）；仍保留手填 ID 兜底。列表仅改善选择体验，服务端继续按最终 ID 验证权限。宿主并行读取已授权文件和产物后投影，不在页面重写选择器。

长任务尽快返回回执，然后提供 `onstatus(id, signal)` 和 `oncancel(id, signal)`。轮询默认 1000 毫秒，最低 250 毫秒。回调必须返回真实状态；请求超时和取消等待不能伪装为远端已停止。组件卸载终止自己的等待与计时器，不擅自取消持久任务。

用 initialRun 和 onrunchange(run|undefined) 接回持久回执；提供 onstatus 时组件挂载会主动续看；initialRun 仅初始化挂载，不是随 props 更新切换任务的受控值。宿主可在 URL 只存 opaque receipt 或提交前的幂等键，不放身份/参数或秘密。提交响应未知时，组件保留表单与同一个 idempotencyKey 重试；onstatus 返回 null 表示暂未找到受理记录，不代表已取消。刷新只恢复查询引用，不承诺恢复内存参数。有原请求快照的未知提交会锁定工具与参数，重试原样复用同一意图；已知回执初次恢复时也暂时锁定，避免切工具抹去唯一引用。只有幂等键且 find 未找到记录时可核对重填；开始另一操作需明确确认旧任务可能继续，新操作使用新键。已完成产物会在组件内按 ID 合并为最近 100 个资源选项，切工具可直接选择。

未知提交恢复的 `initialRun` 必须带原始幂等键；已知回执只需 id/status。以下仅示范数据形状，真实引用和键由宿主恢复，不生成新键：

```ts
import type { ToolRun } from '@h-ai/ui/components/scenes/tools/index'

const pendingSubmission: ToolRun = {
  id: 'opaque-pending-reference',
  status: 'unknown',
  idempotencyKey: 'saved-user-action-key',
}
const acceptedSubmission: ToolRun = { id: 'opaque-run-receipt', status: 'unknown' }
```

将恢复对象传入 `initialRun`，用 `onrunchange(run|undefined)` 保存或清除引用。`onstatus(id, signal)` 返回 `Promise<ToolRun | null>`：宿主将待定引用映射到原键查询，将已知回执映射到状态查询；缺失映射为 null。UI 不解码宿主的不透明回执，也不假定 null 表示远端已取消。

可视改写通过 selectionSnapshot 将普通段落/标题与完整加粗/链接投影到精确源码；切断格式边界、复杂或跨块选区明确提示转源码选区，不做近似替换。源码选区按钮直接提交原始片段，最终版本及唯一定位仍在服务端检查。

HTML 宿主还需配置父页面 CSP frame-src:[self]（实际响应为 frame-src 'self'），阻止脚本设置 iframe 自身 location.href 访问外部来源。Chrome 可能把被阻止的子框架换成错误页；主应用保持可用，可切源码再预览恢复。不能只依赖子框架的资源 CSP，也不使用实验 iframe.csp。

`onartifact` 由宿主打开产物；`onerror` 可用于诊断。组件内置中英日文错误通知，不要在宿主重复弹出同一个错误。
