# @h-ai/tools 配置

<a id="h-aitools-文件配置"></a>

[English](tools.en.md) · [日本語](tools.ja.md)

[配置索引](README.md) · [功能说明](../function/tools.md) · [数据结构](../data/tools.md)

<a id="configuration-fields"></a>

## 配置入口

应用将参数直接传给 Tools 的工厂。工具定义通过 `tools.define()` 设置输入 Schema、业务函数和超时。注册器的 `authorize` 在 `tools.createRegistry()` 时指定。创建产物工具时，向 Node 入口传入可信主体和宿主的文件回调。 [调用选项](../function/tools.md#call-options) · [产物示例](../function/tools.md#artifact-example)

应用可按业务需要从自己的配置中读取工具选项，修改后按应用的加载方式更新工厂。持久队列的启用范围、数据库和容器映射由宿主装配。

<a id="local-service"></a>
<a id="job-environments"></a>

通过 [Tools Runner 配置](tools-runner.md) 设置持久服务的启用范围及容器环境。
