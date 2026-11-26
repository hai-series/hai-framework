# @h-ai/feedback 功能说明

[English](feedback.en.md) · [日本語](feedback.ja.md) · [配置](../configuration/feedback.md) · [数据结构](../data/feedback.md) · [反馈运维](../operations/feedback.md)

<a id="feedback-workflow"></a>

## 完整流程

登录用户提交反馈后，在「我的反馈」继续查看和回复。具备相应权限的人员从同一业务范围的共享列表处理，无需领任务或分单。一份反馈保留首帖、对话和当前状态，作者和处理人员查看的是同一组内容。

![用户提交反馈、处理人员回复或请求补充、用户补充、处理人员标记结果的流程](../images/function-feedback-collection.svg)

<a id="feedback-steps"></a>

## 按步骤操作

以下菜单名称以管理台为例。

1. **提交首帖。** 在出现问题的已登录页面点「反馈问题」。展开「首帖现场」中的「查看材料」，检查页面截图、打开反馈前的浏览器日志和页面回放。可用「重新截图」更新截图，用「删除」去掉不想发送的材料。填写发生了什么，按需添加文件、录屏或勾选「随首帖附上本人近期服务端日志」，点「提交反馈」。
2. **查看反馈。** 提交成功后，首帖和所选材料已保存，状态为「待处理」。作者在「我的反馈」打开该记录。处理人员从侧栏「问题反馈」进入共享列表，按状态筛选并打开同一条记录。在「首帖现场」用「查看材料」检查截图、日志、回放和录屏。
3. **请求补充。** 处理人员选择「要求补充信息」，说明缺少什么，也可附上操作示意图或步骤文件。发送后，状态变为「待用户补充」，作者可以打开这条消息和附件。
4. **回复或补充。** 任一方都能发文字、图片和附件。作者可只发一张错误截图或一个文件。作者回复「待用户补充」的反馈后，状态自动改为「待处理」，其他普通回复保留当前状态。回复和补充请求只有手动填写、选择的内容。
5. **记录处理结果。** 处理人员可以先回复处理结果，再标记「已处理」。「已处理」的反馈仍可回复，处理人员可主动改回「待处理」。作者在「我的反馈」看结果。

<a id="screen-recording"></a>

### 从标签页录制并播放

1. 用支持屏幕共享和媒体录制的桌面浏览器打开应用。页面需要处于安全上下文，例如 HTTPS 或受浏览器信任的本机开发地址。如果 Chrome 或 Chromium 的标签页列表省略发起分享的页面，先另开一个标签页，导航到需要复现问题的应用页面。
2. 在反馈弹窗点「录屏」，再点「开始录屏」。在浏览器自己的分享选择器选「Chrome 标签页」或「Chromium 标签页」，选中要录制的应用标签页，然后点「分享」。授权由浏览器提供，每次开始录制都需要用户选择。
3. 在选中的标签页重现问题。开始录屏后发起侧的反馈弹窗会暂时隐藏。复现完毕，切回发起分享的标签页，点「停止录屏」。也可点「取消录屏」丢弃本次录制。
4. 停止后在弹窗的「短录屏」里点击播放器的播放键，确认画面。可以删除或重录。保留「短录屏」并提交后，处理人员在「问题反馈」打开该记录，点「首帖现场」下「短录屏」的「查看材料」，再点播放键。
5. 如果取消浏览器授权或录屏不可用，可以继续填写首帖，使用截图或手动附件提交。

