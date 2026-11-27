# HTML 动画视频渲染镜像

`video_render` 使用固定版本 HyperFrames 将准备好的本地 HTML 合成工程渲染为 H.264 MP4。比如应用保存了带分镜、字幕和配音的工程 ZIP，修改其中的动画或字幕后可以直接重新渲染。 [Dockerfile](Dockerfile)

## 快速开始

在 Linux 的 rootless Podman 环境中，从仓库根目录载入 `build_hai_job` 和 `run_hai_job`。将根目录含 `index.html` 的工程 ZIP 放在仓库根目录，命名为 `intro.zip`。用共享的两秒标题动画示例时，打包会生成 `$hai_job_work/input/intro.zip`，可从 `run_hai_job` 开始。 [共享命令](../README.md#quick-start) · [生成两秒动画工程](../README.md#渲染真实-html-动画视频)

```bash
build_hai_job video_render
cp -- ./intro.zip "$hai_job_work/input/intro.zip"
run_hai_job video_render intro-video <<'JSON'
{"operation":"video.render","input":"intro.zip","output":"intro.mp4","fps":30}
JSON
```

确认 `$hai_job_work/intro-video/response.json` 中的 `success` 为 `true`。用播放器打开同目录 `output/intro.mp4`。两秒示例中，标题 `Release checklist` 会渐入并上移。

## 配置清单

镜像在 `offline` 网络中运行，以非 root 用户和只读根文件系统配合受限临时目录。HyperFrames 要求临时目录和输出目录各至少有 1024 MiB 可用。在 Runner 部署中按共享资源配置预算分配临时盘。输入工程应携带引用的本地脚本、图片、字体和音频。 [离线与磁盘配置](../README.md#配置)

## 功能说明

在 Runner 登记 `video.render` 能力，把离线环境 ID 传给 `toolsRunner.createJobTools()` 的 `environments.video`，然后在工具服务中启用 `video_render`。上传 ZIP 并取得其授权文件 ID 后调用。下方 `service` 是已装配的工具服务，`context` 是服务端认证后构造的上下文。 [工具服务接入](../../../../docs/usage/function/tools-runner.md#job-tools)

```ts
const video = await service.invoke({
  name: 'video_render',
  input: { fileId, fps: 30 }
}, context)
if (!video.success)
  throw new Error(video.error.message)
```

成功结果的 `data.artifacts[0]` 指向宿主保存的 `video/mp4`，可按 ID 下载或播放。若当前只有网址，上层 `website_video` 可以准备网页素材、分镜、配音和工程，再把工程交给本镜像。 [从网址生成可编辑视频](../../../../docs/usage/function/tools-runner.md#website-video)

## 数据结构

| 镜像请求字段 | 取值                                                      |
| ------------ | --------------------------------------------------------- |
| `operation`  | 固定为 `video.render`                                     |
| `input`      | 必填。`/input` 下的 ZIP 文件名，包内必须有根 `index.html` |
| `output`     | 必填。`/output` 下的 MP4 文件名                           |
| `fps`        | 可选。24、25 或 30，默认 30                               |

`index.html` 的合成元素需声明 `data-composition-id`、`data-duration`、`data-width` 和 `data-height`。时长大于 0 且不超过 30 秒，`data-start` 省略或为 0。宽高为 16～1920 的偶数，总像素最多 1920 × 1080。ZIP 最多 256 个条目，解包后总计最多 100 MiB，单文件与产出的 MP4 各最多 50 MiB。使用工程内的本地相对路径引用资源。 [合成约束和示例](../README.md#渲染真实-html-动画视频)

镜像在校验视频编解码器、尺寸和时长后，通过 `data.artifact` 返回文件名和字节数。

## 开发测试

在仓库根目录运行协议与合成校验测试，并在真实镜像生成视频后用宿主的 FFprobe 检查输出。

```sh
python3 -B -m unittest discover -s packages/tools/jobs/tests -p test_media_jobs.py
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height:format=duration \
  -of json "$hai_job_work/intro-video/output/intro.mp4"
```

两秒示例应得到 H.264、640 × 360 的视频。打开实际画面确认动画和配音符合预期。 [真实媒体验收](../README.md#开发测试)

## 许可证

[Apache-2.0](../../../../LICENSE)
