# 分环境配置

统一命名、逐项变量说明与约束、加载优先级和跨环境 Provider 切换见 [分环境配置手册](../packages/cli/templates/shared/environment-configuration.md)。该手册也随 CLI 复制到生成项目的 docs/environment-configuration.md。各 apps 示例的完整变量清单位于各自 .env.example。

## 维护配置清单

修改模块公开 Schema、YAML 或直接读取的环境变量后，先构建相关模块，再执行 `pnpm generate:env`，同步根 `.env.example`、CLI 模块清单和各示例应用 `.env.example`。随后用 `pnpm check:env` 检查生成结果是否过期；脚本只读取公开源码和示例，不读取 `.env.local`，也不覆盖公共基础及环境文件中的项目取值。

生成项目的 YAML 引用和逐项说明由 CLI 共用转换逻辑生成。新增变量须同时维护字段用途、类型、枚举、单位、范围与启用条件；数组索引和动态键按手册扩展，父级对象可整体覆盖。环境文件的加载与 Provider 切换仍须经过模块 Schema 和相应运行测试。

## 验收记录

本次配置、模板路由和公共布局的门禁结果与 12 张截图见 [2026-10-21 验收记录](verification/2026-10-21-environment-and-scaffold/README.md)。