录屏获取选中画面实际显示的像素，最长 60 秒，单个最多 5 MiB，只录视频。截图和操作回放中的页面遮挡规则不适用于录屏，发送前检查所选画面及预览。 [Chrome 的分享选择器](https://developer.chrome.com/docs/web-platform/screen-sharing-controls#the_selfbrowsersurface_option)

<a id="feedback-limits"></a>

## 关键限制

打开反馈弹窗时才准备当前页截图并冻结此前的浏览器材料。页面收集期间，浏览器日志与操作事件缓存在本页内存。提交时只上传作者保留的材料。

| 材料 | 来源与截取时点 | 容量与范围 |
| --- | --- | --- |
| 页面截图 | 打开反馈时自动尝试生成，也可手动重截。 | 遮挡表单输入和 `data-feedback-private` 区域。截图失败时可继续提交。 |
| 浏览器日志 | 本页 Core 日志和未捕获异常摘要，打开反馈时冻结。 | 最多回看 5 分钟，最多 1000 条、512 KiB。 |
| 页面回放 | 打开前的页面结构、点击等操作事件，按可回放的完整快照截取。 | 最多回看 5 分钟、2 MiB、2000 个缓冲事件。屏蔽页面文字、输入值和敏感属性，排除 iframe 及标记为私密的区域。刷新页面或退出后重新收集。 |
| 短录屏 | 作者授权后实时录制所选画面。 | 仅视频，最长 60 秒，单个最多 5 MiB。 |
| 服务端日志 | 作者勾选后在提交时取当前实例的近期 Core 请求日志。 | 同一用户、同一业务范围、最近 5 分钟，最多 1000 条、512 KiB，并受剩余附件容量约束。可用日志不足时，仍可提交正文或其他材料。 |

每次发送的正文最多 5000 个 UTF-16 代码单元。手动附件最多 5 个，单个文件最多 5 MiB，附件与首帖材料合计最多 10 MiB。回复和补充请求的附件同样合计最多 10 MiB。至少发送正文、一个文件或一项实际可保存的首帖材料。容量与保留分别由反馈契约和应用的数据策略决定。 [配置分层](../configuration/feedback.md#configuration-ownership) · [保留期限](../data/feedback.md#retention)

<a id="permissions"></a>

### 谁可以看和处理

| 身份或权限 | 可以执行的动作 |
| --- | --- |
| 已登录且有 `feedback:create` | 提交首帖。 |
| 反馈作者 | 查看自己的反馈、对话和附件，发送回复。 |
| `feedback:read` | 查看同一应用和业务范围内的反馈、对话和附件。 |
| `feedback:read` 加 `feedback:process` | 使用共享列表处理，回复、要求补充或标记状态。 |

宿主在服务端从可信会话确定用户、权限和业务范围。管理台把提交权限授予普通用户，把三项权限授予业务操作员。

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| `@h-ai/reldb` | 保存反馈、消息和附件 | 服务端 | 先初始化 RelDB，再初始化 Feedback |
| `@h-ai/kit` 或 `@h-ai/serv` | 把反馈契约挂到鉴权后的 HTTP 接口 | 接口服务 | 初始化 Feedback，随后传入可信会话解析函数 |
| `@h-ai/ui` | 反馈弹窗、列表及对话 | 需要 Svelte 界面时 | 将应用的鉴权 API 回调交给组件 |

<a id="quick-start"></a>

## 最小接入

应用先连接数据库，再启动 Feedback。下面假定调用方传入服务端从已认证会话得到的 `author`，其中含 `feedback:create`。

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

const started = await feedback.init({ appId: 'orders' })
if (!started.success)
  throw new Error(started.error.message)

export async function submitIssue(author: FeedbackContext, id: string) {
  // 调用方为本次提交预先生成 UUID。
  const result = await feedback.submit({ id, body: '订单详情点不开' }, author)
  if (!result.success)
    return { error: result.error }
  return { reportId: result.data.id, status: result.data.status }
}
```

成功结果中的 `reportId` 用于打开详情，首帖状态为 `pending`。应用关闭时先执行 `await feedback.close()`，再关闭 RelDB。

SvelteKit 用 `kit.createFeedbackHandler({ feedback, resolveContext })` 挂载 GET、POST、PATCH。独立服务用 `serv.createFeedbackProcedures({ feedback, resolveContext })` 装配 `apiContract.feedback`。宿主开启加密传输时，合并对应挂载路径的文件传输预算。 [Kit 接入](kit.md#protocol-integrations) · [传输容量](../configuration/feedback.md#transport-budget)

<a id="feedback-capture"></a>

### 首帖现场接入

在登录后的页面挂载 `FeedbackModal`。为 `captureKey` 传入会话或用户的稳定标识，切换账号时更新标识，退出时卸载组件。组件打开首帖时准备现场，`onsubmit` 把保留的材料与正文交给宿主 API。省略 `captureKey` 时，弹窗仍可填写正文和手动附文件。

自行实现界面时，可在 `reports.submit` 通过 `capture` 提供以下字段。

| 字段 | 类型与用途 |
| --- | --- |
| `screenshot?` | 页面截图，PNG、JPEG 或 WebP。 |
| `browserLogs?` | 近期浏览器日志 JSON。 |
| `replay?` | 包含全量页面快照及其后操作事件的脱敏 JSON。 |
| `recording?` | 用户授权录制的 WebM 或 MP4 视频。 |
| `includeServerLogs?` | 布尔值，默认不附加。设为 `true` 时，由服务端按可信身份提取可用的近期 Core 日志。 |

前四项使用 `name`、`contentType`、`dataBase64` 文件结构。首帖详情的附件元数据用 `kind` 标识材料；点击查看时单独读取文件。 [附件分类及示例](../data/feedback.md#attachment-examples)

#### 哪些 Core 日志可以附加

Feedback 初始化后观察当前进程的 Core 日志，在内存里缓冲能关联到可信请求的记录。关联条件取自写日志当时的 `core.context.get()`，其中要有 `scopeId`、`userId`、`requestId`。Core 日志本身无需输出这三个字段。启动日志、匿名请求以及缺少业务范围的请求不会进入缓冲；提交反馈的当前请求也不附入。只有作者主动勾选的首帖才会保存筛选到的日志。

单范围应用可以在 Kit 的业务请求中用 `core.context.run({ scopeId: 'orders' }, next)` 增加范围。Serv 集成可在 `createContext` 中提供可信范围。两者均需使用和 `resolveContext` 鉴权相同的 `scopeId`。例如用户 `user-42` 在 `orders` 范围内浏览订单，有可信上下文的订单接口日志可以附加到该用户的首帖。其他用户、其他范围、其他实例的日志均不会被附加。 [数据与日志缓冲](../data/feedback.md#retention)

<a id="api-reference"></a>

## 接口参考

<a id="service"></a>
<a id="reports"></a>

### 查询、回复与处理反馈

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `feedback.init(config)` | 初始化反馈表 | `{ appId }` | `HaiResult<void>` | `await feedback.init({ appId: 'orders' })` |
| `feedback.close()` | 停止接受新调用，等待正在执行的请求 | 无 | `HaiResult<void>` | `await feedback.close()` |
| `feedback.submit(input, context)` | 提交新的反馈 | UUID `id`、`body`、可选 `attachments` 和 `capture` | 已保存的反馈 | `await feedback.submit({ id, body }, author)` |
| `feedback.listMine(query, context)` | 列出自己的反馈 | `status?`、`page?`、`pageSize?` | 反馈分页 | `await feedback.listMine({}, author)` |
| `feedback.list(query, context)` | 按权限列出同范围反馈 | 与 `listMine` 相同 | 反馈分页 | `await feedback.list({ status: 'pending' }, staff)` |
| `feedback.get(id, context)` | 获取反馈正文和首帖附件元数据 | 反馈 UUID | `{ report, attachments }` | `await feedback.get(id, author)` |
| `feedback.listMessages(query, context)` | 读取反馈对话，最新消息在前 | 反馈 `id`、`page?`、`pageSize?` | 消息分页和附件元数据 | `await feedback.listMessages({ id }, staff)` |
| `feedback.addMessage(input, context)` | 回复或请求补充 | 反馈 `id`、本次操作 UUID `messageId`、`kind: 'reply' \| 'request_info'`、`body`、可选 `attachments` | 已保存的消息 | `await feedback.addMessage({ id, messageId, kind: 'reply', body }, author)` |
| `feedback.setStatus(input, context)` | 标记待处理或已处理 | 反馈 `id`、`status: 'pending' \| 'handled'` | 更新后的反馈 | `await feedback.setStatus({ id, status: 'handled' }, staff)` |
| `feedback.getAttachment(input, context)` | 读取单个附件 | 反馈 `id`、`attachmentId` | `name`、`contentType`、`dataBase64` | `await feedback.getAttachment({ id, attachmentId }, author)` |

结果使用 `HaiResult`，先判断 `success`。查询默认第一页、每页 20 条，允许每页 1 至 20 条。反馈列表按最近活动时间倒序，`status` 可传 `pending`、`awaiting_user` 或 `handled`。如果只有文件，`body` 传空字符串。附件的 `dataBase64` 传纯 Base64 内容。

Kit 或 Serv 的 `apiContract.feedback` 在宿主 API 前缀下公开以下 HTTP 路径。

| 方法和相对路径 | 操作 |
| --- | --- |
| `POST /feedback/reports` | 提交首帖 |
| `GET /feedback/my-reports` | 列出本人反馈 |
| `GET /feedback/reports` | 查询业务范围共享列表 |
| `GET /feedback/reports/{id}` | 读取首帖和材料清单 |
| `GET /feedback/reports/{id}/messages` | 分页读取对话 |
| `POST /feedback/reports/{id}/messages` | 发送回复或补充请求 |
| `PATCH /feedback/reports/{id}/status` | 修改状态 |
| `GET /feedback/reports/{id}/attachments/{attachmentId}` | 读取一份材料或附件 |

#### 场景：要求用户补截图

在已启动服务的异步函数里，`staff` 包含当前范围的读取和处理权限，`id` 来自已保存的反馈。调用方在发送前生成 `messageId`，提交响应丢失时用同一份请求和 UUID 重试。

```ts
const request = await feedback.addMessage({
  id,
  messageId,
  kind: 'request_info',
  body: '请按附件步骤操作，再发一张错误截图。',
  attachments: [{ name: 'steps.txt', contentType: 'text/plain', dataBase64: 'U3RlcHM=' }],
}, staff)
if (!request.success)
  return request
return request.data
```

成功后可用首帖详情确认状态为 `awaiting_user`，并从消息列表取回补充请求和 `steps.txt` 的附件 ID。作者使用自己的上下文和新的 `messageId` 发 `reply`，附件里传截图。处理人员随后可以读到该回复，通过反馈 ID 和附件 ID 加载截图。 [操作与故障排查](../operations/feedback.md)
