# T001 · Feedback 全流程与复用交付

- 清单：[feedback-tasks](../feedback-tasks.md)。
- 状态：进行中；任务分支 `codex/feedback/isolated-delivery`（原 `codex/feedback/t001-module` 保留）；主分支 `main`。
- 来源：[方案](../feedback-module-design.md) §1–12；原始提交 `88421e4c86c45d58269960aad59b4bf3ac8d3756`，目标文档提交 S=`e2275a291b1b3d47c5917a0adb31f70da0cee440`（含 Reach 通知前置、保留清理边界，以及进度指向任务清单的纯文档澄清）。
- 前置：无。复用 core/reldb/storage/reach、oRPC/serv、UI、CLI fullstack 模板；不新增通用 telemetry 模块。

## 第 1 轮 · 2026-10-24

- 起点：`0ea45edd`，工作区干净；规划信息独立提交后创建任务分支。
- 接受标准：空描述可提交；有界脱敏现场和截图保存；未授权访问拒绝；幂等/重启/失败恢复可观察；分页、处理/撤销、邮件及离线包可使用；模板生成可运行。
- Red：生命周期用例 `tmp/feedback-validation/red/lifecycle-valid.log`，依赖已就绪但 init.success=false；UI 空说明调用次数为 0；serv 响应缺少 requestId；只读管理员可以补写他人证据。导入/签名错误的第一次尝试不计有效 Red。
- Green/重构：已实现新包 Node/client/bundle、共享 contract、serv/kit、core/API-client 观察点、三语 UI/admin、CLI 命令和模板；仍在验收与集中修复，不能视为最终交付。
- 定向结果：生命周期/工作流/可靠性 3 文件 12 用例通过；真实 SQLite/PostgreSQL/MySQL + RustFS S3 + 本机 SMTP 协议接收器的 3 个闭环通过（`providers-01.log`）。SMTP 使用 Nodemailer/TCP，未向外网管理员发信，不代表真实邮箱入箱。
- 真实边界：用户/租户隔离、只读不可补写、幂等 ACK、严格日志窗口、通知多收件人汇总、任务 token/数据库时钟、导出快照和清理互斥已实现并增加回归；实际锁等待、双 Node、UI 与生成工程继续验证。
- 构建前置：首次因反馈 tsup 配置括号错误失败并导致 adapter 声明缺失，已修；最新受影响依赖图 17/17 构建成功（`prerequisite-build-04.log`）。后续源变更后按影响范围重建。
- 验证计划：受影响包 typecheck/lint/build/test、check:skills、CLI scaffold gates、真实 DB/S3/SMTP 和 UI E2E；按分轮调度记录退出码、耗时及证据。
- 实现提交、合并、集成验证：尚未发生。
- 下一步：完成定向修复，冻结源码，脚本化收集 typecheck/lint/build/test、AI/env/docs 门禁与 admin/CLI 浏览器闭环；通过后提交、合并和主分支验证。

## 定向收敛 · 2026-10-24

- 新增有效 Red 并修复：同批冲突证据错误 ACK、列表升降序与编号搜索、采集重试耗尽终态、已过期导出快照无法重建、过期内容在任务快照与未登记对象中残留。
- 日志窗口：重叠错误各保留前后 100 条上下文；已 ACK 事件归属稳定；过大、容量、临时写入/读取失败均有明确 missing，不假装完整。
- 清理：删除报告及证据/附件/历史/含诊断快照的任务，按独立报告前缀清扫对象；仅保留 24 小时最小清扫墓碑回收迟到对象，结束后删除墓碑。清理故障持续退避重试。
- `domain-09.log`：工作流、保留、采集边界、可靠性共 24 项通过；`feedback-jsdoc-02.log`：58/58 声明及可编译示例通过。
- `feedback-all-01.log`：60 项中 59 项通过，MySQL 双进程暴露重复建索引失败；修复为核验真实定义后复用，竞争时只接受完全相同的索引。`two-nodes-02.log`：PostgreSQL/MySQL 两项实际双 Node 同时 claim 均通过，SMTP 各收到一封；不是同单例 Promise 或 mock 并发证据。
- 管理台真实浏览器先暴露 modern CSS 截图失败、文本裁切、编号搜索和邮件链接问题，均保留严格断言修复；改为脱敏 DOM/SVG foreignObject 截图并有界等待字体。中间 6 场景已通过，最终版本 metadata 修复后重新收完整 6 场景证据。
- 接入契约：模板普通业务与 feedback 使用相同的可信应用 scope；用户/租户取自认证上下文，不从客户端 header/JSON 获取。新增生成行为测试验证有效 token 与伪造身份拒绝。
- 临时产物：子任务删除根目录 `.svelte-kit` 被自动审批以 `blocked by policy` 拒绝，已保留 ignored 目录，无运行时代码影响；不绕过审批重删。
- 后续：冻结最终源码后收全工作区门禁、最新 dist 离线浏览器与真实脚手架门禁；只在完整通过后标记验收与建立 B/H。

