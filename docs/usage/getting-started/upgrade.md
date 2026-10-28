# 升级框架与验证迁移

[首次交付](README.md) · [维护与验收](../governance/README.md)

升级应同时迁移依赖、公开调用、配置和完整Skills。源码main或本地缓存不等于npm已发布版本，先查询实际registry与全部所用包的目标版本，再固定精确版本。

## 先比较，再实施

在应用目录使用[hai-framework-sync](../../../packages/cli/templates/skills/hai-framework-sync/SKILL.md)，例如：

> 核对当前依赖和目标已发布版本，说明累计变更及需要选择的事项，再迁移依赖、调用、配置和Skills，保留项目私有规则并完成验证。

也可以只要求比较。该流程核对registry/dist-tag、engines、catalog/lock/安装状态和真实tarball；发布不齐或网络失败明确报告，不把缓存称最新。

## 保留应用自定义

hai init可以补缺失AI入口和Skills，但不覆盖老文件，也不是升级命令。已有Skills按旧模板、应用自定义和新模板合并，不整目录替换私人业务规则。需求文档与任务基线也保留。

## 检查数据和会话兼容

升级前备份数据库、会话缓存、对象/卷及受管凭据。模块迁移使用自己的版本步骤，MySQL DDL需可重入；不支持把低版本代码直接对不兼容新Schema运行。容器回退不自动恢复业务数据，见[回滚条件](../configuration/delivery.md#失败恢复与发布后回滚)。

## 重新验收交付

先typecheck/lint/build/test，再对认证、数据、页面和受影响流程做E2E。之后重建镜像/安装包并部署，核对实际版本。只改依赖版本、只通过构建或只更新Skills都不代表升级完成。
