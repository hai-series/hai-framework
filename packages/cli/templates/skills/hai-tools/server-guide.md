# 服务端工具、产物与多节点

从 `@h-ai/tools/server` 导入 `tools`。这是 Node 服务端入口，提供轻量方法及 `tools.createService/createArtifactTools/createJobTools`；浏览器继续使用轻量入口。服务借用已初始化的 Runner，不对 Runner 执行 init/close。

## 组装同一服务

```ts
import type { RunnerFunctions } from '@h-ai/runner'

import { type ToolArtifactAccess, tools } from '@h-ai/tools/server'

export function createDocuments(runner: RunnerFunctions, files: ToolArtifactAccess) {
  // 用已初始化的 Runner 创建下方文档服务，成功返回持久任务服务实例；配置或处理器注册失败返回错误。
  return tools.createService({
    id: 'documents',
    runner,
    // 为当前授权范围使用宿主文件接口构建产物工具集；未提供保存权限时不加入保存工具。
    createTools: context => tools.createArtifactTools({ context, files }),
    enabled: { groups: ['documents', 'analysis'] },
    authorize: ({ context }) => context.scope.userId.length > 0,
  })
}
```

先检查创建结果的 `success`。示例只检查可信用户是否存在；实际资源权限仍在宿主的 read/publish/save 及最终提交时校验。`ToolServiceContext` 包括可信 `scope: { tenantId, userId }`、可选 sessionId/signal；真实 execution 只由 Runner 补入，不能接受模型自报的身份。

`ToolSet` 返回 tools、可选 groups 及 environments（工具名到 Runner 环境 ID）。`enabled` 必填，groups/tools 取并集后应用 exclude，空对象全部停用。目录根据当前工厂与 enabled 产生，不逐项调用 authorize；按用户隐藏时在这两处过滤。submit 和 execute 两阶段重新检查授权、当前工具启用及环境绑定。

## 提交、续看、取消

- `service.catalog(context)` 返回当前可见的定义与分组。
- `service.submit({ name, input, idempotencyKey? }, context)` 返回 `ToolRun`，含 receipt:{id,key}、status、events、next 和可选 output/failure。
- `service.find(idempotencyKey, context)` 通过原有 Runner 幂等记录找回同主体任务；不存在时 data 为 undefined，不等于请求已取消。
- `service.inspect(receipt, context, { after? })` 读取实际状态及增量事件；完整回执按主体、服务和任务归属校验。
- `service.cancel(receipt, context)` 只请求取消；queued/running/cancelling 都应继续查询到终态。
- `service.invoke(request, context)` 提交并等待终态，返回 `HaiResult<RunnerJson>`。信号取消会请求 Runner 取消，但不是进程停止证明。
- `service.close()` 只注销自己的处理器，不关闭 Runner、不删除任务，也不代表所有任务停止。

runTimeoutMs/queueTimeoutMs 默认各 300000 毫秒，范围 1～86400000。界面手动调用与模型/Broker 调用应经过同一服务，不复制 handler、授权或任务表。

## 产物和现成作业

`tools.createArtifactTools({ context, files })` 提供 artifact_create/read、可选 artifact_save 和 data_analyze。`files.save` 不存在时不提供保存。data_analyze 是结构化数值统计并创建表/图，不是任意代码运行器。

宿主实现 `ToolArtifactAccess`：read 返回授权文件字节，publish 保存字节并返回 `{id,title,kind,version,mediaType}`，可选 save 接收 `{id,baseVersion,content}`。文档版本与 Git revision 独立，冲突、幂等、归属和最终写入条件由宿主维护。大文件只返回授权引用，不进入模型上下文或事件。

`tools.createJobTools({ context, files, runner, environments, browserProxy? })` 接入 documents/office/ocr/browser/web/preview/video 环境；缺少环境时不创建对应工具。环境 ID 必须指向已登记能力、固定镜像、资源限额和正确网络策略。documents/office/ocr/preview/video 离线，browser/web 使用内部网络及受控代理。

browser/web 还必须有可信宿主提供的 browserProxy，格式为 `http://非 loopback IPv4:port`。通过 RunnerLaunch.env.HAI_TOOL_BROWSER_PROXY 交给容器，不接收模型指定或覆盖；可复用已有模型出口代理，无需另建必需服务。安装包不会下载镜像或启动服务。

