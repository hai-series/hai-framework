# @h-ai/tools-runner 配置

[English](tools-runner.en.md) · [日本語](tools-runner.ja.md)

[模块 README](../../../packages/tools-runner/README.md) · [数据归属](../data/tools-runner.md) · [功能说明](../function/tools-runner.md)

<a id="configuration-fields"></a>

## 配置入口

Tools Runner 从宿主代码读取工厂参数。数据库、节点与容器镜像由宿主配置 RelDB 和 Runner。应用可以把启用范围放进自己的配置文件，再在初始化服务时传给工厂。

| 要设置的内容 | 设置位置 | 谁使用它 |
| --- | --- | --- |
| 当前服务开放哪些工具，谁可以执行 | 服务端代码中的 `toolsRunner.createService(...)`。应用提供 `createTools`、`enabled` 和 `authorize` | Tools 按启用范围生成目录，并在提交和执行时检查权限 |
| 任务存在哪，哪个进程执行 | 应用启动时先配置 RelDB，再配置 Runner 的 `nodeId`、执行角色和运行容量 | RelDB 提供数据库连接，Runner 保存、领取和执行任务 |
| 容器镜像、网络和资源上限 | Runner 的 `environments`。应用把环境 ID 绑定到对应工具 | Runner 提供容器，工具使用宿主授权的文件接口 |

应用从认证结果取得 `scope`，再把它和工具输入分开传给服务。例如 `{ tenantId: 'demo', userId: 'alice' }` 表示 demo 租户下的 alice。目录展示由 `createTools` 和 `enabled` 决定。如果目录要按用户显示，应用在这两处筛选。实际执行权限由 `authorize` 检查，文件权限由宿主在读写时核验。参数和默认值见[调用选项](../function/tools.md#call-options)和[服务工厂](../function/tools-runner.md#services)。

<a id="local-service"></a>

## 在本机运行求和服务

1. 在启动代码中，先用 RelDB 打开本机 SQLite 数据库，再启动 Runner。为 Runner 提供 `nodeId` 并使用默认执行角色，即可在当前进程处理任务。求和函数直接在 Node 中运行，只需要这两项依赖提供持久化和执行调度。[RelDB 连接配置](reldb.md#configuration-fields) · [Runner 节点配置](runner.md#configuration-fields)
2. 在应用代码中创建 ID 为 `sum-demo` 的 Tools 服务，传入已启动的 Runner。把两个数字相加的 `sum` 加入 `createTools` 返回的工具集合，并设置 `enabled: { tools: ['sum'] }`。从可信上下文判断 alice 是否有权求和。目录中出现 `sum` 后，提交 `{ a: 2, b: 3 }` 并查询回执，直到看到结果 `5`。[求和服务完整示例](../function/tools-runner.md#service-example) · [示例回执及结果](../data/tools-runner.md#example-data)
3. 应用退出时先关闭 Tools 服务以注销处理器，再关闭 Runner，最后释放 RelDB 连接。保持数据库连接，直到 Runner 完成关闭。[Runner 关闭说明](../function/runner.md#nodes)

如果只在当前进程立即执行函数，使用 `tools.createRegistry()` 即可。独立注册器随调用方创建，无需启动 Runner 或配置持久任务。[轻量注册器](../function/tools.md#registry)

<a id="job-environments"></a>

## 添加需要容器的作业

例如，要从 ZIP 构建 HTML 预览，在 Runner 配置里登记一个名为 `preview-local` 的环境，配置固定镜像、`preview.build` 能力、资源限制和 `offline` 网络策略。应用在 `toolsRunner.createJobTools(...)` 中填入 `environments: { preview: 'preview-local' }`，再启用 `preview_build`。目录出现该工具后，用宿主已授权的 ZIP 引用提交一次作业，查看成功产物。部署时应以实际镜像、权限和网络配置验证。[Runner 容器配置](runner.md#configuration-fields) · [Tools 作业环境和工厂](../function/tools-runner.md#job-tools) · [作业镜像与资源示例](../../../packages/tools/jobs/README.md#配置)

网页截图和采集还需要内部网络及部署控制的 `browserProxy`。由宿主把代理设置传给作业工厂。浏览器出网要求和代理值格式见[作业环境选项](../function/tools-runner.md#job-tools)。
