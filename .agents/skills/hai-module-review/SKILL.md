---
name: hai-module-review
description: "审查 hai-framework 模块的公共契约、生命周期、性能和安全，也可单独审查模块 README、使用手册与源码注释。"
---

# 模块审查

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 审查 hai-framework packages 模块的公共契约、生命周期、性能、安全与使用文档 |
| 适用场景 | 框架模块审查、修复评估或仅审查模块文档 |
| 输入 | 明确模块范围、源码入口、调用方、测试和文档 |
| 输出 | 带位置、证据、优先级、影响和验收条件的问题清单 |
| 限制 | 只读审查不自动修改；按模块类型判断 HaiResult/throw 例外，不把内部实现约定强加给调用方。 |

## 文档审查

只审查文档时，按[模块文档规范](../../instructions/module-documentation.md)和[核验步骤](review.md#模块文档审查)逐页走完整个读者任务。每个发现写清位置、读者会在哪里卡住、依据和如何验证。审查实现时用同一套标准核对受影响文档。

## 实现审查

按 [hai-change-plan](../hai-change-plan/SKILL.md) 核对实际差异及人工确认依据。修复若触发确认要求，取得用户对具体方案与影响的确认后再改。审查时逐项指出缺失的确认、超出获准范围的改动及待同步文档。

问题表达遵循[审查报告与变更影响评估](../../../packages/cli/templates/skills/hai-app-create/collaboration.md#审查报告与变更影响评估)。每项先讲读者看到的影响，再用代码和示例数据对照修改前后，并标明验证依据。

1. 用 rg 确认 package.exports 条件/子路径、入口选择、配置、真实消费者、测试和文档；按生命周期、纯函数、工厂或组件区分契约。构建后用 generate:api/check:api/test:api 核实实际产物、声明、导入和浏览器隔离，不把源码 export 当作已发布 API。
2. 沿调用链核对输入、错误、状态、资源清理和并发，依据当前代码和公开类型判断，不套用统一 init/close。共享数据库租约须核验最终 SQL 的存储端执行时钟，增加节点时钟偏差和真实行锁跨期限证据；本机 Date.now、先查时间或续租成功不能证明最终授权有效。
3. 使用相邻审查表定位风险；内部异常、SQL 片段、缓存和串行操作按实际边界判断，避免机械误报。运行功能按 `<模块名>.xx` 进入，包含工厂、多实例、纯工具、浏览器条件入口和全部公开子路径；检查重导出和箭头函数，不以命名或已有 export 放行。核对[入口约定](../../instructions/module-conventions.md#模块功能入口)，沿 [文档审查步骤](review.md#模块文档审查)复核受影响页面和注释。
4. 已授权修复时按影响同步实现、调用方、测试、文档与 skills。按 [工作规范](../../instructions/workspace.md#验证与交付) 分轮收集适用门禁，普通失败先记录，归并问题后集中修复、再验证。
5. 报告位置、优先级、证据、影响、验收与未验证项，不以覆盖率或静态检查替代实际行为。

## 按需参考

- [详细审查规则](review.md)
- [日志与错误诊断](../../../packages/cli/templates/skills/hai-app-create/logging.md)
- [工作规范](../../instructions/workspace.md)
- [模块规范](../../instructions/module-conventions.md)
- [测试规范](../../instructions/test-conventions.md)