office/ocr 是环境键，作业归 documents 组；browser/preview 作业归 web 组，不要把环境名当成额外组。browserProxy 只接受 `http://<IPv4>:<port>`（可带结尾/），拒绝 0.0.0.0、127/8、169.254/16、224/4，不允许凭据、其他路径、query、fragment、主机名或IPv6。web/video 可从资源 pids:512 起测，并调整节点 toolCapacity 承接并发总量；实测128曾触发EAGAIN，512不代表所有镜像/并发都足够。

视频 Runner 环境本轮使用 resources.scratchMiB:6144，节点 toolCapacity.scratchMiB:8192。HyperFrames0.9.56 硬性要求 tmp/output 各至少1024MiB空闲；含输入时 Runner 的 tmp 只占总 scratch 四分之一，6144 留1536，旧总512不足。配额不是已占内存，不能关闭磁盘检查，节点还需覆盖 host/default 与并发总量。数值是本轮起测预算，不代表全部视频/流程已验收，详见作业README。

提交、单事件、输出各受 Runner 的512KiB JSON上限；50MiB是文件字节限制，容器输入还受scratchMiB较小值约束，不能内联同样大小文件到JSON。find返回HaiResult；未找到时success:true、data:undefined，HTTP宿主可投影null。任务/幂等键沿用Runner保留期，清理后无记录不能当作从未受理或已取消；长期去重由业务维护。

`environments.preview` 将 web 组工具 `preview_build({ fileId })` 绑定到离线能力 `preview.build`，读取授权项目 ZIP，返回 kind html、text/html 的自包含产物，沿用现有 ArtifactWorkspace 隔离预览；本地构建不需 browserProxy。ZIP 根必须有 index.html，固定 esbuild/Svelte 工具链只编译本地 HTML/JS/TS/CSS、白名单 Svelte 浏览器组件与本地素材。支持受限 Vite 根路径布局，不运行 Vite；import.meta.env 仅固定 production 字段，不支持 import.meta.url；忽略 package/vite/svelte/tsconfig，不执行项目脚本/config 或安装依赖。不支持 node_modules、SvelteKit、任意 npm 包/插件、远程构建资源、computed import、多 module 入口、srcset、async/defer 或嵌套文档。展开8MiB、单源码1MiB、最终HTML1MiB、固定Node命令60秒；失败不发布旧HTML。关闭预览卸载iframe，构建容器已销毁，不新增网关、队列或状态表。宿主仍须配置父页面 frame-src 策略。

图像、语音和文档改写由 `ai.tools.createBuiltinTools` 构造并合并到同一个 ToolSet。MCP 协议与已有服务调用归 AI 适配层，Tools 不反向依赖 AI。video_render 消费准备好的视频项目包。ai.tools.createBuiltinTools 仅在传入 executeJob 时登记 video 组的 website_video；回调只允许同服务 web_capture/video_render，AI 负责真实网页采集后的脚本分镜、逐镜 WAV、字幕和工程组装。配置实际 LLM、默认 WAV TTS、web/video 环境及 browserProxy，长流程 runTimeoutMs 可设 1200000。结果保留可编辑 STORYBOARD.md、脚本/设计/音频/字幕/封面/工程/MP4；captureId/storyboardId/audioIds 支持复用采集和未改配音。字幕按句、配音不能放入目标时长则失败，不裁音。宿主还须按全局 groups/tools/exclude 确认 web_capture/video_render 均实际启用，再为 website_video 注入 executeJob；Agent 已在装配时检查，任务依赖授权不覆盖全局停用。不要用模拟结果代替真实模型与 HyperFrames 验收。

## 多节点边界

服务注册 Runner 类型 `hai.tools.<id>.v1`，所有节点使用一致的服务 ID、工具和环境配置，共享原有 Runner 数据库与 Storage。不新增 Tools 状态表或队列，不用进程内 Map 代替共享状态。API 节点可设置 Runner executor:false；执行节点提供唯一稳定 nodeId 和镜像。执行节点重建工具并再次授权；旧目录和已领取的任务不能绕过禁用或资源权限。

服务错误先判断 HaiResult.success；不要把失败 HaiResult 从普通 handler 返回。日志使用脱敏诊断，未知异常不直接显示给用户。下载、媒体 Range 与历史版本读取也必须按当前身份授权。
