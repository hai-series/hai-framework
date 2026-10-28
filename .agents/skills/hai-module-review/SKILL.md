---
name: hai-module-review
description: "审查 hai-framework packages 模块的公共契约、生命周期、性能与安全。"
---

# 模块审查

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 审查 hai-framework packages 模块的公共契约、生命周期、性能与安全 |
| 适用场景 | 用户要求框架模块审查或修复评估 |
| 输入 | 明确模块范围、源码入口、调用方、测试和文档 |
| 输出 | 带位置、证据、优先级、影响和验收条件的问题清单 |
| 限制 | 只读审查不自动修改；按模块类型判断 HaiResult/throw 例外，不把内部实现约定强加给调用方。 |

## 使用路径

问题表达和交付前同步检查遵循[沟通与同步维护](../../../packages/cli/templates/skills/hai-app-create/collaboration.md)；每项先讲场景、影响和改法，再附代码与验证依据。

1. 用 rg 确认 package.exports 条件/子路径、入口选择、配置、真实消费者、测试和文档；按生命周期、纯函数、工厂或组件区分契约。构建后用 generate:api/check:api/test:api 核实实际产物、声明、导入和浏览器隔离，不把源码 export 当作已发布 API。
2. 沿调用链核对输入、错误、状态、资源清理和并发，依据当前代码和公开类型判断，不套用统一 init/close。共享数据库租约须核验最终 SQL 的存储端执行时钟，增加节点时钟偏差和真实行锁跨期限证据；本机 Date.now、先查时间或续租成功不能证明最终授权有效。
3. 使用相邻审查表定位风险；内部异常、SQL 片段、缓存和串行操作按实际边界判断，避免机械误报。 声明示例需用 fenced ts/svelte 并对实际入口类型编译；内部上下文不能伪装公开 API，覆盖检查不代替行为验收。
4. 已授权修复时同步实现、调用方、测试、README 与 skills。按 [工作规范](../../instructions/workspace.md#验证与交付) 分轮收集适用门禁，普通失败先记录，归并问题后集中修复、再验证。
5. 报告位置、优先级、证据、影响、验收与未验证项，不以覆盖率或静态检查替代实际行为。

## 按需参考

- [详细审查规则](review.md)
- [工作规范](../../instructions/workspace.md)
- [模块规范](../../instructions/module-conventions.md)
- [测试规范](../../instructions/test-conventions.md)
