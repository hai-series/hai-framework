# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

部署已有镜像与 Vercel prebuilt 产物。支持完整离线交付、选择服务更新、SSH 自动发布和跨平台人工部署脚本。SDK 不构建源码，CLI 的 --build 明确编排先构建后发布。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/deploy`。

[跟着最小示例完成接入](../../docs/usage/function/deploy.md#quick-start)。

## 配置清单

在项目的 `hai.json.deploy` 中指定发布目标。执行 `hai deploy --env prod` 时，CLI 读取 prod 环境的部署变量；应用的连接地址和凭据应放在该环境对应的配置中。

在[模块配置清单](../../docs/usage/configuration/deploy.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/deploy.md#api-reference)，包含调用入口、输入、返回值和用法。

自动化调用方可共用 CLI 构建回执，并按持久化的部署 ID 分步执行和核对。 [分步部署用法](../../docs/usage/function/deploy.md#programmatic-release-verification)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/deploy.md)，了解发布制品、成功基线、状态、环境文件和中间件数据。

## 开发测试

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/deploy test:e2e
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

真实部署按 API、SSR、静态移动前端和 fullstack 选取代表：admin 覆盖 website/h5 共用的 SSR Dockerfile 与生产部署分支；各应用类型仍由八个 scaffold 场景分别安装、编译并执行 HTTP/浏览器验收。scaffold 与生成路由 runtime 按实测资源争用分批顺序执行，三个轻型 CLI 门禁可与 runtime 在最多两个 worker 内并行；生成场景复用 E2E 自带完整构建，保留生产构建隔离及真实产物检查。CLI 部署门禁保留认证/传输、增量更新、损坏制品和回滚，并用生产同版本 Nginx 对公开部署包执行 `nginx -t`。测试夹具通过 init 回收孤儿进程，并验证真实 PID 消失。

验证真实生成项目与 SSH/人工部署，覆盖禁止访问镜像仓库、局部更新、归档损坏、同版本发布和健康失败。finally/teardown 只清理本次测试创建的项目、镜像、容器、日志和进程。

`test:e2e` 构建当前包，并在子进程中启用、串行执行锁与进程两组真实 Linux 门禁，根 `pnpm e2e` 也包含此入口。需要可连接的 Podman（优先）或 Docker，运行公开 API 生成的 `apply.sh`，验证并发、父进程强杀后的子进程持锁、全部进程退出和重启恢复。Compose/HTTP 使用确定性夹具，不能替代真实容器服务部署验收。

进程门禁运行 `pnpm --filter @h-ai/deploy exec vitest run tests/deploy-command-process.test.ts tests/deploy-secret-masker.test.ts`。设置同一 `HAI_DEPLOY_E2E=1` 后运行 `tests/deploy-command-runtime.e2e.test.ts`，先构建 deploy；它使用真实 Linux、OpenSSH 和发布 dist，验证远端继续执行/完成回执以及本地进程组。该夹具需联网安装 sshd；Compose/HTTP 为确定性夹具，发布 deadline 缩短为 2500 毫秒，并注入暂停消费模拟丢失回执。

部署夹具先检查固定公开基础镜像，仅明确缺失时拉取，可沿用 HAI_DEPLOY_E2E_MIRROR；公共缓存不进入清理账本。成功 create 后先登记容器 ID，再在其私有 PID namespace 内异步安装 APT/pip 并启动 sshd。准备失败、超时或合作式取消会等待本地客户端退出，按已登记 ID 回收并确认消失；仅重型嵌套 Podman 夹具使用特权。HAI_DEPLOY_E2E_APT_MIRROR 只接受镜像站主机名并保留 HTTPS。拥有权测试用固定公开镜像的本轮私有 tag，保留同内容外部 tag、重指向保护、动态端口和外部 sentinel 检查。create 回执丢失且未获得可信 ID、测试进程被强制终止等情况仍需记录未知状态，不能按名称或 label 认领清理。

## 许可证

Apache-2.0
