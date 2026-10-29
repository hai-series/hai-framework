# 验证、截图与适用边界

[维护与验收](README.md) · [配置手册](../configuration/README.md)

验证的目标是确认实际行为和恢复能力。配置解析、业务调用、浏览器操作、真实外部服务和部署分别提供不同证据；不能因为某一层通过就推断其他层都可用。

## 各类检查分别证明什么

| 检查 | 能证明 | 还不能证明 |
| --- | --- | --- |
| 类型、lint、公开入口与引用 | 调用形状、规则、导出和本地引用一致 | 实际业务成功、权限边界和网络可达 |
| 配置Schema | 字段、层级、必填与范围有效，默认被正确填充 | 服务地址/证书/凭据可用，模型或商户账号真实可调用 |
| 单元与故障注入 | 确定性逻辑、拒绝条件、错误保留、重试/清理边界 | 目标数据库/设备/供应商所有行为 |
| 本地集成 | SQLite、内存缓存、本地文件或受控HTTP的真实调用 | PostgreSQL/MySQL、Redis Cluster、S3和公网服务相同行为 |
| 浏览器E2E | 用户流程、布局/状态、键盘、三语与跨层衔接 | 全部主题、读屏软件、原生安装与生产多节点 |
| 部署脚本夹具 | 原始Shell、校验和、锁、文件状态、退出码和故障分支 | 真实业务容器、持久库恢复与生产公网入口 |
| 真实应用/目标服务验收 | 本轮指定环境中的业务和故障恢复 | 未选Provider、未测拓扑和所有将来版本 |

完整门禁结果以固定提交的CI和交付报告为准；未执行、被过滤、前置失败或结果unknown分别记录，不能统称通过。源码main、工作区版本和本地构建成功也不等于npm已发布。

## 在仓库复现配置和本地流程

先安装依赖并构建相关包，PowerShell使用pnpm.cmd。以下例子创建隔离数据，不读取生产凭据，不连接外部付费服务：

```sh
pnpm check:usage-examples
node docs/usage/examples/configuration-checks.mjs
node docs/usage/examples/configuration-effects.mjs
node docs/usage/examples/local-data.mjs
node docs/usage/examples/deployment-plan.mjs
pnpm check:skills
pnpm check:readme
```

check:usage-examples递归读取手册标注的完整YAML/JSON，检查输入字段没有被Zod静默忽略。configuration-checks调用公开Schema和Datapipe函数，对比默认、显式变化和非法输入；configuration-effects检查覆盖、分块与本地HTTP；local-data执行真实写读/回滚/清理；deployment-plan只读核对计划，不连接目标发布。

生产配置需在独立服务上验证证书、权限、并发、重启和恢复，不能将本地流程结果移作目标服务证据。

## 选择测试范围和运行前置

先分析差异、直接调用方和用户流程，再按typecheck→lint→适用build→test→相关E2E调度；明确要求完整验收时运行完整范围。失败先收集再按根因集中修复，复测失败及直接影响项，不拿旧dist绕过依赖构建失败。

生成模板另运行CLI scaffold门禁，包含新工程安装、类型、lint、构建、单元和浏览器。部署完整E2E使用`pnpm --filter @h-ai/deploy test:e2e`，由runner设置所需开关。浏览器使用项目runner隔离数据和证据，按配置准备真实LDAP等前置；关闭无关前置只能用于相应局部检查。

网站目录有变化时，保留根目录回归，再实际挂载子目录。SvelteKit验证页面/资源、注册登录、匿名API拒绝及刷新；前后端分离验证相对资源、公开运行配置、独立API前缀、hash导航和业务操作。另以真实Nginx核对多级目录、重定向和静态回退，以Linux部署流程验证增量目录一致性；浏览器加载成功不能代替部署恢复检查。步骤与截图见[网站子目录配置](../configuration/delivery.md#网站部署在子目录)。

框架仓库需要完整发布前验收时，可运行 `pnpm test:release-local`（PowerShell使用 `pnpm.cmd test:release-local`）。它按固定顺序执行锁文件安装、类型、lint、构建、单元、Chrome准备、E2E和CLI真实部署门禁，由Node统一传入CI环境，首个失败停止并保留退出码；该命令不会修改版本或发布npm。

测试拥有的临时工程、容器、镜像、进程和数据在teardown/finally清理，失败/取消同样处理。保留脱敏日志和失败证据到分析交付结束，不清理用户既有资源。

## 如何阅读本指南的截图

页面图来自2026-10-28至2026-10-29工作区的真实浏览器操作和隔离测试数据。Toast默认可读说明，排查图标按需展开编号；没有将堆栈、SQL或真实凭据放入图中。

截图中的应用名称、应用版本和反馈编号来自演示配置，用于说明操作，不是npm框架包发布版本。采用某个包版本时仍检查实际安装与registry记录。

![默认可读提示](../images/feedback-conflict.png)

![按需展开排查信息](../images/feedback-conflict-diagnostics.png)

配置/请求/测试结果图对真实结构化输出作可读排版，不冒充业务界面。图旁会说明调用命令、变化以及不能证明什么。例如下面的配置覆盖图来自同一YAML的三次实际加载：

![YAML与父叶覆盖的实际结果](../images/configuration-precedence.png)

部署恢复图使用真实Podman Linux下的原始生成Shell、tar、checksum、flock、文件与退出码，Compose/HTTP为确定性故障夹具；过滤项不计通过。长Mermaid图单独展示同次浏览器生成的SVG，未重绘内容。

原始日志与来源清单由维护人员在测试证据中保存，不随官网发布私有验收目录。长期使用的脱敏图位于本手册共享images目录。正文人工维护，脚本只校验例子、引用或采集实际结果。

## 上线前仍需按目标环境确认

### 网络、共享服务与多节点

核对真实数据库/缓存/对象与向量服务的TLS、最小权限、重启、故障切换及多节点并发。验证任务租约最终提交、节点时钟偏差、旧连接清理和unknown恢复；不要以单节点Mock或连接成功替代。

### 外部渠道与原生设备

模型、支付、通知和Webhook使用已授权测试账户、沙箱和真实接收端回执。Android/iOS/Desktop在对应OS构建签名新包并安装，检查设备权限、推送和安全存储；浏览器预览不够。

### 发布与业务数据恢复

在隔离目标演练首次全量、仅更新选中服务、坏包、健康失败、断连和回退；查result/current/实际容器。备份DB/卷/凭据，验证Schema兼容或独立恢复。容器配置回退不撤销已发外部动作，也不保证零停机。

### 界面与可访问性

按真实页面、语言、宽度、主题及读屏软件检查。加载、无数据、失败保留、重试、重复提交和键盘路径都要能继续操作；新页面不能只复用旧组件截图宣称已检查。
