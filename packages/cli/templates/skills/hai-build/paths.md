# 网站挂载目录

部署地址含`/yyy/`等目录时，先识别SvelteKit与Vite，再检查资源、路由、API及服务器守卫。配置说明与当前运行截图见[网站构建与部署手册](https://hai-series.github.io/hai-framework/docs/configuration/delivery/)。

## SvelteKit

启用 transport 时，服务端 `crypto.transport.basePath` 和浏览器 `installBrowserTransport(config, { crypto, basePath: base })` 均取 `$app/paths.base`；独立 Kit client 同步 `transport.basePath`。默认空字符串为域名根目录，不在 YAML 另维护一份挂载目录。交换/排除/容量路径仍用完整路径。目录验收须检查带前缀 API 的加密标记和缺协议拒绝，页面、登录成功不能替代协议验证。

- admin、h5和website从构建进程的PUBLIC_BASE_PATH设置kit.paths.base，默认空字符串。根目录保持空，子目录如`/yyy`无末尾斜杠；构建不读取私有dotenv中的这个控制值。
- 组件链接用`$app/paths`的resolve；认证动作使用带base的api/auth地址。守卫匹配实际URL，protectedPaths/publicPaths/loginUrl都应带base。新模板已接好，旧应用与自定义路由须同步核对。
- 重新构建后，外部网关保留此前缀交给Node服务。开发、编译和预览使用同一目录值；生产还要满足共享后端、密钥与公开源配置。
- 实际验证匿名私有API返回401、页面跳转到该目录登录、注册/登录、业务深链刷新、JS/CSS/图标和当前导航标记。

## Vite与前后端分离

- 模板默认base为`./`，运行配置和入口脚本使用相对引用，业务页面使用hash导航。直接挂载根目录静态服务时，外部网关剥离挂载目录，并将无末尾斜杠的入口规范到`/yyy/`。
- Web及独立mobile浏览器端可通过PUBLIC_BASE_PATH显式固定基址；Vite开发/预览的运行配置插件跟随该base。引入history路由时同时处理basename和服务器回退。
- API地址独立于网站目录。直接托管Web时核对显式baseUrl、runtime-config.js、构建PUBLIC_API_BASE及当前origin的生效顺序；公开配置不含密钥。SDK托管Fullstack时，同源API由_serv.http.apiPrefix生成，额外网关也要转发此前缀。
- 原生App/Desktop使用相对资源，原生构建目标不接受网站PUBLIC_BASE_PATH；API仍按设备宿主配置。

## SDK容器交付

- `PUBLIC_BASE_PATH=/yyy`用于compile或docker网站构建；HAI_BUILD_STATIC仍只用于website的compile静态预渲染。
- 根目录制品沿用格式4，非根目录制品使用格式5并记录webBasePath。使用支持格式5的CLI/Deploy；旧工具拒绝新格式，不能手改编号绕过。
- SDK生成匹配的Nginx目录、运行配置入口、健康检查和访问URL。外部网关转发到此入口时保留目录，避免再次剥离。
- 每次完整或部分构建保持同一PUBLIC_BASE_PATH，即使只构建serv。目录变化须全量部署；遗漏或改变目录的增量包会在替换前拒绝。失败恢复使用旧发布的健康路径；容器恢复不撤销业务数据。

## 验收与同步

核对根路径回归、带目录的加载/刷新/认证/权限、公开配置无缓存、API目标与390px布局；确认所有真实前置已成功，区分浏览器、Nginx和服务器恢复证据。修改目录能力时同步构建清单、部署读取方、健康检查、回滚、模板、用例、三语说明和使用截图。
