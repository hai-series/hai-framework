# T002 · 部署连接复用与 SSH 密码登录

- 清单：[deploy-tasks](../deploy-tasks.md)。
- 状态：进行中；主分支 `main`，实施复用 `codex/feedback/isolated-delivery` 的最新主线。
- 需求：[独立方案](../deploy-connection-reuse-design.md) 全文；固定 S3=`f63056ae75af7eb7c8cb7483b9f42b98f57a6367`，B/H 未建立。
- 前置：`33b6fc85a7dc9345a0cd98d1eda2de730061c23c` 已是 main 祖先；根版本提交 `fe2ac6c1c83f68cbfdbc40fcb5e320993bef5b0e` 保持 alpha.69。

## 现状与范围

已有完整 provider、离线 target 和中间件值可以复用；目前仅 key/agent，缺少密码方式。已确认缺省 ssh 节点的叶变量不生效，旧跨环境 `.env.local` provider 会压过明确环境目标。修复配置来源与按环境记忆，不恢复旧部署 YAML 或混用服务运行配置。

只读分析保存在 ignored `tmp/feedback-acceptance/` 的配置复用、SSH 密码和构建元数据报告；报告不是通过的新功能验收。私有环境值和密钥内容未读取或提交。

## 实施与验证

SDK、环境解析、CLI、跨平台交付脚本、三语文档/skills 已集中实现。环境层有效 Red 为 10 失败/14 通过，修复后 25 项通过；SSH 参数与密码 22 项、离线上传入口 40 项通过。CLI 隐藏密码/原值/复用的有效 Red 后，引导 31 项通过。

独立审查发现自定义密码变量引用与裸 HAI_DEPLOY 父对象可能进入应用环境，均以实际生成和解包环境文件记录有效 Red，再按配置来源排除；同值普通应用配置保留。另收集到 Windows PowerShell 7 密码入口调用错误分支，新增有效 Red 后已修复。最终以 main 的真实 SSH、错误密码、SCP、主机指纹拒绝、超时及 PS5/PS7/sh 入口为准；当前不把 mock/静态通过称为真实连接验收。

按任务分开提交，再合入原 main 验收；实际提交、最终退出码、源码 SHA 和未验证边界随后记录，状态保持进行中。
