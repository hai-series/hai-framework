---
name: hai-build
description: "构建或排查 hai 应用的源码、静态网站、容器镜像和桌面产物；识别工程架构、依赖与对应构建入口。"
---

# hai-build

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 定位 hai 应用架构、模块依赖、初始化顺序、构建模式和对应技能 |
| 适用场景 | 识别应用架构、跨模块依赖或构建入口 |
| 输入 | README、package.json、应用类型、现有 config 与目标 |
| 输出 | 适用技能、最小修改路径和按范围选择的验证命令 |
| 限制 | 先识别 API workspace、SvelteKit、SPA 或原生 App；不强行转换架构，不给纯函数模块添加生命周期。 |

## 使用路径

- 先读当前 package.json、lockfile 与 README，识别 SvelteKit / API workspace / fullstack / Vite SPA / 原生 App，按实际 scripts 验证。
- 升级 hai-framework、比较版本差异或同步框架 skills 时，使用 [hai-framework-sync](../hai-framework-sync/SKILL.md) 完成版本发现、差异分析、选择/阻塞处理、迁移与验证。
- 功能开发先用 [development.md](../hai-app-create/development.md) 把需求匹配到当前版本的框架能力与配置；再读取所选模块 skill 和公开类型。
- 有生命周期的模块按真实依赖初始化、检查结果并反序清理；core、纯函数和工厂不套用相同生命周期。
- 构建任务检查当前 engines、适配器、缓存与目标产物，不能照搬框架仓库私有构建命令。
- 多项门禁按 [分轮验证与集中修复](../hai-app-tests/validation.md) 先收集结果再集中修复；遵守产物依赖与资源隔离，不并行清理/重建同一输出目录，不用旧产物补成通过。

## 构建与部署

- website默认Node SSR；纯展示站点用`hai create <name> --type website --features none`明确不选可选业务模块，Core/Kit/UI与默认部署开发工具保留，fullstack仍保留架构必需模块。`HAI_BUILD_STATIC=1 PUBLIC_BASE_PATH=/docs-site`只用于compile，docs-site替换为实际仓库名，各路径段仅ASCII字母、数字、_、.、-，不含末尾/、查询/片段或逃逸；省略/0保持SSR，根站路径留空。静态拒绝已选服务端业务模块、自定义API/actions和未预渲染页面，不放宽生产依赖守卫，不用SPA fallback；唯一默认健康端点不发布。构建不读根.env；static是公开目录，正常图片/字体等原样发布，禁止放私密内容，检测到.env/.env.*或符号链接会停止构建。上传build时include-hidden-files:true保留.nojekyll，验根/深链/刷新/资产与敏感哨兵。普通SSR仍支持动态功能；不要把静态参数混用docker/app/desktop。

