# T002 · 部署连接复用与 SSH 密码登录

- 清单：[deploy-tasks](../deploy-tasks.md)。
- 状态：已完成；主分支 `main`，实施复用 `codex/feedback/isolated-delivery`，最终在原目录 main 验收。
- 需求：[独立方案](../deploy-connection-reuse-design.md) 全文；文档基线 B=S3=`f63056ae75af7eb7c8cb7483b9f42b98f57a6367`，实现基线 H=F2=`bdceab7b3f88755ffa981e778854da8035705160`。
- 前置：`33b6fc85a7dc9345a0cd98d1eda2de730061c23c` 已是 main 祖先；根版本提交 `fe2ac6c1c83f68cbfdbc40fcb5e320993bef5b0e` 保持 alpha.69。

## 实施前现状与范围

已有完整 provider、离线 target 和中间件值可以复用；目前仅 key/agent，缺少密码方式。已确认缺省 ssh 节点的叶变量不生效，旧跨环境 `.env.local` provider 会压过明确环境目标。修复配置来源与按环境记忆，不恢复旧部署 YAML 或混用服务运行配置。

只读分析保存在 ignored `tmp/feedback-acceptance/` 的配置复用、SSH 密码和构建元数据报告；报告不是通过的新功能验收。私有环境值和密钥内容未读取或提交。

## 实施与验证

SDK、环境解析、CLI、跨平台交付脚本、三语文档/skills 已集中实现。环境层有效 Red 为 10 失败/14 通过，修复后 25 项通过；SSH 参数与密码 22 项、离线上传入口 40 项通过。CLI 隐藏密码/原值/复用的有效 Red 后，引导 31 项通过。

独立审查发现自定义密码变量引用与裸 HAI_DEPLOY 父对象可能进入应用环境，均以实际生成和解包环境文件记录有效 Red，再按配置来源排除；同值普通应用配置保留。另收集到 Windows PowerShell 7 密码入口调用错误分支，新增有效 Red 后已修复。最终以 main 的真实 SSH、错误密码、SCP、主机指纹拒绝、超时及 PS5/PS7/sh 入口为准；当前不把 mock/静态通过称为真实连接验收。

按任务分开提交，再合入原 main 验收；实际提交、最终退出码、源码 SHA 和未验证边界随后记录，状态保持进行中。

## 原 main 第一轮集成回归与集中修复

- 实现提交：G1=2cc8fe8d5bdb9caa3a181f40a56a8e32e4c00bdc（构建事实），G2=5b10c5664ccb8b25588dc2a990d50f6faf52398f（密码与配置复用），原 main 合并 M2=da427756165edbcf57c1a7c51e07f1d609de357f；根 alpha.69 保持。
- M2 完整收集目录 original-final-2026-10-24T04-28-13-725Z-da427756165e：安装、类型、lint、fresh build、实际产物、脚本、API/inventory、skills/env、离线查看与管理台7场景均通过。根测试普通组37/38（CLI569通过/45正常跳过），容器组31/31；失败为部署上传脚本PS5/PS7两用例。另JSDoc缺6条内部导出示例，整轮exit1保持，不标完成。
- Turbo严格环境过滤OS，脚本误判Windows为POSIX；补运行时平台识别与系统目录定位，CLR加载前临时补SystemRoot并finally恢复。PS5读取中文源码需要UTF-8 BOM，生成脚本同步补齐。新增在PowerShell进程内真实清空OS/SystemRoot/windir的有效Red，修复后上传入口43/43通过，覆盖两种Windows引擎、原值/脱敏/清理。
- 内部helper的6条JSDoc补模块上下文示例，部署99/99通过；不增加公开index/API。仍待合入main最终门禁、实际sshd与完整CLI部署/模板验证，B/H继续未建立。

## 原目录 main F2 最终验收 · 2026-10-24

- G2 的密码与配置复用、G3=`14ca32cb94e44fa6be89619ec7eef132d01f54de` 的 Windows 入口修复及 G4 文档同步已合并为原目录 main F2=`bdceab7b3f88755ffa981e778854da8035705160`。根版本 alpha.69、Node 24.22.1，根收集 16 阶段全部退出 0，类型/lint/fresh build、普通组 38/38、容器组 31/31 和部署 99/99 JSDoc 通过。
- 05-22 部署收集在前置发现其他 runner 后停止，未运行用例或停止外部进程；只读确认这些是 Code.exe 下的空闲 Vitest 扩展 worker 后，ignored 调度器仅排除该精确路径及父进程，不放宽真实构建/测试并发检查。
- `original-deploy-lock-runtime-2026-10-24T05-23-47-764Z-bdceab7b3f88` 原始失败保留：SDK 9 通过/10 因 setup 失败跳过，apt 安装超时；CLI 9 通过/5 因 setup 失败跳过，apt update 返回 100。没有密码断言开始，不算真实密码通过。
- 本次拥有的临时容器网络探测确认默认 Debian 端点超时、TUNA HTTPS 可达。仅通过既有 `HAI_DEPLOY_E2E_APT_MIRROR=mirrors.tuna.tsinghua.edu.cn` 选择官方镜像列表中的镜像，保留 Debian 路径、suite、断言与时限；未宣称默认端点恢复。探测、镜像来源及清理记录保留在 ignored 验收目录。
- 最终轮 `original-deploy-lock-runtime-2026-10-24T05-33-47-415Z-bdceab7b3f88`：SDK 原始 2 文件 19/19，CLI 原始 3 文件 14/14，全轮自然退出 0，前后 main/F2/clean 与依赖产物 hash 核对通过。真实 sshd 覆盖密码成功、错误密码、SCP、主机键拒绝、超时与进程清理；Windows PS5/PS7 及 Linux sh 上传入口均实际执行。
- 密码离线脚本使用最小 apply 标记证明认证、传输、解包与入口；完整业务容器发布由 CLI 的密钥认证验证，涵盖 fullstack 直接/重复/离线部署、增量服务、健康检查及失败回滚，并验证独立 API/admin/mobile。两类证据不合称密码方式的完整业务容器发布。
- 连接和中间件复用、按环境私有配置、父/叶优先级、隐藏输入及原值、密码变量排除、包内无密码均经定向及主线门禁验证。继续使用根 `hai.json`，不恢复 `_deploy.yml`，不改变 Core 普通运行配置加载契约。
- 三份实际部署浏览器结果均通过；C1 的 5 张桌面/390px 图已目检。C1 features 未启用 feedback；390px 审计图的中间列不完全可见，未单独验证横向滚动，保留 `DEPLOY-UI-01` 观察。反馈业务由独立管理台及默认/显式 fullstack 验收，最终完整脚手架原始命令第二轮 raw0、实际 11/11。
- 命令、截图、来源及 hash 统一见本地 ignored `tmp/feedback-acceptance/index.md`。实际部署目标是本次受控容器 SSH 主机，未向外部生产主机部署。本次收口仅更新任务文档，无运行时代码影响；固定设计 S3 和历史失败未修改。