## 全量收集第 2 轮与集中修复

- `tmp/feedback-validation/round-02/results.json`：typecheck 51 个任务、lint 30 个任务、build 35 个任务、脚本 91 项通过；API inventory、JSDoc、skills 与环境映射检查通过。
- 全工作区测试：容器组 31 个任务通过，含 feedback 10 文件 60 项；普通组发现 FeedbackModal 的 data-* 透传和 CLI 独立发布包遗漏离线依赖内联，按轮收集完成后统一修复。API smoke 检查本身的目录计数作用域错误已修，22 个公开包/32 个浏览器入口通过。
- 有效 Red：身份元组使用冒号连接造成碰撞（scope=`one:two`/user=`three` 与 scope=`one`/user=`two:three`）。改为 JSON 元组摘要并核验重复回执所属范围、用户、应用与删除状态；工作流 9 项通过，JSON 内容摘要改为与 locale 无关的排序。
- 另外隔离复现了补采容量失败连带耗尽通知，以及 pending 附件未进入离线包 missing；通知、补采和附件完整性分别修复验证，不以已受理掩盖材料缺失。
- 当前继续完成集中修复、定向回归与最新构建后的离线/脚手架验收，尚未建立最终基线。

## 浏览器与发布产物收敛

- 通知/导出新增 8 项回归通过：SMTP 前 token/租约/删除/数据库错误阻断；补采失败独立于通知；冻结附件 pending/failed 明确缺失；可用附件读取和 checksum 错误仍重试。
- UI 新增 data-* 宿主透传、空说明回退事实摘要、合法非预设页大小显示回归，定向 5 文件 64 项、类型/Svelte/JSDoc 与 lint 通过；同步 UI 三语组件目录与共享 hai-ui → hai-feedback 指引。
- `tmp/feedback/e2e-round03-final.log`：管理台真实 Chrome 6/6 通过，含字节级 PNG 上传、JPEG 遮挡烧录、断网 ZIP、401/403、分页处理/撤销与邮件深链。截图保存在 `apps/admin-console/test-results/run-01DCwW/group-1/results/`，已目检原生/采集字体和图标、无反馈浮层、遮挡实际写入 PNG。
- 正式离线浏览器首次暴露 CLI 根 tsconfig 将 bundle 公共入口解析到源码，遗漏构建注入的回放引擎。修为解析公开 dist 后内联，保持 CLI 不依赖反馈数据库/对象存储/邮件运行时。
- `tmp/validation/feedback-offline-browser/run-mk8z8t/result.json`：正式 CLI/dist 回放通过暂停/续播/回零/精确时间/末尾定位，外网请求为 0、原应用脚本未执行；已目检 viewer.png。独立发布归档实际 pack/install 测试 2/2 通过，隔离 guard 下 summary/evidence 正常执行。
- 所有源再次冻结，下一步收根门禁及默认完整脚手架门禁；最后 UI 列表微调后的管理台场景再验证。

## 根门禁第 3 轮与构建环境核对

