# @h-ai/cli API reference

<!-- translation: partial -->

[Chinese source](cli.md) · [Configuration](../configuration/cli.en.md) · [Data structures](../data/cli.en.md)

<a id="quick-start"></a>

## Quick start

Install the CLI with `pnpm add -g @h-ai/cli`, then scaffold an application. Commands exit nonzero on failure.

```sh
pnpm view @h-ai/cli@latest version # 查询注册表，输出最新已发布版本。
pnpm add -g @h-ai/cli@latest # 将该 CLI 安装到 pnpm 的全局目录。
hai --version # 确认当前 PATH 实际调用的 CLI 版本。
hai create my-app --type fullstack --frontends web # 输入应用名、模板和前端目标，生成 my-app。
cd my-app # 进入刚生成的工程目录。
pnpm dev # 启动项目声明的开发服务，终端输出本地访问地址。
```

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `hai create`, `hai add`, `hai init` | Create an app, add a capability, or fill missing configuration and AI entry files. | `hai create orders --type admin --defaults` |
| `hai generate` (`g`), `g:page`, `g:component`, `g:api`, `g:model` | Generate named files. Select a target with `--workspace` when needed. Existing files are protected by default. | `hai g:api orders --workspace orders-serv` |
| `hai build` | Compile by default, or request image, mobile or desktop artifacts. Image builds support machine-readable output. | `hai build --target image --json` |
| `hai deploy` | Select a target environment. Plan, package or deploy an application and return the corresponding result. | `hai deploy --env prod --plan` |
| `hai upgrade` | Inspect migration differences for an exact published release. | `hai upgrade TARGET_VERSION` |
| `hai feedback` | Inspect a local diagnostic bundle and filter evidence. | `hai feedback summary feedback.zip` |
| `hai --version`, `hai --help` | Show the CLI version or command usage. | `hai deploy --help` |

Still untranslated: the detailed command options and environment preparation examples. Read the [Chinese source section](cli.md#api-reference).
