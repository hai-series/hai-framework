# hai-framework 使用指南

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

从当前要完成的工作开始阅读。第一次使用先[认识框架](overview/framework.md)，再[准备环境](overview/environment.md)、[创建并运行](getting-started/create.md)；已有应用从[工作路线](overview/reading-paths.md)找到合适顺序。

第一次接入时按第 1–3 章走完一条流程。遇到具体字段、调用方式或数据保存问题时，再查对应模块的[配置](configuration/README.md#按模块查配置)、[功能 API](function/README.md)和[数据结构](data/README.md)。模块 README 指向同一份参考文档。

## 文档章节

1. **[认识框架与选择路线](overview/README.md)**：能力边界、应用结构、六类读者路线和环境准备。
2. **[从创建到首次交付](getting-started/README.md)**：创建运行 → 配置开发 → 构建产物 → 发布与升级。
3. **[按业务能力开发](development/README.md)**：接口/数据 → 身份/页面 → AI/支付/原生集成。
4. **[按领域管理配置](configuration/README.md)**：八个领域的用途、入口、默认值、取值影响、完整例子和生效方式。
5. **[发布与日常运行](operations/README.md)**：全量/增量、回滚条件、反馈处理和故障排查。
6. **[维护、安全与验收](governance/README.md)**：公共变更同步、安全边界和实际验证证据。
7. **[模块数据结构](data/README.md)**。按包查表、字段、缓存键、有效期和清理责任。
8. **[模块功能说明](function/README.md)**。按包查公开入口、示例、返回值和注意事项。

## 不同职责如何开始

初次使用按第二章顺序运行一个应用；开发人员从第三章接通一条业务流程；配置管理先读第四章的来源与覆盖；运维从第五章核对目标和恢复条件；框架维护与安全审查从第六章查实现和证据。[六条阅读路线](overview/reading-paths.md)给出每条的完成目标和先后顺序。

GitHub Pages 从本目录的 Markdown 生成正文，从 `navigation.json` 读取侧栏。英文和日文可从相同章节进入；尚未翻译的页面会显示中文正文与原文链接。

## 版本、示例与验证

以实际安装版本的公开API为准。Beta使用npm beta标签或精确版本，先确认registry；源码main与工作区版本不等于已发布。示例、截图和外部环境的适用范围见[验证说明](governance/verification.md)。

正文人工编写，校验脚本不生成说明。框架仓库可运行`pnpm check:usage-examples`检查配置例子，生成应用按自己的scripts验证。