- `tmp/feedback-validation/round-03/results.json` 全部通过：typecheck 51、lint 30、build 35；根 `pnpm test` 包含脚本 91 项、普通组 38 个任务及容器组 31 个任务；feedback 11 文件 69 项、UI 390 项均通过。
- 公开入口 22 包/32 浏览器入口、API inventory、JSDoc（含 UI 392/392）、47 个 skill/545 引用及环境映射均通过。未变输入按 Turbo 缓存复用；feedback 的新业务及真实 Provider/多 Node 测试本轮重新执行。
- 只读构建 dry-run 证实新 HAI_BUILD_ID/HAI_BUILD_COMMIT 被 Turbo strict 环境剥离（对照 VITE 变量可传入）；在整轮收集结束后，仅为根 build.env 补入这两个精确名称，使覆盖值实际传递并参与缓存键。隔离探针 Red 为 `tmp/feedback-validation/red/metadata-env.log`，不新增配置镜像单测。
- 此配置同步后再执行根原门禁、脚手架与最后管理台 E2E；不把第 3 轮结果直接冒充最终输入验证。

## 第 4 轮与独立边界审查

- `tmp/feedback-validation/round-04/results.json`：typecheck 51、lint 30、build 35、脚本 91 项及公开入口、inventory、JSDoc、skills、环境检查通过；根测试仅既有 RelDB MySQL 跨表事务用例在默认 5000ms 超时，其余 642 项通过。未修改 RelDB 源码或放宽超时，完整文件原样重跑 33/33 通过，证据 `reldb-tx-replay-01.log`；最终根门禁仍需再次通过。
- 源冻结期间独立审查复现三类缺陷，先将新回归加入主工作树获得有效 Red，再统一修源：MySQL 大小写/重音/尾空格可混入其他身份和证据；JSON/转义 JSON 及授权文本凭据未全脱敏；合法不透明附件 ID 与 ZIP 路径规则不一致。
- MySQL 修为索引预筛选加二进制精确比较，在 COUNT/LIMIT/日志窗口之前过滤，并在取单条及任务 claim 后核验精确身份。真实 `utf8mb4_unicode_ci` 数据库六项新回归全部通过，见 `tmp/feedback-identity-candidate/green.log`。
- 浏览器和服务端复用私有纯文本脱敏函数；真实 logger → 临时数据库 → 公开 API → ZIP 回归不再含敏感哨兵。附件保持原始 ID，ZIP 路径改为 JSON 编码 ID 的 SHA-256；API 在受理前拒绝孤立代理字符。bundle/通知导出 21 项、contract 3 项通过。
- 首轮定向 Green 收集完毕后，仅集中修正 Cookie 遗留常量引用和新测试的类型/格式问题；不修改原有断言或放宽边界。随后重建并收最终全仓、生成工程、正式 dist 离线查看与管理台六场景证据。

## 最终根门禁第 5 轮

- `tmp/feedback-validation/round-05/results.json` 全部 exit 0：typecheck 51、lint 30、build 35，脚本 91 项；根测试普通组 38 个任务及容器组 31 个任务通过。未变输入按 Turbo 缓存复用，RelDB 本轮真实重跑 27 文件 643 项，feedback 真实重跑 13 文件 82 项，包含最新 MySQL 身份、服务端脱敏及附件 ID 回归。
- 公开导入 22/22 包、32 浏览器入口、API inventory、JSDoc、skills 和环境映射全部通过。独立审查按方案 §1–12 核对，未发现新增实现缺口；剩余实际生成工程和最终管理台 E2E 不以模板静态测试代替。
- fresh build 后 `tmp/validation/feedback-final-dist-05/` 记录正式离线浏览器与独立发布包安装 2/2 通过；`tmp/validation/feedback-offline-browser/run-0g9n3l/result.json` 显示外部请求 0、原应用脚本未执行、10 个真实 rrweb 事件，viewer.png 已目检。
- 本轮结束后仅同步三处遗漏的 22 包文档计数，不改变运行时；继续收集默认完整脚手架与最终管理台六场景，任务仍为进行中。

## 完整脚手架第 1 轮 · 公开消费边界

