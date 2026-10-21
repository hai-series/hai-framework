---
name: hai-deploy
description: "部署已有构建产物：配置环境与中间件，生成 Compose tar 并通过 SSH 或手工搬运发布；也支持 Vercel。"
---

# hai-deploy

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 消费已有镜像或平台产物，配置环境、中间件并部署 |
| 适用场景 | SSH 自动部署、离线手工交付、Vercel 发布和部署故障排查 |
| 输入 | 完整构建产物、pnpm-lock.yaml、目标环境文件、部署配置和私有凭据引用 |
| 输出 | Compose tar 与手工说明，或已检查的在线部署结果 |
| 限制 | deploy 不编译/构建，不提供 skip-build 兼容路径；收费开通/发布/删除须在用户授权范围内。packaged 不代表 ready。 |

## 操作流程

1. 读取当前 package.json、`hai.build.json`、构建清单和 `_deploy.yml`；构建入口见 [hai-build](../hai-build/SKILL.md)。先显式运行 `pnpm build --target docker`，缺产物不得在 deploy 中隐式补构建。
2. 选择环境，检查 `.env.<mode>`；缺失则让用户创建后再继续。六类环境文件和变量优先级见 [中间件与环境](middleware.md)。
3. 逐项展示 lockfile 运行依赖要求的中间件、当前后端与默认用途，提供默认/自定义/完整配置时保持不变。用户表示配置齐全或传 `--skip-middleware` 时跳过全部处理，不重写连接或开通资源。
4. 检查已有镜像清单和 SHA-256，再生成对应环境的 Compose tar。含 app/web 时一起发布，公开 Web 同源代理 API；私有 env 仅挂载 API。
   版本以清单 appVersion 为准，不从当前源码猜测；Compose 使用 docker-compose-<版本>.yml，tar 自动补版本后缀，启动与手工 ps/logs 都显式 -f 指定。保留稳定的项目/卷身份，跨版本跳过中间件时复用上次 Compose。CLI 仅使用 --skip-middleware，SDK 仅使用 skipMiddleware。
5. 在线模式上传一个 tar，远程解包、导入、compose up，再检查 API/Web；手工模式 `--bundle-only` 不要求 SSH 配置、不连接远端，输出准确的复制/解包/启动步骤及所需镜像标签。
6. 失败返回非零退出码；SDK 返回 HaiResult，先检查 success。保留已创建资源的恢复信息，不擅自删除。测试资源在 finally/teardown 清理。

## CLI

使用 `pnpm run deploy` 明确执行项目脚本，避免与 pnpm 自身的 deploy 命令混淆。

```sh
pnpm build --target docker
pnpm run deploy --env test
pnpm run deploy --env prod --skip-middleware
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --bundle-only --output release-prod.tar
# fullstack 的 deploy 脚本等价于
pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .
```

API workspace 的服务目录为 apps/my-app-service。单包使用当前目录。Node/pnpm 版本以项目 engines/packageManager 为准，Windows 用 pnpm.cmd。

```yaml
# 服务包 config/_deploy.yml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: rustfs # rustfs | minio
```

SSH/平台参数可在向导输入后存入 `.env.local` 的 `HAI_DEPLOY_PROVIDER` 整体 JSON；私钥只存路径，不记录内容。仅打包可省 SSH；在线部署需要 ssh/scp、主机信任和运行权限。完整字段、可选云 Provisioner 及中间件配置见 [middleware.md](middleware.md)。

## SDK

```ts
import { deploy } from '@h-ai/deploy'

const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 18080 } } })
if (!initialized.success) throw new Error(initialized.error.message)
try {
  const result = await deploy.deployApp('./packages/my-app-serv', {
    environment: 'prod', envDir: '.', bundleOnly: true,
    artifactDir: './.hai/build/docker/<buildId>', skipMiddleware: true,
  })
  if (!result.success) throw new Error(result.error.message)
  // bundlePath/instructions；只有在线部署才有健康检查和可访问 URL。
}
finally {
  await deploy.close()
}
```

`deploy.scan`、`deploy.credentials.getPath/load/save/saveAll` 不依赖 init。Vercel 使用 prebuilt 协议只上传 Build Output API v3 的 .vercel/output，不运行 build 命令；云认证和开通需要外网。

## 离线交付与验证

部署器不需要本地容器引擎；提前从构建机复制完整 `.hai/build/docker/<buildId>`。Linux 准备 Docker/Podman、compose、sh、tar、sha256sum、所需中间件镜像的准确标签及数据目录权限。手工包含私有配置，权限受限，不提交 Git。启动脚本校验文件、加载 app/web、检查镜像存在并导出环境标识；缺镜像时停止，不联网拉取。

完全离线构建另需基础镜像、Linux 依赖缓存、pnpm 和匹配 ABI/libc 的 SQLite 预编译包；Windows node_modules 不能替代。生产 HTTPS、CORS、证书和 DNS 另行配置。实际断网后验收登录、刷新、重启与持久化，不能将联网测试当作离线证明。

改动后执行 typecheck、lint、build、test，模板执行 scaffold gates，部署流程执行 test:deploy-gates；真实 Tauri 安装包按系统单独验证。所有测试临时工程、镜像、容器、辅助进程、截图、日志和报告必须在 finally/teardown 自动清理，失败/取消同样清理。不得把验收产物提交 Git，也不得清理用户既有资源。
