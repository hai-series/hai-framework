---
name: hai-deploy
description: "构建并发布或交付已有镜像：完整离线包、按服务更新、SSH 与跨平台手工部署、失败恢复；也支持 Vercel prebuilt。"
---

# hai-deploy

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 配置环境与中间件，交付完整离线包或发布选中服务 |
| 适用场景 | 一体化构建发布、独立打包、隔离网络手工部署、增量更新与故障排查 |
| 输入 | package.json、hai.build.json、运行依赖锁文件、目标环境、已有制品或明确构建要求 |
| 输出 | 带校验和的 tar、跨平台部署入口与分步结果，或经过 HTTP 检查的部署结果 |
| 限制 | SDK 只消费产物；CLI --build 显式先构建。首次安装必须完整交付，packaged 不代表服务器 ready。云资源需要外网。 |

## 操作流程

1. 读取项目 scripts、images/ 中的 Dockerfile、hai.build.json 与服务目录配置。创建默认带开发期部署工具；用户明确 --no-deploy 时不生成部署入口。构建细节见 [hai-build](../hai-build/SKILL.md)。
2. 选择环境，验证 .env.<mode> 存在，再处理 SSH 与必要中间件。使用人类可读字段说明，复用有效配置；私有参数写 .env.local，私钥仅引用路径。环境规则见 [middleware.md](middleware.md)。
3. 先校验所选制品、版本、服务和 SHA-256。--build 只构建所选应用镜像；不带它时缺产物明确失败，不隐式补构建。格式版本 3 记录 appVersion、buildId、partial、hasWeb、镜像归档及显式配置的 appContainerPort/webContainerPort；部分构建也保留未选镜像端口，缺省使用部署默认值。同一应用版本可重建，镜像引用区分实际内容；禁止 latest 与无版本镜像。
4. 完整包自动导出实际自建中间件镜像并去重；只更新 Web 不重新打包 API/中间件。打包机需容器引擎导出中间件，服务器仅 load，禁止 pull/build。外部连接及云开通不能伪称为离线自包含服务。
5. --services 使用目标服务器最后成功状态为基线，检查端口/拓扑及未选依赖，保留未选配置、凭据、网络和卷。脚本先按项目/服务标签仅删除选中旧容器（保留卷），再 up -d --no-deps --no-build --pull never --no-recreate 创建新容器并保留其他容器，避免 Compose Provider 连带重建反向依赖，禁止整个项目 down。storage-init 是一次性创建 S3 桶，涉及存储初始化才运行。仅更新 storage 也需含 app 镜像的制品运行初始化；最近为 web-only 时，用 --artifact-dir 选择原完整制品，或先 pnpm build --target docker --images app，不会更新运行中的 app 服务。
6. --bundle-only 不连接 SSH，同时输出 tar 和 -deploy/ 操作目录。Windows deploy.ps1、Linux/macOS deploy.sh 上传并执行包内 apply.sh；完全隔离时搬运 tar，独立目录解包执行 sh apply.sh，可传部署根目录。脚本不依赖源码、Node 或 pnpm。
7. 工具预检、基线、上传、校验、镜像导入、服务更新和 HTTP 检查分别报告。失败返回非零退出码，结果文件保留失败阶段；只有检查成功才更新服务器 current。已有部署失败尝试恢复所选服务的旧容器和配置；数据卷保留，已写业务数据不回退，恢复后仍需验证健康。禁止把本地打包记录当服务器成功状态。

## CLI

```sh
pnpm run deploy --env prod --build
pnpm build --target docker
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --bundle-only --output release-prod.tar
pnpm build --target docker --images web
pnpm run deploy --env prod --services web
```

使用 pnpm run deploy，避免与 pnpm 自带 deploy 混淆。fullstack 指向 packages/<项目>-serv，API workspace 指向 apps/<项目>-service；这是扫描入口，不是镜像选择。--services 负责选择；--skip-middleware 只跳过配置及开通。--yes 复用有效配置，缺值时不盲目继续。

## SDK

deploy.init 后检查 HaiResult.success，deploy.deployApp 接收 artifactDir、bundleOnly、selectedServices、runtime 与 onProgress；finally 中 deploy.close。deploy.scan 和 deploy.credentials.* 不依赖 init。Vercel 只消费已有 .vercel/output，不执行源码构建，也不支持 Compose 离线/部分更新。

## 离线交付与验证

Linux 预备 Docker/Podman、支持 --pull never 的 Compose（Docker Compose v2 或 podman-compose 1.6.0 及以上）、sh、tar、sha256sum、awk、curl 及目录/容器权限。完整 tar 包含全部自建中间件归档；目标架构须匹配。包中有私有配置，安全搬运，不提交 Git。离线构建额外准备基础镜像、Linux 依赖缓存、工具链与原生预编译包；Windows node_modules 不能替代。

按 [分轮验证与集中修复](../hai-app-tests/validation.md) 收集适用的 typecheck、lint、build、test、scaffold gates 和 test:deploy-gates，汇总后集中修复、再验证。实际验证无 registry 网络的首次部署、登录刷新、同版本重发、只更新 Web/API、损坏归档、缺基线、健康失败与恢复。Windows/Linux/macOS 上传入口分别执行验收；原生安装包在对应 OS 验证。测试临时工程、容器、镜像、数据和进程在 finally/teardown 清理，只清理测试拥有的资源；日志、截图和报告保留到分析和交付结束再清理。