- `pnpm --filter @h-ai/cli test:scaffold-gates` 第一批 20 项通过；10 类完整生成工程为 9 通过、1 失败，日志 `tmp/feedback-validation/final-scaffold-gates.log`，原始退出码 1 已保留。
- 唯一根因：fullstack-feedback 两个 Svelte 模板引用 `@h-ai/ui/i18n` 未公开的 `uiM`。源码别名和模板行为单测未覆盖安装 tarball 后的 Svelte 公共类型消费；真实生成工程类型检查两处报错，是有效 Red。
- 集中修复仅将这两个模板的七处文案调用改为项目 Paraglide：复用现有标题、失败消息，新增日志与导出等待中英日文消息；不扩大 UI 公共 API。共享 hai-ui skill 明确内部翻译边界。
- 修复后先重跑原 fullstack-feedback 实际安装/类型/lint/构建/单元/浏览器场景，再运行默认完整脚手架门禁，不能把首轮 9 项通过当作整个门禁成功。

## 模板定向与最终管理台

- 五文件 i18n 修复后 CLI 5 文件 145 项通过，三语消息实际渲染、JSON 解析和 lint 通过；证据 `tmp/validation/feedback-template-i18n/source-unit.log`、`messages-lint.log`。共享 UI 私有 API 未增加。
- 管理台最终完整六场景通过（`tmp/feedback/e2e-round05-final.log`，`apps/admin-console/test-results/run-YvsjLS/`）；截图、实际烧录的黑色遮挡 PNG、列表摘要/页大小、离线 ZIP、邮件详情已目检，runner/4173/12580/12583 已释放。
- `scaffold-feedback-targeted-green.log`：生成工程全部类型/lint/构建/单元通过；11 个浏览器用例为 10 通过、1 失败，反馈已受理，关闭按钮定位同时匹配头部图标与底部按钮。保留断言并收窄底部按钮定位。
- `scaffold-feedback-targeted-02.log`：同样 10 个浏览器用例通过，底部按钮的首尾锚定文本筛选超时；已保存 trace/快照，核对实际 DOM 后再修定位。两次原始退出码均为 1，不视为完整场景通过。
- 关闭定位单行修正后的独立 8 项模板单测为 7 通过、API 生成工程内嵌 ESLint 用例 60000ms 超时（实际 107.9s，总轮 140s），fullstack lint 用例通过；runner 自然退出，finally 自动回收夹具，无手工 kill/删除。未放宽测试超时或关闭规则，最终原 CLI 全单测仍须通过。
- 只读核对不能确证该单测超时的环境/执行器根因，不将超时当通过；最终以原 CLI 完整测试结果确认。trace 展开后的实际页脚 textContent 为 `" 关闭"`，含 U+0020；离线 Chrome 静态片段验证旧筛选 0 命中、去掉文本筛选首尾锚点后唯一命中 1。保持 role/name 和原断言，仅据此修正定位。
- `scaffold-feedback-targeted-03.log` 与对应 status：原 fullstack-feedback 真实场景完整通过，exit 0；公开 tarball 安装、类型、capabilities、lint、构建与单元通过，浏览器 11/11（含反馈空说明/附件/关闭/处理/撤销）通过。整个场景及清理完成后再启动根第 6 轮，不使用仍存活进程或未完成清理的通过片段。

## 第 6 轮与终端测试夹具收敛

- `tmp/feedback-validation/round-06/results.json`：类型、lint、构建、脚本、公开 API、inventory、JSDoc、skills 和环境检查通过；容器组 31/31 通过。CLI 原模板测试 8/8 通过，保留原 60000ms 超时；此前独立运行的超时证据仍保留。
- 根测试只有 CLI 终端重绘文件四项在默认 5000ms 超时，CLI 共 547 通过、4 失败；其中两项生成未结束即清理导致 ENOTEMPTY。普通组为 37/38，未将局部通过当作完整门禁通过。
- 根因边界：12 个仅检查终端问题对象的用例为获取问题而完整复制三端工程。修复只在真实问题已收集后的模板生成入口拒绝同一哨兵错误，保持真实 prompts、语言/宽度/符号/重绘断言、默认超时和三个实际生成的安装失败场景。生产代码未修改，真实生成仍由完整 scaffold gates 验证。
- `tmp/cli-prompt-fixture-candidate/green.log`：原文件 20/20、exit 0；所改文件 lint 与 diff 检查通过，新增临时目录残留 0。两处既有超时夹具的精确路径已核验，清理仍被自动审批以 `blocked by policy` 拒绝，连同根 `.svelte-kit` 保留，不绕过重试。冻结后重新执行原根门禁和默认完整脚手架门禁。

