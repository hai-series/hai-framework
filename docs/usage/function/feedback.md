# @h-ai/feedback 功能说明

[English](feedback.en.md) · [日本語](feedback.ja.md) · [配置](../configuration/feedback.md) · [数据结构](../data/feedback.md) · [反馈运维](../operations/feedback.md)

<a id="feedback-workflow"></a>

## 完整流程

已登录的用户和有处理权限的人员在同一份反馈里交流。打开「我的反馈」可以看到回复和处理结果。处理人员共用列表，按权限查看和处理。

![用户提交反馈、处理人员回复或请求补充、用户补充、处理人员标记结果的流程](../images/function-feedback-collection.svg)

<a id="feedback-steps"></a>

## 按步骤操作

1. **检查现场并提交。** 在已登录页面打开「反馈问题」，查看当前页截图，以及打开前的浏览器日志和操作回放。可重截、移除材料，或手动开始无声录屏。填写说明、选择文件和要随首帖发送的材料，也可以勾选附上服务端日志。提交成功时正文和材料一起保存，状态为「待处理」。
2. **查看。** 在「我的反馈」里打开自己的反馈。首帖可预览截图、查看日志、回放操作和播放录屏。处理人员从共享列表查看同一份反馈。
3. **回复或请求补充。** 两边都可以发送带图片或文件的回复。处理人员发送「要求补充信息」时，可以一并附上图片或文件。发送成功后，状态变为「待用户补充」。
4. **补充。** 用户在同一对话里回复，可以只提交截图或文件。反馈原为「待用户补充」时，回复成功会把状态改回「待处理」。
5. **给出处理结果。** 处理人员在对话里回复结果，再按需要标记「已处理」。普通回复保留当前状态，用户在已处理后仍可继续回复。处理人员可把已处理的反馈改回「待处理」。

<a id="feedback-limits"></a>

## 关键限制

