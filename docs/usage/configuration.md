# 配置加载、默认值与模块组合

配置说明已合并到[应用配置手册](configuration/README.md)。从任务选择领域，集中查看配置入口、真实默认条件、取值影响、完整示例和实际结果图。

## 选择正确的配置入口

见[配置从哪里来](configuration/runtime.md#配置从哪里来)。运行模块YAML、CLI的hai.json和组件/客户端参数分别由各自宿主消费。

## 基础配置与日志格式

见[应用信息与语言](configuration/runtime.md#应用信息与语言)及[日志采集与隐私](configuration/runtime.md#日志采集与隐私)。整个logging对象省略与传入空对象的默认条件不同。

## 覆盖对象与叶子

见[环境覆盖及真实对比](configuration/runtime.md#配置从哪里来)。Core父对象覆盖与部署分来源合并分别说明，避免把两套规则混用。

## 依赖与关闭

见[保存以后如何生效](configuration/runtime.md#保存以后如何生效)。配置缓存更新不表示连接池/会话热更新；按真实生命周期重新装配并检查结果。