## 第 7 轮与导出状态边界

- `tmp/feedback-validation/round-07/results.json` 所有门禁 exit 0：typecheck 51、lint 30、build 35、脚本 91、根测试普通组 38/38 和容器组 31/31、公开 API/inventory/JSDoc/skills/环境检查通过；CLI 原单元测试 551 项全部通过，含 20 个终端用例与 8 个模板行为用例。
- 同轮并行只读审查发现生成工程的导出缺口：模板只对 409 继续轮询，但服务端仅查 succeeded，将已受理的 pending/running 任务也返回 404，首次点击可能立即报错。既有生成工程反馈场景未实际点击导出，未覆盖此分支。
- 收集整轮结果后集中修复：明确有效生成期 pending/running 为 409、failed 为 500、缺失/过期为 404；管理台对非等待状态立即显示错误；新增状态回归与真实生成工程 ZIP 下载检查。继续保持进行中，不用此前门禁代替新输入验收。
- `export-status-red.log` 新增 11 项公开 API 回归，4 项因错误 404 获得有效 Red；修复后连同工作流/通知导出/保留回归 35/35，通过真实 worker 暂停覆盖 running，权限和 checksum 仍严格校验。模块类型、lint、skills 通过，三语消息/README/使用 skill 同步。
- fullstack 反馈浏览器场景补充真实下载，校验 ZIP 路径/容量/checksum、编号/修订、遮挡预览与包内 PNG 字节一致、移除附件不存在；仅选 feedback 时添加公开 bundle 读取器开发依赖。开/关两套模板渲染 TS 语法、ESLint、JSON 检查通过（`tmp/feedback/export-e2e-static.log`），实际下载仍待默认完整 scaffold gates 执行。

## 并行输入隔离

- 第 8 轮期间发现原工作区正被另一任务写入部署 `hai.json` 迁移和 S3 bucket 初始化修改；CLI 测试读到已删除的模板，部署构建读到写入中的脚本。本轮输入不稳定，不作为最终 feedback 验收；不修改、还原或提交另一任务的内容。
- 从固定 S 新建独立工作树 `C:\Users\gudao\.codex\worktrees\feedback-delivery\hai-framework`，任务分支为 `codex/feedback/isolated-delivery`。按文件所有权快照 feedback 改动，重叠 CLI/Core/admin/文档从基线重建并剔除其他任务 hunk；保留旧部署契约，重新安装、构建及完整验收。原工作区与原任务分支保留，未做清理或历史重写。
- 旧轮证据仍在原目录 `C:\workspaces\hai-series\hai-framework\tmp\feedback-validation` 等已记录位置；隔离后证据在独立工作树的 `tmp/feedback-validation/`。校验清单和快照 SHA256 位于两目录的 ignored `tmp/feedback-isolation/`。
- 隔离核对补齐日文根 README 五处 22 包计数，剔除混入的部署 JSON 测试夹具与断言。该整理无额外运行时功能范围。

## 隔离目录完整收集第 1 轮

- 独立 `pnpm install --frozen-lockfile`、公开包 fresh build 及 22 包 API 清单重生通过；依赖真实路径位于本隔离树，没有复用原目录的 node_modules/dist。仅导入第 7 轮 exit 0 的测试缓存，是否复用由 Turbo 输入摘要判断；未覆盖新目录已有构建缓存。
- `tmp/feedback-validation/isolated-01/results.json`：typecheck 51、lint 30、build 35、脚本 91、22 包/32 浏览器公开入口、API inventory、JSDoc、47 skills/545 引用和环境映射全部 exit 0。
- 根测试普通组 37/38、容器组 30/31；CLI 551、UI 390、RelDB 643、feedback 14 文件 93、serv 227、IAM 359、admin 单元 19 等全部通过。feedback 包包含新增导出 11 项和真实三数据库/S3/SMTP、多 Node 领取、隐私与离线包回归。
- 两处失败保留：未改动的 deploy-secret-masker 默认 5000ms 进程场景超时；storage-file 的 RustFS beforeEach 初始化 hook 120000ms 超时，未进入缺失源文件 copy 断言。不能确证环境根因，不将超时视为通过；整轮收集后，保持源码/断言/超时原样串行重跑两个包，并再次执行原根 `pnpm test`。
- 正式独立 CLI/dist 离线浏览器 exit 0：`offline-browser-isolated.log`、`tmp/validation/feedback-offline-browser/run-m0tU3k/`。10 个真实 rrweb 事件、196405 字节内嵌回放，播放/暂停/定位/筛选通过，外网 0，原应用和用户脚本均未执行；viewer.png 已目检，端口/进程释放。
- 整轮后原样串行重跑 deploy 197/197、storage 301/301 全部通过，未修改源码、断言或超时；`isolated-replays-status.json` 记录两个原包脚本 exit 0。随后原始根 `pnpm test` exit 0（`isolated-original-test-confirmation.log`），按相同输入缓存复用已通过项，普通组 38/38、容器组 31/31。原两处超时记录保留，不确认为实现缺陷或删除失败证据。
- 根门禁已满足，继续默认完整 CLI scaffold gates（不筛选测试名），验证所有 10 类生成工程及新 ZIP 下载行为，完成后再提交并集成。

