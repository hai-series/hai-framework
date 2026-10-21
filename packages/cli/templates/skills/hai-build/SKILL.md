---
name: hai-build
description: "定位 hai 应用架构、模块依赖、初始化顺序、构建模式和对应技能。"
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

## 构建与部署

- `pnpm build` 默认仅编译源码（调用 compile）；`pnpm build --target docker` 根据 hai.build.json 构建并导出 app/可选 web 镜像，auto 优先可达 Podman、其次 Docker，可用 --runtime 显式指定。
- 构建不区分 dev/test/prod，不加载部署环境覆盖，不注入运行期凭据；完整镜像清单含 SHA-256，全部成功才发布 latest。不要让 compile、Dockerfile 或 Tauri beforeBuildCommand 递归调用自身的原生/镜像构建。
- Vite 的 envDir 与 SvelteKit 的 kit.env.dir 是独立加载入口，必须同时阻止构建阶段读取工程根的 .env 文件；开发/预览由 core loader 注入，运行期由 deploy 注入。用临时 .env.local 哨兵值检查输出，避免只过滤进程变量却仍把私有文件固化进产物。
- 静态客户端通过 runtime-config.js 或原生宿主初始化脚本获取公开地址与元数据；仅投影公开白名单，禁止将完整 process.env、服务配置或密钥序列化到浏览器。预览与容器启动均须验证真实登录，不能依赖构建期 API 地址让 E2E 通过。
- `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64` 调用对应工程的 Tauri build。要求在目标系统准备 Rust target、SDK 和打包工具，不假定跨系统编译。原生安装包必须按目标系统实测。
- deploy 只消费已有产物，详见 [hai-deploy](../hai-deploy/SKILL.md)。网络不通时 --bundle-only 生成 tar，按说明手工搬运；packaged 不代表部署已运行。
- 测试临时工程、镜像、容器、辅助进程、日志、截图和报告必须在 finally/teardown 自动清理，失败/取消也清理；不得提交测试产物或删除用户既有资源。
- 浏览器测试的数据放入本轮独立临时目录；Windows 等子进程与服务退出后再删除数据库和上传文件，不依赖下一轮测试补清理。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- 适用场景
- 项目架构
- 技能导航
- 行为开发工作流
- 统一编码规范
- 标准工作流
