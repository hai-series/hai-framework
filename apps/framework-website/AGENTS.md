# 官网开发入口

本应用属于 hai-framework 工作区，共享规范与 Skills 直接读取根目录 [AGENTS.md](../../AGENTS.md)，再按应用、Svelte、UI 与测试任务选择对应入口。

先读 [README.md](README.md)，修改官网正文前定位人工维护的 [docs/usage](../../docs/usage/README.md) 与 [navigation.json](../../docs/usage/navigation.json)。不复制正文，不以脚本生成另一份使用说明。

此应用固定预渲染为 GitHub Pages 静态站，基础路径为 `/hai-framework/`，没有业务后端。新增模块、环境配置或端点时先核查是否仍适合静态托管。文档链接、图片、锚点、搜索、手机布局及语言/主题切换需用真实静态产物验证；执行命令与产物说明见 README。