## 隔离目录完整脚手架收集与两处集中修复

- `final-scaffold-status-02.json`：默认原命令自然结束并完成清理，exit 1；轻型批次 20 项通过，10 类完整生成工程为 9 通过、1 失败。API feedback 的真实安装与四个 API 浏览器场景通过，其余普通模板全部通过。
- 唯一失败为 fullstack-feedback 的实际截图烧录：UI 提供 0–1 相对坐标，模板直接传给使用原图像素的 SDK。64×64 红色图片的 10%/10%/20%/20% 遮挡区应覆盖像素 (12,12)，但实际仍为红色，是有效行为 Red，不修改取样点、预期颜色或 ZIP 字节断言。
- 全栈浏览器原始结果 10 通过、1 失败；失败发生在提交前，新增的服务器 ZIP 下载尚未到达，不能将静态检查当实际下载通过。整轮收齐后才修正模板换算，并同步公开坐标文档。
- 同轮独立审查发现通知邮件缺少方案 §8 的反馈时间和材料状态；按实际 SMTP DATA 正文增加中英日完整/采集失败行为回归，确认有效 Red 后补齐邮件内容。默认敏感信息、日志缺失、权限、通知受理与离线边界核对未发现其他实质缺口。
- 接下来先定向验证两处行为，再运行最终根门禁、默认全部 10 类脚手架和最终集成管理台浏览器；任务继续为进行中。
- 邮件有效 Red：`tmp/feedback-mail-candidate/red-status.json` exit 1，新增中英日 complete/failed 六项均通过真实采集状态、配额失败原因、SMTP 接收数量和 MIME 解码前置后，因正文缺反馈 UTC 时间失败；原三数据库用例通过。补齐时间与发送前最新材料状态后，原 providers 文件 `green-status.json` exit 0，9/9 通过（36.432 秒），未增加解析依赖或放宽断言。
- 截图最小修复使用既有预览 URL 的 `Image.decode()` 和 naturalWidth/Height 换算，不新增对象 URL 或公开 API；三语 README、共享使用 skill、中文 JSDoc 同步。`mask-coordinate-candidate/applied-state.json` 记录候选哈希匹配，严格 E2E 文件未变。

## 截图补充与最终源码门禁

