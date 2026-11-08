# CLI 项目模板

本目录供 `hai create/add/init` 组合应用源码、配置、脚本和AI指引；维护者在这里修改生成源，接入应用使用生成后的工程。模板不承担应用自身的业务授权和数据恢复。

## 快速开始

在框架根构建CLI，再生成独立工程检查模板效果：

```sh
pnpm --filter @h-ai/cli build
node packages/cli/dist/index.js create ../template-probe --type website --defaults --no-install --no-git
```

输入模板种类与工程名，输出新目录中的源码、README、配置、Dockerfile及适用技能。随后在该工程安装并验证；仅检查 `.hbs` 语法不能证明生成结果能运行。

## 功能

### 文件如何组合

| 目录                | 场景、输入与输出                                                                      |
| ------------------- | ------------------------------------------------------------------------------------- |
| base/               | 普通应用共享基础；输入渲染上下文，输出配置、脚本和入口                                |
| apps/               | 按admin/website/h5/api/mobile-app/fullstack选择骨架；API/fullstack有独立workspace结构 |
| features/           | 叠加实际模块所需路由与页面；不把Serv套成SvelteKit文件路由                             |
| i18n/               | 生成Paraglide工程与应用消息；默认中英日文                                             |
| shared/             | 原生显示名、Tauri入口及跨模板文件约定，避免各模板复制不同规则                         |
| skills/ 与 bridges/ | 输出完整 `.agents/skills/` 及根AGENTS入口，工具配置只桥接共享规则                     |

普通文件复制，`.hbs` 由Handlebars渲染并去后缀。`cli-template-engine.ts` 选择目录/条件，`cli-create.ts` 编排配置、镜像与README生成。例如website输出Core/Kit/UI展示站，fullstack输出contract、Serv、共享UI及所选Web/App/Desktop；miniapp仅为预留说明。

### 生成上下文与配置

上下文含 `projectName/appType/features/hasUi/hasI18n/versions` 和 `api/fullstack` 形状，定义见[CLI类型](../src/cli-types.ts)。模块YAML使用 `moduleConfig` helper，字段和默认值由[配置生成器](../src/commands/cli-config-templates.ts)共同维护。

输入启用模块后，输出对应依赖、有效配置及公共环境默认；未使用模块保留注释示例。新功能仍须接入校验、初始化、关闭和业务路由，不能仅取消YAML注释。`hai add/init` 补缺失项并保留自定义文件。

### 构建、原生名称与部署

部署工具默认是开发依赖，`--no-deploy` 可省略。`hai.json.build.images` 指向images内独立Dockerfile，Web资源在images/web。构建器生成images/dependencies，根gitignore忽略该缓存、运行数据和私有环境。

Dockerfile使用全局HAI_NODE_IMAGE/HAI_NGINX_IMAGE及构建阶段HAI_NPM_REGISTRY接收下载设置，代理只用于构建，不进入运行镜像。pnpm下载采用追加日志，Windows转发保留警告、错误和统一换行。[下载源契约](skills/hai-build/reference.md#下载源与代理)

产物使用工程标识，批次名为 `build-<工程>-<目标>-YYYYMMDD-HHmmss-<随机串>-<版本>`，latest保存相对批次名。输入一个Core展示名后，Capacitor的appName和Tauri产品/主窗口名使用该值；Fullstack读取Serv的Core，独立mobile读取自身Core。只投影名称，不下发完整配置。辅助窗口及后续显式Tauri配置保持自身优先级。[名称与构建](../../../docs/usage/getting-started/build.md#原生应用名称)

### 服务端边界与页面

SvelteKit服务端固定加载Kit配置，根load只投影公开transport。选择crypto后，hooks从私有环境装配密钥环和registry；共享DB用于共享registry，内存仅开发/测试。纯客户端不生成服务端私钥。输入冲突路径策略或缺少required加密依赖时，创建宿主应失败。

页面文字走应用messages，认证复用AuthPanel及公开IAM配置，表单使用Form/FormLayout/FormField。输入无效表单时保留草稿、显示安全Toast和可访问错误关联；默认角色、流程和限额由业务决定，并在服务端授权。宽屏工作区可扩展，窄屏表格内部滚动，阅读内容保留合适宽度。

### AI指引

复制skill完整目录及其相对参考文件，并按应用架构排除不适用能力；引用不得回到框架私有目录。输入website或fullstack两种架构时，输出应各自形成可独立使用的引用闭包。Claude/Copilot/OpenCode仅引用AGENTS和共享规范，不复制长正文。调整公共契约时同步实现、配置、示例、调用方与skills。

## 配置

模板参数在生成阶段消费，生成应用通过自身 `config/`、环境与宿主参数配置运行。环境公共值与私有秘密分开，版本固定到CLI对应框架发布；pnpm补丁注册必须连同实际patch文件复制。[应用配置手册](../../../docs/usage/configuration/README.md)

维护 `shared/.gitattributes`，使Dockerfile、dockerignore和POSIX脚本输出LF。原生工程名、API公开地址、网站basepath与服务器私密配置职责独立，不将完整服务端配置投影到浏览器或原生打包工具。

## 错误处理

模板渲染失败应指出文件/步骤并停止，不以部分产物当成功。生成后的校验或构建失败回到所属模板修复，不能只手工修一份测试工程。私钥、凭据和完整用户数据不进入错误正文。缺失依赖、非法路径、引用不完整和不支持的架构组合要明确拒绝。

## 开发测试

在仓库根按实际影响选择：

```sh
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli build
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

脚手架门禁真实安装、类型/lint、构建、测试和浏览器流程；部署门禁需可用Podman/Docker，并验证实际镜像、SSH/手工适用及部分更新。原生设备和第三方线上服务另需对应环境。仅文案改动不代表重跑过所有运行场景。

## 许可证

Apache-2.0
