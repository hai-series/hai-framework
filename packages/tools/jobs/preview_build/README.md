# 网页项目预览镜像

`preview_build` 将支持的静态前端项目 ZIP 编译成一个自包含 HTML 文件。比如开发人员上传包含 `index.html`、入口模块和 CSS 的小型页面，应用就能把预览交给已有的隔离网页查看器。 [Dockerfile](Dockerfile)

## 快速开始

在 Linux 的 rootless Podman 环境中，从仓库根目录载入 `build_hai_job` 和 `run_hai_job`。将根目录含 `index.html` 的项目 ZIP 放在仓库根目录，命名为 `site.zip`。也可以用共享示例打包，得到 `$hai_job_work/input/site.zip` 后从 `run_hai_job` 开始。 [共享命令](../README.md#quick-start) · [生成示例项目](../README.md#构建多文件网页预览)

```bash
build_hai_job preview_build
cp -- ./site.zip "$hai_job_work/input/site.zip"
run_hai_job preview_build site-preview <<'JSON'
{"operation":"preview.build","input":"site.zip","output":"preview.html"}
JSON
```

确认 `$hai_job_work/site-preview/response.json` 中的 `success` 为 `true`。使用自己的样例项目时，可以打开同目录 `output/preview.html` 核对样式和内容。共享示例会显示 `Release checklist`。

## 配置清单

构建容器在 `offline` 网络中运行。镜像携带固定的 esbuild、Svelte、parse5 和 acorn，直接编译受支持的本地源码和素材。项目的依赖安装和应用运行脚本属于上游构建流程。 [固定依赖版本](package.json) · [共享资源配置](../README.md#配置)

## 功能说明

应用在 Runner 登记 `preview.build` 能力，把离线环境 ID 传给 `toolsRunner.createJobTools()` 的 `environments.preview`，在工具服务中启用 `preview_build`。上传 ZIP 后，宿主把获准读取的文件 ID 作为 `fileId`。示例中的 `service` 已完成装配，`context` 来自服务端认证。 [应用内预览接入](../../../../docs/usage/function/tools-runner.md#web-preview)

```ts
const preview = await service.invoke({
  name: 'preview_build',
  input: { fileId }
}, context)
if (!preview.success)
  throw new Error(preview.error.message)
```

成功结果的 `data.artifacts[0]` 指向宿主保存的 `text/html` 文件。应用按 ID 读取正文，再在隔离的预览界面展示。更新项目后提交新的 ZIP 即可生成新预览。

## 数据结构

| 镜像请求字段 | 取值                                                      |
| ------------ | --------------------------------------------------------- |
| `operation`  | 固定为 `preview.build`                                    |
| `input`      | 必填。`/input` 下的 ZIP 文件名，包内必须有根 `index.html` |
| `output`     | 必填。`/output` 下的 HTML 文件名                          |

ZIP 最多 256 个条目，解包后总计最多 8 MiB，单个源码文件与生成的 HTML 各最多 1 MiB。构建最多 60 秒。支持本地 JS、TS、JSX、TSX、JSON 和 CSS 等模块，以及可编译的 Svelte 浏览器组件。将站点素材一并放进 ZIP。对于 SvelteKit 应用或需要自定义构建插件和 npm 依赖的项目，先通过项目自身的流程准备静态页面。 [项目约束和示例](../README.md#构建多文件网页预览)

镜像成功时在 `data.artifact` 返回文件名和字节数。缺少根 `index.html` 返回 `INVALID_PROJECT`，不支持的依赖或资源返回 `UNSUPPORTED_PROJECT`。

## 开发测试

在仓库根目录运行 Python 测试，检查 ZIP 路径校验、本地依赖解析与产物边界。

```sh
python3 -B -m unittest discover -s packages/tools/jobs/tests -p test_preview_build.py
```

完成镜像构建后，使用快速开始生成 HTML，并打开两份实际使用的页面样例核对脚本、样式和资源。 [开发测试](../README.md#开发测试)

## 许可证

[Apache-2.0](../../../../LICENSE)
