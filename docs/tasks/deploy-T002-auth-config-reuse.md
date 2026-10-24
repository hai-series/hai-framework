# T002 · 部署连接复用与 SSH 密码登录

- 清单：[deploy-tasks](../deploy-tasks.md)。
- 状态：进行中；主分支 `main`，实施复用 `codex/feedback/isolated-delivery` 的最新主线。
- 需求：[独立方案](../deploy-connection-reuse-design.md) 全文；规划提交后固定 S3，B/H 未建立。
- 前置：`33b6fc85a7dc9345a0cd98d1eda2de730061c23c` 已是 main 祖先；根版本提交 `fe2ac6c1c83f68cbfdbc40fcb5e320993bef5b0e` 保持 alpha.69。

## 现状与范围

已有完整 provider、离线 target 和中间件值可以复用；目前仅 key/agent，缺少密码方式。已确认缺省 ssh 节点的叶变量不生效，旧跨环境 `.env.local` provider 会压过明确环境目标。修复配置来源与按环境记忆，不恢复旧部署 YAML 或混用服务运行配置。

只读分析保存在 ignored `tmp/feedback-acceptance/` 的配置复用、SSH 密码和构建元数据报告；报告不是通过的新功能验收。私有环境值和密钥内容未读取或提交。

## 实施与验证

待集中实现 SDK、环境解析、CLI、跨平台交付脚本、三语文档/skills 和真实 SSH 回归。按任务分开提交，再合入 main 验收；实际提交、有效 Red/Green、退出码、源码 SHA 和未验证边界随后记录。
