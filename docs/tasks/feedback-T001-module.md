# T001 · Feedback 全流程与复用交付

- 清单：[feedback-tasks](../feedback-tasks.md)。
- 状态：进行中；任务分支 `codex/feedback/t001-module`；主分支 `main`。
- 来源：[方案](../feedback-module-design.md) §1–12；目标文档提交 `88421e4c86c45d58269960aad59b4bf3ac8d3756`。
- 前置：无。复用 core/reldb/storage/reach、oRPC/serv、UI、CLI fullstack 模板；不新增通用 telemetry 模块。

## 第 1 轮 · 2026-10-24

- 起点：`0ea45edd`，工作区干净；规划信息独立提交后创建任务分支。
- 接受标准：空描述可提交；有界脱敏现场和截图保存；未授权访问拒绝；幂等/重启/失败恢复可观察；分页、处理/撤销、邮件及离线包可使用；模板生成可运行。
- Red：待记录，必须是公开行为缺失造成的失败，不把缺包/环境异常计作 Red。
- Green/重构：待执行。
- 验证计划：受影响包 typecheck/lint/build/test、check:skills、CLI scaffold gates、真实 DB/S3/SMTP 和 UI E2E；按分轮调度记录退出码、耗时及证据。
- 实现提交、合并、集成验证：尚未发生。
- 下一步：实现公共 schema 与行为测试，按不相交文件所有权并行推进。
