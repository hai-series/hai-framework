# hai-framework 使用指南

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

从当前要完成的工作开始阅读。第一次使用先[认识框架](overview/framework.md)，再[准备环境](overview/environment.md)、[创建并运行](getting-started/create.md)；已有应用从[工作路线](overview/reading-paths.md)找到合适顺序。

## 文档章节

1. **[认识框架与选择路线](overview/README.md)**：能力边界、应用结构、六类读者路线和环境准备。
2. **[从创建到首次交付](getting-started/README.md)**：创建运行 → 配置开发 → 构建产物 → 发布与升级。
3. **[按业务能力开发](development/README.md)**：接口/数据 → 身份/页面 → AI/支付/原生集成。
4. **[按领域管理配置](configuration/README.md)**：八个领域的用途、入口、默认值、取值影响、完整例子和生效方式。
5. **[发布与日常运行](operations/README.md)**：全量/增量、回滚条件、反馈处理和故障排查。
6. **[维护、安全与验收](governance/README.md)**：公共变更同步、安全边界和实际验证证据。

## 不同职责如何开始

初次使用按第二章顺序运行一个应用；开发人员从第三章接通一条业务流程；配置管理先读第四章的来源与覆盖；运维从第五章核对目标和恢复条件；框架维护与安全审查从第六章查实现和证据。[六条阅读路线](overview/reading-paths.md)给出每条的完成目标和先后顺序。

同一配置只在领域手册维护，操作指南链接参数说明；官网直接读取本目录人工Markdown和`navigation.json`。详细领域正文目前中文，英语/日语保留[完整创建流程](getting-started/README.md)及对应语言入口。

## 版本、示例与验证

以实际安装版本的公开API为准。Beta使用npm beta标签或精确版本，先确认registry；源码main与工作区版本不等于已发布。示例、截图和外部环境的适用范围见[验证说明](governance/verification.md)。

正文人工编写，校验脚本不生成说明。框架仓库可运行`pnpm check:usage-examples`检查配置例子，生成应用按自己的scripts验证。

<a id="使用入门"></a>
<a id="1-准备开发环境"></a>
<a id="2-创建项目"></a>
<a id="3-配置环境再开始开发"></a>
<a id="4-编译源码与打包产物"></a>
<a id="5-把构建产物部署到环境"></a>
<a id="6-更新框架保留自己的应用"></a>

旧单页章节已拆分，原链接到达此处后可从[首次交付](getting-started/README.md)或[部署运行](operations/README.md)继续。
