# 浏览器截图镜像

`browser` 将代理允许访问的 HTTPS 页面截成 1280 × 720 的 PNG。可以用它留存发布后的静态页面画面，或为应用提供一张可查看的网页截图。容器关闭 JavaScript、下载和 Service Worker。 [Dockerfile](Dockerfile)

## 快速开始

在 Linux 的 rootless Podman 环境中，从仓库根目录载入共享说明中的 `build_hai_job` 和 `run_hai_job`。准备部署方提供的内部网络和受控 HTTP IPv4 代理，再输入代理已批准的页面地址。 [共享命令](../README.md#quick-start)

```bash
build_hai_job browser
read -r -p '输入内部 Podman 网络名 ' HAI_JOB_NETWORK
read -r -p '输入 HTTP IPv4 代理地址和端口 ' HAI_TOOL_BROWSER_PROXY
read -r -p '输入代理允许的 HTTPS URL ' hai_page_url

jq -nc --arg url "$hai_page_url" \
  '{operation:"browser.navigate",url:$url,output:"page.png"}' |
  run_hai_job browser screenshot
```

`screenshot/response.json` 中的 `success` 为 `true` 时，打开 `$hai_job_work/screenshot/output/page.png` 查看画面。检查图片中的标题或其他预期内容，确认截图来自目标页面。

## 配置清单

- `HAI_JOB_NETWORK` 供终端辅助函数选择内部 Podman 网络。该网络的出站连接限制到受控代理的地址与端口。
- `HAI_TOOL_BROWSER_PROXY` 由部署方设置为 `http://<IPv4 地址>:<端口>`。代理需检查目的地址、重定向和子资源，并允许本次操作使用的目标站点。代理缺失或地址无效时，镜像返回 `NETWORK_POLICY_REQUIRED`。
- Chromium 在采集远程页面时启用自身沙箱。按执行环境的浏览器沙箱要求配置并验收实际 Runner 节点。 [代理与浏览器沙箱要求](../README.md#配置)

## 功能说明

应用为 Runner 登记 `browser.navigate` 能力，使用 `networkPolicy: internal`。把环境 ID 传给 `toolsRunner.createJobTools()` 的 `environments.browser`，并提供 `browserProxy`，然后在工具服务中启用 `browser_navigate`。`service` 是已装配工具服务，`context` 是服务端认证后构造的上下文，`url` 是本次获准访问的页面地址。 [工具服务接入](../../../../docs/usage/function/tools-runner.md#job-tools)

```ts
const shot = await service.invoke({
  name: 'browser_navigate',
  input: { url }
}, context)
if (!shot.success)
  throw new Error(shot.error.message)
```

成功结果的 `data.artifacts[0]` 是宿主保存的 PNG 引用。客户端通过应用的文件接口按 ID 查看或下载图片。需要同时取得正文和网页素材时，使用 [网页采集镜像](../web_capture/README.md)。

## 数据结构

| 镜像请求字段 | 取值                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `operation`  | 固定为 `browser.navigate`                                             |
| `url`        | 必填。最多 2048 个 Unicode 字符，使用 HTTPS、ASCII DNS 域名和默认端口 |
| `output`     | 必填。`/output` 下的 PNG 文件名，如 `page.png`                        |

镜像成功时在 `data.artifact` 返回文件名和字节数。网页访问或截图失败时检查 `error.code`。作业仅在指定的瞬时网络变更时重试一次，两次导航共用 20 秒预算，镜像入口对子进程使用 45 秒兜底。 [错误处理](../README.md#错误处理)

## 开发测试

在仓库根目录检查协议、代理前置条件及导航重试。

```sh
python3 -B -m unittest discover -s packages/tools/jobs/tests -p test_media_jobs.py
python3 -B -m unittest discover -s packages/tools/jobs/tests -p test_hai_tool.py
```

在实际部署的代理和执行节点上运行快速开始，核对截图尺寸和画面，再用部署测试策略验证由代理拒绝的地址会失败且没有发布图片。

## 许可证

[Apache-2.0](../../../../LICENSE)
