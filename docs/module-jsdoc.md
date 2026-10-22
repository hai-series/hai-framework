# 模块 JSDoc 与示例验证

公开函数、常量、工厂、类以及全部 `type` / `interface` 都应紧邻声明编写中文 JSDoc。说明用途、状态所有者、默认值和单位；函数说明参数、返回值及实际失败方式。有生命周期时展示初始化结果检查和关闭；纯函数、工厂、Core、serv 和 kit 按各自真实契约使用。关键并发、授权、原子提交、外部效果与清理逻辑说明约束及失败边界，不用注释重复代码。

每个声明至少有一个 fenced `ts` / `svelte` 的 `@example`。公开用法从真实 package exports 导入并包含所需数据；业务操作先检查 `HaiResult.success`。示例不能靠 `any`、空对象断言、虚构 API 或未声明的业务变量通过。类型示例应展示有含义的数据或消费方式。

```ts
import { ok, type HaiResult } from '@h-ai/core'

const result: HaiResult<{ id: string }> = ok({ id: 'order-1' })
const label = result.success ? result.data.id : result.error.message
```

内部工厂或结构不能伪造包公开入口。它们的示例以 `@example 模块内部上下文` 标明，在声明的词法作用域内说明实际参数、状态或调用；不嵌入 `import` / `export`。无法提供真实调用前提时，可展示接收该类型的完整函数及其实际字段消费。Svelte `<script>` 内的注释使用 TypeScript 组件属性或 `mount` 示例，避免示例中的结束标签提前关闭宿主脚本。

仓库维护命令：

```sh
pnpm check:jsdoc
node scripts/check-module-jsdoc.mjs --package core
node scripts/check-module-jsdoc.mjs --package core --coverage-only
```

校验扫描自有运行时代码、Svelte 脚本、公开声明和全部内部结构；生成的 Paraglide 与构建声明不重复计入。公开示例独立使用真实发布声明和条件解析；内部示例在内存中注入原词法作用域。Svelte 示例通过实际编译器转换后类型检查。编译使用 `noEmit`，不执行示例、不写源码旁文件、不连接后端。门禁验证类型和可消费性，不能替代对注释语义、关键逻辑、真实 Provider 或 UI 行为的人工审查和行为测试。

先构建受影响包，再校验其公开示例；缺失构建不能用旧声明补成通过。修改示例不得扩大包导出面，公开入口变化继续执行 [API 边界验证](module-api-boundaries.md)。这些仓库脚本不复制到生成应用；应用示例以安装版本公开入口和自身类型检查为准。