- 创建默认包含开发期部署工具，可用 --no-deploy 关闭。每个镜像使用 images/ 中独立 Dockerfile，Web 配置位于 images/web/，不使用镜像阶段 target 配置。
- 构建器生成 images/dependencies/ 安装输入；fetch、安装和生产依赖整理共用 pnpm store，安装与生产依赖整理共用 SQLite 驱动缓存，并复用依赖层。file: 归档、补丁、workspace 元数据必须进入下载上下文；原生依赖缓存按系统/架构/ABI 区分。基础镜像、中间件及工具指定版本，禁止 latest。
- 默认容器面向 CPU 运行或远程 AI 服务，Dockerfile 设置 `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`，跳过额外 CUDA/TensorRT 下载；使用宿主机 GPU 时定制镜像和运行参数，不修改本机 npm 或全局 AI/GPU 配置。
- pnpm run deploy --build 显式串联构建、打包和发布；--bundle-only 只交付完整离线包与跨平台脚本；--services 以服务器成功状态为基线只更新选中服务。完整包自动包含自建中间件镜像，服务器禁止联网拉取。
- `pnpm build` 默认仅编译源码（调用 compile）；`pnpm build --target docker` 根据 hai.json.build.images 的 dockerfile 构建并导出 serv/web 镜像（可单独或组合），可用 --images web 只构建前端，auto 优先可达 Podman、其次 Docker，可用 --runtime 显式指定。
- compile 交付源码编译结果，docker 交付镜像归档，desktop 交付 Tauri 系统安装包，app 交付 Capacitor 原生制品；每次选择一个 target。hai.json 的 build.images[].dockerfile 指向独立镜像文件，build.desktop/build.app 声明原生工程目录，deploy 保存整个项目的部署配置；参数和平台前置以当前 CLI 类型与工程 scripts 为准。cap:sync 只同步工程，不能作为已打包或已安装的证据。
- Podman 的客户端代理通过预定义构建参数传递，覆盖 Windows/macOS 远程引擎的服务端默认值；代理地址必须能从构建容器访问，--no-http-proxy 禁止此传递。不要把代理写成 Dockerfile ENV 或固化进交付镜像。
- --network 默认沿用引擎网络；只有实际构建网络无法访问依赖/代理时才显式选择网络，pasta 仅适用于 rootless Podman。build 与 run 的主机名解析可能不同，须验证构建网络中的可达性，不默认改成 host 网络。
- 从运行 build 的应用根 package.json.version 读取版本，不能使用 CLI/框架版本或服务子包版本代替。清单格式 version=4，appVersion 为应用版本；servContainerPort/webContainerPort 仅记录 images 配置显式填写的端口，部分构建也保留未选镜像端口，未填写时沿用部署默认值。镜像 tar 名含版本、buildId 区分同版本构建，Tauri 也接收根版本。不要手改清单或保留无版本的交付归档。
- 构建不区分 dev/test/prod，不加载部署环境覆盖，不注入运行期凭据；所选镜像清单含 SHA-256，全部成功才更新本机最近构建指针（不是镜像标签）。不要让 compile、Dockerfile 或 Tauri beforeBuildCommand 递归调用自身的原生/镜像构建。
- 运行产物的反馈标识为 appVersion/buildId/commit：CLI 过滤调用者 HAI_/PUBLIC_/VITE_ 后仅注入本次内部生成的 HAI_BUILD_ID/HAI_BUILD_COMMIT，Docker 使用镜像批次 ID 经 ARG 传入编译。每个目标的运行版本取自己的 manifest，同次 SSR 的 client/server 共用 buildId；没有所属 Git 提交时明确 unknown。模板的三字段 build-metadata.json 与代码内联共用值，验收需与 API/ZIP 的各端证据分别核对。
- Vite 的 envDir 与 SvelteKit 的 kit.env.dir 是独立加载入口，必须同时阻止构建阶段读取工程根的 .env 文件；开发/预览由 core loader 注入，运行期由 deploy 注入。用临时 .env.local 哨兵值检查输出，避免只过滤进程变量却仍把私有文件固化进产物。
- 静态客户端通过 runtime-config.js 或原生宿主初始化脚本获取公开地址与元数据；仅投影公开白名单，禁止将完整 process.env、服务配置或密钥序列化到浏览器。预览与容器启动均须验证真实登录，不能依赖构建期 API 地址让 E2E 通过。
- Fullstack Capacitor App 在 `public/runtime-config.js` 提供公开 API 地址，再编译并同步原生资源；Tauri 从启动进程的 PUBLIC_API_BASE 注入。不能把开发代理的 .env 配置当作已安装原生包的运行配置。
- `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64` 调用对应工程的 Tauri build。要求在目标系统准备 Rust target、SDK 和打包工具，不假定跨系统编译。原生安装包必须按目标系统实测。
- deploy 默认消费已有产物，--build 显式先构建，详见 [hai-deploy](../hai-deploy/SKILL.md)。网络不通时 --bundle-only 生成 tar，按说明手工搬运；packaged 不代表部署已运行。
- 测试临时工程、镜像、容器、辅助进程和数据必须在 finally/teardown 自动清理，失败/取消也清理；日志、截图和报告保留到分析和交付结束再清理，不得提交测试产物或删除用户既有资源。
- 浏览器测试的数据放入本轮独立临时目录；Windows 等子进程与服务退出后再删除数据库和上传文件，不依赖下一轮测试补清理。

交付角色统一为 `serv`（独立 API 后端）、`web`（静态或 SSR 浏览器站点）、`app`（Android/iOS 手机安装包）、`desktop`（桌面安装包）。Fullstack 容器为 serv + 可选 web，API 为 serv，admin/website/h5/mobile-app 的浏览器镜像为 web；原生 app/desktop 不作为服务器 Compose 服务。`--images` 与 `--services` 使用 serv/web，`--target app` 与 `--target desktop` 生成原生包。API workspace 的服务目录为 `apps/<项目>-serv`。镜像与容器共用工程根 `package.json.name` 的归一化身份（去 scope、转小写、非法字符合并为连字符）；名称缺失或无效时报错，不回退目录名。镜像为 `localhost/hai-<项目>-<角色>:<buildId>`，容器为 `hai-<项目>-<环境>-<角色>`，镜像可跨环境复用。

命名与拓扑契约使用制品格式 4，新增 primaryService（serv/web），hasWeb 表示完整工程是否包含浏览器端；只有 serv + web 才生成同源 API 代理。旧格式制品须重新构建。CLI 的 --project-name 与 SDK 的 DeployAppOptions.projectName 覆盖入口已移除；旧参数会明确报错，请在工程根 package.json.name 维护资源身份。迁移已有工程时，先同步 hai.json 的 build.images 名称、Dockerfile 文件名与引用；API workspace 的服务目录、包名和依赖引用统一为 -serv，并重新安装依赖。随后重新构建完整制品；不要仅改归档文件名或手工修改 manifest 冒充新构建。旧部署先备份并核对项目名、数据卷和受管凭据，再切换到新的完整部署基线；工具不自动跨项目迁移数据。完整部署仍会按 Compose 规则清理同项目的旧服务容器，不能仅修改 deploy-target.json.directory 完成迁移。

## 按需参考

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

- 适用场景
- 项目架构
- 技能导航
- 行为开发工作流
- 统一编码规范
- 标准工作流

原生 App：hai build --target app --platform android|ios 使用 hai.json.build.app；cap:sync 只同步，不是 APK/IPA。先安装平台与 SDK/JDK 或 macOS/Xcode、配置签名；缺工程/工具链/本次产物必须失败。发布过滤 CAPACITOR_SERVER_URL，并核验同步后的原生配置；默认 package/发行别名走同一验证入口。构建身份统一 128 字符，显式非法 HAI_BUILD_ID/HAI_BUILD_COMMIT 报错且不回显原值。
