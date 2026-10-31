# 配置环境与实现功能

[首次交付](README.md) · [上一步：创建](create.md) · [下一步：构建](build.md)

先写清本次功能的输入输出、角色权限、数据变化和验收条件，再选择模块。模板默认不是业务需求，尤其不能把示例管理员角色直接用于公开注册。

## 先确认配置来源

`_db.yml`等表达模块结构；地址、Provider和秘密按环境提供。公共基础用`.env`，环境公共差异用`.env`.dev/test/prod，私有覆盖用 `.env.local` 和 `.env.<mode>.local`；全部入口共用来源顺序。加载、覆盖、默认值和重新生效统一见[基础配置手册](../configuration/runtime.md)，不要为不同环境复制实现。

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

这是开发服务器选择运行配置，构建不按部署环境注入密钥。Node编译后使用项目`start`:test/`start`:prod；fullstack根`start`仅启动API，Web预览在对应客户端运行preview。

## 手工开发一条完整流程

fullstack先调整contract，再补服务层授权/数据，再接客户端和页面；SvelteKit沿用文件路由与服务端加载。模板hash路由自动发现新页面，不需维护中央表。返回HaiResult先判断success，事务回调、工厂、纯函数按各自契约。

从[业务开发章节](../development/README.md)选择所需能力，并到[配置手册](../configuration/README.md)检查参数影响。用户可见文本用三语翻译，所有warning/error交ToastContainer，失败保留输入，操作完成刷新相关数据。

## 使用AI协作

CLI复制完整Skills到应用.agents/`skills`。Skill是给编程助手的任务入口，不是Shell命令。

1. 在docs写业务需求/设计，列目标、角色、权限、页面/API、字段、状态、异常和验收。
2. 用[hai-spec-review](../../../packages/cli/templates/skills/hai-spec-review/SKILL.md)找缺项和歧义，固定已审查范围。
3. 用[hai-spec-implement](../../../packages/cli/templates/skills/hai-spec-implement/SKILL.md)维护任务、覆盖和文档基线，按依赖实施；小功能直接用hai-app-create/review/tests。
4. [hai-pr-review](../../../packages/cli/templates/skills/hai-pr-review/SKILL.md)核对实际diff、门禁和未验证项。已有授权范围内持续实施，外部发布/消息仍按用户授权。

需求变更先改业务文档，再按已验收基线比较差异、更新任务与实现。构建通过不等于业务验收，中断后从原任务清单继续。

## 验证并保留证据

按项目scripts执行typecheck→lint→build→test→相关E2E。UI实际操作，配置实际核对生效；低影响文案不要增加重复镜像测试。用例应验证权限、异常和恢复，临时资源在teardown/finally释放，日志/截图保留到分析交付结束；不清理用户既有资源。
