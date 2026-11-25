# @h-ai/ui 数据结构

<a id="ui-数据结构"></a>

[English](ui.en.md) · [日本語](ui.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/ui.md) · [组件与示例](../function/ui.md#component-catalog)

用户重新打开页面时，可恢复主题、语言、导览进度和抽屉宽度。UI 不创建数据库表、Redis 键或业务文件。查询、上传、鉴权和业务记录由宿主应用负责。

<a id="browser-storage"></a>

## 浏览器存储

| 键 | 位置和值 | 谁读写、何时清除 |
| --- | --- | --- |
| `theme` | localStorage 中的主题 ID 字符串，例如 `dark` | `ui.applyTheme(id)` 默认写入，`ui.getSavedTheme(fallback)` 读取。默认回退为 `light`，没有自动过期。 |
| 宿主指定的 `storageKey` | localStorage 中包含 `themeId` 的 JSON 对象，可选主题色和调用方命名的语言字段 | `ui.createThemeBootstrapScript(options)` 生成的 HTML shell 脚本读取和规整，宿主负责同步用户在页面内的更改。没有自动过期。 |
| `hai-locale` | localStorage 中的语言代码，可用 `createLocaleStore({ persistKey })` 改名 | 浏览器初始化时读，调用 store 的 `set(locale)` 后写入。服务端 store 不读写此键。没有自动过期。 |
| `<persistKey>:<scope>:<id>` | 导览进度 JSON。默认 Cookie，也可选择 localStorage 或控制器内存 | `persistKey` 默认 `hai-guide`，`scope` 默认 `anonymous`，`id` 是导览 ID。默认 Cookie 有效一年，也可用 `guide.reset(id)` 清除指定范围的进度。 |
| `<persistKey>-pending` | sessionStorage 中的待恢复导览 JSON | 跨路由启动时写入，恢复时读取并移除。5 分钟内且范围和目标路径匹配才启动。 |
| `Drawer.widthStorageKey` 或 `hai-ui:crud:<resource.name>:drawer-width` | localStorage 中以十进制字符串存储的像素宽度 | 启用侧边抽屉调整时读，拖动结束或键盘改变宽度时写入。CrudPage 同一资源的详情和编辑共享键。没有自动过期。 |

浏览器阻止持久化时，主题和抽屉仍可在当前页面操作，导览控制器保留内存进度。服务端渲染时，为请求或布局创建独立语言和导览状态，浏览器偏好在客户端恢复。

<a id="example-data"></a>

### 记住用户选的主题

`ui.applyTheme('dark')` 将 `dark` 作为普通字符串保存到 `theme`，下次打开时可读取。应用还需编译深色主题 CSS。

HTML shell 使用 JSON 偏好时可选用 `orders-display` 作为专用键。以下为配置了自定义主题色和名为 `language` 的语言字段后保存的值。

```json
{ "themeId": "dark", "themeColor": "#5765f0", "language": "en-US" }
```

JSON 脚本与读写主题 ID 字符串的工具应使用不同的键。`ui.getThemeInitScript()` 使用 `theme` 键保存 JSON，单独采用这套协议时需要让布局按 JSON 读写。若布局使用 `ui.getSavedTheme` 和 `ui.applyTheme`，可用独立键生成启动脚本或按相同的字符串协议编写 HTML shell。

### 记住用户选的语言

调用 `localeStore.set('ja-JP')` 会向 `hai-locale`（或自定义键）保存字符串 `ja-JP`。下次仍需支持该语言，才能在检测浏览器偏好前采用该值。Paraglide 等应用翻译仍由应用管理。

### 记住是否完成新手引导

键 `hai-guide:orders:intro` 表示 `orders` 范围的 `intro` 导览。样例表示第 1 版已经完成。

```json
{ "version": 1, "status": "completed", "updatedAt": 1794873600000 }
```

`status` 可为 `completed`、`dismissed` 或 `deferred`。同版的“已完成”和“不再提示”会抑制自动邀请，“稍后”抑制 24 小时。升级 `version` 可重新提示。`updatedAt` 为 Unix 毫秒。

### 切换页面后接着开始引导

`hai-guide-pending` 暂存以下启动请求。到达 `/orders` 并恢复同一范围时，控制器用 `createdAt`（Unix 毫秒）判定是否在 5 分钟内。

```json
{ "id": "intro", "scope": "orders", "route": "/orders", "createdAt": 1794873600000 }
```

### 记住抽屉宽度

拖动订单编辑抽屉到 480 像素后，`hai-ui:crud:orders:drawer-width` 的值为字符串 `480`。操作尺寸会受抽屉的最小、最大宽度和视口约束。移除该浏览器键后会重新使用宿主提供的初始宽度。

<a id="runtime-data"></a>

## 宿主和组件交换的数据

| 公开类型 | 谁创建和读取 | 保留时间 |
| --- | --- | --- |
| `CrudData<T>` | 宿主查询或 `ui.createCrudController()` 提供给 `CrudPage`，包括记录、总数、页码、页面大小和已提交筛选。 | 组件或控制器实例存续期间。宿主决定服务端记录的保存和授权。 |
| `ArtifactDocument` 与 `ArtifactSaveRequest` | 宿主提供基准版本和内容，UI 把 `id`、`baseVersion` 和草稿交回宿主保存。 | 草稿和冲突提示留在工作区实例。持久内容、历史和版本冲突由宿主维护。 |
| `ToolRun` | 宿主给出执行回执并响应状态查询。组件按状态显示进度、结果和产物。 | UI 在工作区实例保存当前回执、计时器和取消信号。持久任务、授权和重试由执行服务负责。 |
| `FeedbackReceipt` | 宿主受理反馈后返回 `number` 和 `collectionStatus`，UI 用于显示回执。 | 证据同步、权限和保留策略由反馈服务管理，见[反馈数据结构](feedback.md)。 |

例如，`{ "id": "report-42", "baseVersion": 3, "content": "# Updated report" }` 表示用户要在第 3 版上保存草稿。如果服务器上已经是第 4 版，宿主应返回冲突，工作区保留草稿。工具回执 `{ "id": "run-42", "status": "running", "progress": 0.5 }` 表示仍在运行且完成了一半。比例范围为 0 到 1，省略时显示不定进度。[工具与产物工作台](../function/ui.md#tool-workspaces)

### 查询结果和受理回执

订单列表的数据来自宿主查询。下面是第 2 页的响应示例，展示该页的一条记录、匹配的总记录数和已应用的筛选。控制器初始为第 1 页，资源未配置页大小时每页 10 条。

```json
{
  "items": [{
    "id": "order-42",
    "status": "packed"
  }],
  "total": 11,
  "page": 2,
  "pageSize": 10,
  "filters": { "status": "packed" }
}
```

提交反馈成功后，以下回执表示已受理，附件或诊断材料仍在收集。可用编号打开反馈详情并查询后续状态。

```json
{ "number": "FB-104", "collectionStatus": "collecting" }
```