- 邮件/遮挡修复后的 `tmp/feedback-validation/isolated-02/results.json` 全部 exit 0：typecheck 51、lint 30、build 35、脚本 91、工作区测试普通组 38/38、容器组 31/31；CLI 551 项、feedback 14 文件 99 项通过。公开入口 22 包/32 浏览器入口、API inventory、JSDoc、47 skills/545 引用与环境检查全部通过。
- 用户追加要求关键使用流程截图，并授权主分支集成、根版本 `0.1.0-alpha.69` 提交及 GitHub 推送。原目录仍有部署/存储等并行修改，保留原内容；远端 `main` 已 fetch 核对为 `0ea45edd`，未把其他任务分支提交混入本任务。
- 根门禁整轮自然结束后，仅在两个既有 E2E 加 capture/必要滚动与图片局部截图，覆盖真实两页、遮挡前后及模板已处理状态；原业务断言、超时、(12,12) 精确像素与 ZIP 字节校验保持。`screenshot-candidates/applied-state.json` 记录哈希和应用顺序。
- 最终截图索引只采用独立树的正式新运行；管理台在实际集成版本 fresh build 后重新跑完整六场景并逐图目检。截图、日志及报告留 ignored 验收目录，不提交二进制产物。
- 截图补充后原模板行为 8/8、管理台 E2E 文件 lint 通过；真实 fullstack-feedback 专项 `scaffold-feedback-targeted-final-status.json` exit 1（287.47 秒）。类型/lint/构建/单元通过，浏览器仍为 10 通过、1 失败，(12,12) 保持红色，实际 ZIP 尚未执行；继续核对图卡操作和实际生成产物，不放宽像素断言。
- 本地 main 已合入加密容量与统一部署配置，固定待合入头为 `33b6fc85a7dc9345a0cd98d1eda2de730061c23c`。先将当前进行中成果做检查点提交，再合入最新主线并解决公共契约冲突；尚未标记已验证/已完成，不用旧基线验证代替主线集成验收。

## 主线集成、默认反馈与 Node 安全基线

- 进行中检查点 `6de2f2adbb4892378509a4be4a1cdfd3992add23` 已经正常提交，219 文件；Husky 未跳过。合入固定 `33b6fc85` 后逐 hunk 解决 9 处冲突，同时保留部署 `hai.json`、S3 可选建桶、容量配置以及 feedback 请求/日志观察和权限契约；API 清单由新声明重新生成。
- 第二个真实截图缺陷已由 trace 证实：操作正确命中上传图片，SDK 更新原始附件时 Svelte 深代理仍缓存旧字节。模板草稿改为 `$state.raw`，保留原像素、图片卡和 ZIP 断言；不把旧图 URL 更新当作烧录完成。
- 参考 admin 与选用 feedback 的新 API/fullstack 工程显式用 8 MiB 明文预算容纳 5 MiB 附件的 Base64；框架全局默认和既有宿主配置保留。原全栈 E2E 另上传约 2.07 MiB 文本日志并校验服务器 ZIP 字节。首次整行条件放在 env 花括号内导致 HBS 语法失败，已保留前置失败日志并改为整行 if，不计业务 Red。
- fullstack 默认功能的有效 Red 为 3 通过、1 因缺少真实 `@h-ai/feedback` 生成依赖失败；实现仅在省略 features 时默认加入 feedback，同 4 项 Green（`tmp/feedback-default-validation/`）。显式选择与其他应用类型保持原约定；默认完整脚手架现合并为 11 类（含 main 的独立传输容量场景）。
- 管理台默认启用与角色分权原本已实现；新增 IAM 公开行为 4/4 通过，未制造 Red。正式浏览器由 6 增为 7 场景，补默认普通注册用户的桌面/窄屏提交、自己的报告读取、管理页面和 API 拒绝，以及断网后重试回执；浏览器仍待最终运行。
- Node 依据 2026-10-21 官方安全补丁收口为 `^22.23.4 || ^24.22.1 || ^26.12.1`，42 份实际/模板 engines、5 处 CI 和三语说明已同步；Docker 已是 24.22.1。用户目录独立运行时经官方 ZIP SHA256 与实际 node.exe 校验，Node 24.22.1/pnpm 12.11.2 下 frozen install exit 0。系统 `Program Files` 的 24.18.0 未替换，当前进程没有管理员权限，不把独立工具链安装称为系统级升级。
- `merged-prerequisite-build-status.json`：在 Node 24.22.1 下 23 项公开依赖强制 fresh build 全部通过、无缓存；随后 API inventory 重生成 exit 0。源码冻结后先重跑失败的实际全栈专项，再开启合并后的完整根门禁与全部 11 类生成工程。
- 原目录 327 路径、原 index、HEAD/分支及二进制差异已完整备份到 `tmp/feedback-integration-safety/2026-10-24T01-55-47-503Z`，文件 SHA256 全程稳定。原目录存储启动测试已确认属于 main 叠加 feedback 依赖 mock，没有剩余不明来源源码；物理切换前仍须逐项比较最新内容，不删除其他任务成果。
