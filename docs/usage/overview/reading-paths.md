# 按你的工作选择阅读顺序

[认识框架](README.md) · [文档首页](../README.md)

按你现在要完成的工作选一条路线。每条都有明确完成目标；不用一次读完所有模块，也不按角色重复维护配置和步骤。

## 初次使用：先运行，再理解一条完整流程

**完成目标：** 确认CLI版本、运行一个应用，用测试账号完成登录和一次成功/失败操作。

1. [准备环境](environment.md)，区分本机开发与生产依赖。
2. [创建并首次运行](../getting-started/create.md)，选择模板与版本渠道。
3. [配置环境与开发](../getting-started/develop.md)，只改一个可观察设置。
4. [页面和交互](../development/ui.md)，检查输入、失败保留与提示。
5. 有交付需求再读[构建](../getting-started/build.md)与[部署](../operations/deployment.md)。

## 开发人员：把业务能力接成可恢复流程

**完成目标：** 一条功能具备契约、服务端权限、数据结果、页面状态和相关测试。

1. 从[开发章节](../development/README.md)选择本次能力；多端先读[接口授权](../development/frontend-backend.md)。
2. 按需接[数据和事务](../development/data.md)、[身份](../development/authentication.md)或[AI](../development/ai.md)。
3. 配置值统一查[配置手册](../configuration/README.md)，页面用[公共组件](../development/ui.md)。
4. 按[验证职责](../governance/verification.md)选相关单元/集成/E2E，检查拒绝和恢复。

## 配置管理人员：说明哪个值在什么环境生效

**完成目标：** 能追踪配置来源，区分默认/模板/建议值，确认密钥隔离并验证变化。

1. [基础和覆盖顺序](../configuration/runtime.md)，确认谁加载、谁消费。
2. [数据与共享状态](../configuration/data.md)和[身份策略](../configuration/identity.md)，检查实际依赖和用户影响。
3. 按领域阅读HTTP、AI或运行配置；每次变更照章执行例子与确认步骤。
4. [部署环境与秘密](../configuration/delivery.md#环境和秘密的来源)，核对环境私有层、受管凭据和备份。

## 运维部署人员：发布可定位，失败能判断和恢复

**完成目标：** 核对制品/环境/基线，完成全量或增量，并根据真实结果执行恢复。

1. [构建交付物](../getting-started/build.md)，固定版本、构建ID、架构和校验和。
2. [部署配置](../configuration/delivery.md)确认生产条件、停机窗口、凭据和数据备份。
3. [部署操作](../operations/deployment.md)，先计划，再发布，再验用户流程。
4. [失败恢复与发布后回滚](../configuration/delivery.md#失败恢复与发布后回滚)，区分远端unknown与已complete但公网复核失败。
5. [反馈与排错](../operations/feedback.md)，把追踪编号关联到日志和业务状态。

## 框架维护人员：修改一次，所有使用入口同步

**完成目标：** 公共契约有依据，调用方、生成应用、配置手册与测试一起更新。

1. [维护流程](../governance/framework-maintenance.md)识别模块类型和变更影响。
2. 在相关操作/配置章节核对当前承诺，再检查实现、公开导出和模板。
3. [安全审查](../governance/security-review.md)检查权限、隐私和失败恢复。
4. [验证与证据](../governance/verification.md)收集实际门禁，更新文档和截图；发布后核对npm实际版本。

## 安全审查人员：沿请求、凭据和副作用查边界

**完成目标：** 找出可证明的风险和触发条件，给出可验证的修复与剩余环境限制。

1. [安全审查流程](../governance/security-review.md)固定场景和信任边界。
2. [身份](../configuration/identity.md)与[HTTP/传输](../configuration/http.md)核对服务端执行点。
3. [数据](../configuration/data.md)和[运行任务](../configuration/operations.md)核对持久化、隐私、幂等和unknown。
4. [部署恢复](../configuration/delivery.md)检查凭据/卷/迁移与真实回滚条件。
5. 查[验证边界](../governance/verification.md)，把未验证的目标服务与已确认漏洞分开报告。
