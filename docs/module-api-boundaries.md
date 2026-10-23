# 模块公开入口维护

公开边界由 `package.json.exports`、入口转发和构建声明共同决定。[实际 API 清单](module-api-inventory.md)覆盖 21 个包；完整 JSON 记录每个条件、子路径、导出名称和运行时/类型种类。普通源文件为跨文件复用而 export，不代表使用方可以跨包导入该文件。

维护公开入口时先确认用途。配置、业务类型、公开操作与实际扩展点保留；内置适配器、Repository 状态和工厂依赖留在实现目录。`PaymentProvider` 通过 registerProvider/getProvider 扩展支付渠道，`AIStoreProvider` 通过初始化注入存储，二者是公共契约。cache/storage/reldb/reach 的固定后端 Provider、LLM 内部适配器/工厂依赖、Context 组装依赖及会话存储键不属于包 API。删除没有实现的入口，不为它补造功能。

入口只聚合必要契约。允许选择性导出、类型转发、明确别名、Svelte 默认组件转发及 client/server 分隔。`export *` 适用于被转发源文件的全部导出都确为公共 API 的情况。Kit 的运行时方法通过 kit 命名空间及明确子路径使用；UI 只开放清单中的 13 个组件 barrel，保留样式资产子路径，不开放任意组件实现或内部存储 helper。Kit 没有 vite 插件；Vite 接入使用 `@sveltejs/kit/vite`，UI 开发预打包辅助使用真实的 `@h-ai/ui/vite`。

Node 与浏览器条件分别指向真实 JS 和声明文件，browser 分支在 Node types 前。IAM 浏览器入口只提供配置、错误与类型；AI 浏览器入口提供配置、协议、领域类型及 HTTP 客户端；服务端实例、构造器和工厂留在 Node。core 浏览器保留配置占位接口，文件配置方法按原契约返回 SERVICE_UNAVAILABLE。不能仅依据源码 type-only 标记判断发布声明：声明打包器可能把星号类型转发提升为可调用值，实际输出须用正负类型消费验证；必要时改为明确的类型列表。

更改公开 API 后按依赖顺序构建受影响包，再执行：

```sh
pnpm generate:api
pnpm check:api
pnpm test:api
```

`generate:api` 从实际构建产物生成快照，缺失产物会失败；`check:api` 验证快照与产物一致。`test:api` 使用真实自引用包解析检查 21 包声明、Node/Browser 条件及内部导出的拒绝，随后隔离进程导入各包，完整打包浏览器入口并拒绝 Node 内建模块。UI 经真实 Svelte 编译器转换并执行 SSR 导入，浏览器组件及 Rune 模块也完整编译；CLI 以独立进程运行 help/version。SvelteKit 的 `$app/navigation`、`$app/state` 是宿主提供的虚拟模块，不是 Node polyfill；CSS 只在此 JavaScript 图验证中省略输出，组件视觉行为仍需各自测试。

API 冒烟不初始化服务、连接外部后端、发送支付或消息，也不替代功能回归。更新 Schema 或扩展协议仍须同步调用方、三语 README、skills、LLMS、配置和对应验证。生成应用仅按安装版本的公开入口消费；仓库维护脚本不复制到应用。