| 事项 | 行为 |
| --- | --- |
| 采集和上传 | 登录后浏览器在当前页面内存中保留近期日志和操作回放。打开反馈时冻结提交前的材料，并尝试截取当前可见页面。浏览器仅在用户发送首帖时上传用户保留的材料。回复和补充请求只发送本次填写的文字和手动选择的图片、文件。 |
| 浏览器日志与操作轨迹 | 回看最多 5 分钟。浏览器日志保存有界的 Core 日志和未捕获异常摘要，最多 1000 条、512 KiB。操作回放最多 2 MiB，屏蔽页面文字和输入值，排除 iframe 和标记为私密的区域。证据仅来自当前页面会话，刷新后从头开始。 |
| 服务端日志 | 勾选后在提交时读取同一用户、业务范围在当前服务实例最近 5 分钟的 Core 请求日志，最多 1000 条、512 KiB。只有宿主写入可信 `scopeId`、`userId`、`requestId` 的日志可关联。跨实例或重启可能使材料缺失，反馈仍可提交。 |
| 截图和录屏 | 截图遮挡表单输入与 `data-feedback-private` 区域。录屏需用户主动授权选择画面，仅记录视频，最长 60 秒，单个最多 5 MiB。屏幕共享会录入所选画面可见的内容，发送前请检查。 |
| 单次提交 | 正文最多 5000 字符，手动附件最多 5 个，单个文件最多 5 MiB。首帖材料和手动附件共享 10 MiB，回复和补充请求的附件也合计最多 10 MiB。至少发送正文、一份文件或一项实际可保存的材料。 |
| 附件访问 | 列表只返回文件元数据。具备反馈查看权限的人可按需读取文件、日志或回放。 |
| 权限 | 已登录且有 `feedback:create` 的用户可以提交，作者可以查询和回复自己的反馈。`feedback:read` 可查看同范围的反馈，`feedback:process` 在具备读取权限时允许处理、回复和请求补充。应用在服务端从可信会话解析身份、业务范围与权限。 |
| 写入和重试 | 正文、附件和随本次操作改变的状态在一个数据库事务内写入。提交和消息的操作 ID 由调用方生成，网络中断后使用原 ID 重试会取回同一记录。 |

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
  // id 是客户端为本次提交预先生成的 UUID。成功时返回已保存的反馈。
  return feedback.submit({ id, body: '订单列表无法打开' }, author)
}
```

SvelteKit 用 `kit.createFeedbackHandler({ feedback, resolveContext })` 挂载 GET、POST、PATCH。独立服务用 `serv.createFeedbackProcedures({ feedback, resolveContext })` 装配 `apiContract.feedback`。在传输加密配置中合并 `apiContract.feedbackTransportRoutes(apiPrefix)` 返回的路由预算，提交、消息和附件路径允许最多 16 MiB 明文。应用关闭时先调用 `await feedback.close()`，再关闭 RelDB。 [Kit 接入](kit.md#protocol-integrations) · [配置说明](../configuration/feedback.md)

<a id="feedback-capture"></a>

### 首帖现场

`FeedbackModal` 在已登录页面挂载，`captureKey` 使用当前会话或用户的稳定标识。换号时更换标识，退出时卸载组件。组件在用户打开首帖弹窗时准备现场，单次发送通过既有 `onsubmit` 回调提交。自行实现界面时，可在 `reports.submit` 传入以下 `capture` 字段。

| 字段 | 用途 |
| --- | --- |
| `screenshot?` | 打开反馈或手动重截的页面截图。 |
| `browserLogs?` | 浏览器近期日志 JSON。 |
| `replay?` | 带完整快照的脱敏操作回放 JSON。 |
| `recording?` | 用户授权录制的 WebM 或 MP4 视频。 |
| `includeServerLogs?` | 设为 `true` 时，由服务端按可信身份附加可用的近期 Core 日志。 |

前四项使用和普通附件相同的 `name`、`contentType`、`dataBase64` 文件结构。首帖详情的附件元数据用 `kind` 区分材料。`scopeId` 由应用在业务请求的可信上下文中提供。例如单范围 Kit 应用用 `core.context.run({ scopeId: 'orders' }, next)`，Serv 应用可从 `createContext` 返回该范围。这与反馈鉴权使用的范围一致。Core 初始化即可记录自己的业务日志，Feedback 初始化只为符合字段要求的近期日志建立内存缓冲。

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
| `feedback.get(id, context)` | 获取反馈正文及首帖附件 | 反馈 UUID | 反馈详情 | `await feedback.get(id, author)` |
| `feedback.listMessages(query, context)` | 读取反馈对话，最新消息在前 | 反馈 `id`、`page?`、`pageSize?`，默认第一页、每页 20 条 | 消息分页和附件元数据 | `await feedback.listMessages({ id }, staff)` |
| `feedback.addMessage(input, context)` | 回复或请求补充 | 反馈 `id`、本次操作 UUID `messageId`、`kind: 'reply' \| 'request_info'`、`body`、可选 `attachments` | 已保存的消息 | `await feedback.addMessage({ id, messageId, kind: 'reply', body }, author)` |
| `feedback.setStatus(input, context)` | 标记待处理或已处理 | 反馈 `id`、`status: 'pending' \| 'handled'` | 更新后的反馈 | `await feedback.setStatus({ id, status: 'handled' }, staff)` |
| `feedback.getAttachment(input, context)` | 读取单个附件 | 反馈 `id`、`attachmentId` | `name`、`contentType`、`dataBase64` | `await feedback.getAttachment({ id, attachmentId }, author)` |

调用后先判断 `success`。未通过权限检查的请求无法读取正文或文件。列表按最近活动时间倒序。所有分页的每页上限为 20 条。

#### 场景：要求用户补截图

下面在已启动服务的异步函数内调用，`staff` 具有当前范围的读取和处理权限，`id` 来自已经受理的反馈。调用方在发送前生成 `messageId`，失败重试时继续使用该 UUID。

```ts
const request = await feedback.addMessage({
  id,
  messageId,
  kind: 'request_info',
  body: '请补充出现错误时的页面截图。',
  attachments: [{ name: 'steps.txt', contentType: 'text/plain', dataBase64: 'U3RlcHM=' }],
}, staff)
if (!request.success)
  return request
return request.data
```

附件输入使用 `name`、`contentType` 和 Base64 内容。作者提交图片时也使用此结构，调用 `addMessage` 时把 `kind` 设为 `reply`。作者从自己的反馈中查看补充请求和文件，处理人员刷新详情后能看到补充内容。 [操作与故障排查](../operations/feedback.md)
