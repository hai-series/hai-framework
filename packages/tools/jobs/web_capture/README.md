# 网页正文与素材采集镜像

`web_capture` 将获准访问的网页正文、截图、颜色和素材整理成 ZIP。应用可以将提取的正文交给摘要或分镜流程，也可以用截图与素材保留所引用的网页内容。镜像通过固定版本 HyperFrames 采集动态页面。 [Dockerfile](Dockerfile)

## 快速开始

在 Linux 的 rootless Podman 环境中，从仓库根目录载入 `build_hai_job` 和 `run_hai_job`。准备部署方提供的内部网络和受控 HTTP IPv4 代理，选择代理已批准且含可见正文的站点。代理还需要允许任务使用的素材来源。 [共享命令](../README.md#quick-start)

```bash
build_hai_job web_capture
read -r -p '输入内部 Podman 网络名 ' HAI_JOB_NETWORK
read -r -p '输入 HTTP IPv4 代理地址和端口 ' HAI_TOOL_BROWSER_PROXY
read -r -p '输入代理允许的 HTTPS URL ' hai_page_url

jq -nc --arg url "$hai_page_url" \
  '{operation:"web.capture",url:$url,output:"capture.zip",maxScreenshots:2}' |
  run_hai_job web_capture page-capture
```

确认 `$hai_job_work/page-capture/response.json` 中的 `success` 为 `true`。用归档工具打开同目录 `output/capture.zip`，查看 `capture.json`、`capture-status.json` 和 `screenshots/`，核对来源、正文与截图，并确认有哪些素材缺失。

## 配置清单

- `HAI_JOB_NETWORK` 供终端辅助函数选择内部 Podman 网络。该网络的出站连接限制到部署代理的地址与端口。
- `HAI_TOOL_BROWSER_PROXY` 由部署方设为 `http://<IPv4 地址>:<端口>`。代理对目标地址、重定向和子资源执行同样的授权策略。代理缺失或地址无效时返回 `NETWORK_POLICY_REQUIRED`。
- 采集会执行目标页面的 JavaScript。镜像以非 root 用户运行 Chromium 并要求启用其沙箱。启动环境无法启用沙箱时返回 `SANDBOX_UNAVAILABLE`。 [部署代理与沙箱要求](../README.md#配置)

## 功能说明

应用在 Runner 登记 `web.capture` 能力和 `internal` 网络策略。把环境 ID 传给 `toolsRunner.createJobTools()` 的 `environments.web`，提供 `browserProxy`，在工具服务中启用 `web_capture`。下方的 `service` 是已装配的工具服务，`context` 来自服务端认证，`url` 是获准采集的页面地址。 [工具服务接入](../../../../docs/usage/function/tools-runner.md#job-tools)

```ts
const capture = await service.invoke({
  name: 'web_capture',
  input: { url, maxScreenshots: 2 }
}, context)
if (!capture.success)
  throw new Error(capture.error.message)
```

成功结果的 `data` 包含 `sourceUrl`、`title`、`text` 和 `artifacts`。通过 `artifacts[0].id` 从宿主下载 ZIP 取得截图和其他素材。应用要从网址生成介绍视频时，可以通过 `website_video` 编排采集、文案、分镜、配音及渲染。 [网址转视频接入](../../../../docs/usage/function/tools-runner.md#website-video) · [视频渲染镜像](../video_render/README.md)

## 数据结构

| 镜像请求字段     | 取值                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `operation`      | 固定为 `web.capture`                                                  |
| `url`            | 必填。最多 2048 个 Unicode 字符，使用 HTTPS、ASCII DNS 域名和默认端口 |
| `output`         | 必填。`/output` 下的 ZIP 文件名                                       |
| `maxScreenshots` | 可选。主截图上限 1～8，默认 4                                         |

镜像响应的 `data.artifact` 提供 ZIP 文件名和大小，`data.summary` 包含来源、正文、颜色、截图和素材路径，`capture.json` 在归档中保存采集结果。返回成功需要有可见正文和截图。ZIP 上限 50 MiB，正文上限 256 KiB。通过 `capture-status.json` 检查缺失素材和警告，再将结果交给后续应用。 [采集输出与限制](../README.md#采集网页正文与制作素材)

采集器产出的 JSON、UTF-8 正文或元数据无效时返回 `INVALID_OUTPUT`。可以检查镜像版本和采集日志。

## 开发测试

在仓库根目录验证采集响应与归档、代理前置条件和沙箱错误分类。

```sh
python3 -B -m unittest discover -s packages/tools/jobs/tests -p test_media_jobs.py
```

在实际执行节点验收时，选择部署方批准的测试站点，核对正文、截图、素材及代理限制。 [开发测试](../README.md#开发测试)

## 许可证

[Apache-2.0](../../../../LICENSE)
