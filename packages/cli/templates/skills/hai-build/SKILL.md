---
name: hai-build
description: "定位 hai 应用架构、模块依赖、初始化顺序、构建模式和对应技能。"
---

# hai-build

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 定位 hai 应用架构、模块依赖、初始化顺序、构建模式和对应技能 |
| 适用场景 | 识别应用架构、跨模块依赖或构建入口 |
| 输入 | README、package.json、应用类型、现有 config 与目标 |
| 输出 | 适用技能、最小修改路径和按范围选择的验证命令 |
| 限制 | 先识别 API workspace、SvelteKit、SPA 或原生 App；不强行转换架构，不给纯函数模块添加生命周期。 |

## 使用路径

- 先读当前 package.json 和 README，识别 SvelteKit / API workspace / Vite SPA / 原生 App，按实际 scripts 验证。
- core → reldb/cache 等基础依赖 → iam/ai 等业务模块；逐步检查初始化，失败清理已创建资源。
- Node 最低版本、Turbo 缓存 env/globalDependencies、build:clean 与框架构建模板保持同步。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- 适用场景
- 项目架构
- 技能导航
- TDD 开发工作流（强制）
- 统一编码规范
- 标准工作流
