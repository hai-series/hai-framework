# @h-ai/cli API reference

<!-- translation: partial -->

[Chinese source](cli.md) · [Configuration](../configuration/cli.en.md) · [Data structures](../data/cli.en.md)

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

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

<a id="projects"></a>

### Create and extend projects: `hai create/add/init`

Choose a template for new projects, add modules or missing configuration to existing ones, and run from the application root.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `hai create [name]` | Create an application | 用 `--type` 选模板。省略名称或类型时询问，`--defaults` 采用默认值。默认安装依赖、初始化 Git 并准备部署工具 | Project files and startup instructions | `hai create orders --type admin --defaults` |
| `hai add [module]` | Add a framework module | 模块名省略时询问。默认安装依赖，可加 `--no-install` | Dependencies, settings and skills | `hai add ai` |
| `hai init` | Fill missing project configuration | 默认保留已有文件，`--force` 可以重建模块配置 | Missing settings and AI entry files | `hai init` |

#### Scenario: Create and extend projects

```sh
hai create demo-app --type website --defaults --no-install --no-git
cd demo-app
hai add ai --no-install
hai init
```

Inputs select demo-app, website and the ai module. Outputs are project, module settings and skills. Installation and Git initialization are disabled in this example; init preserves existing files by default.

<a id="command-options"></a>

#### Common command options

| Option | Default | Meaning |
| --- | --- | --- |
| `--yes` | Optional | Skip source selection. Without settings, use official sources. |

`hai deploy --env prod` selects `.env.prod` and the matching deployment environment.

[Detailed parameters and workflows](cli.md#projects)

<a id="scaffolding"></a>

### Generate business scaffolds: `hai generate`

Generate pages, components, HTTP routes or models by business name, selecting a workspace explicitly when needed.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `hai generate [type] [name]` 或 `hai g` | Generate source files | 类型和名称可交互选择。多 workspace 工程用 `--workspace`；默认保护已有文件 | Source files; existing files protected by default | `hai generate api orders --workspace orders-serv` |
| `hai g:page <name>` | Generate a page | 页面名必填，按需设 `--workspace` | Page source | `hai g:page orders` |
| `hai g:component <name>` | Generate a component | 组件名必填，按需设 `--workspace` | Component source | `hai g:component OrderList` |
| `hai g:api <name>` | Generate an HTTP entry | 名称必填，按需设 `--workspace` 选择应用或服务 | Contract/handler source | `hai g:api orders --workspace orders-serv` |
| `hai g:model <name>` | Generate a model | 名称必填，按需设 `--workspace` | Model source | `hai g:model order` |

#### Scenario: Generate business scaffolds

```sh
hai generate page dashboard
hai g:page orders
hai g:component OrderList
hai g:api orders --workspace orders-serv
hai g:model order
```

Each name produces source files for its template. Generated files still need authorization and business implementation; existing files follow overwrite protection.

[Detailed parameters and workflows](cli.md#scaffolding)

<a id="builds"></a>

### Compile and package apps: `hai build`

Select the build target, then produce compiled output, container archives or native packages.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `hai build` | Compile or package the app | --target defaults to compile; image/app/desktop need their build tools | Artifacts; image --json emits build metadata | `hai build --target image --json` |

#### Scenario: Compile and package apps

```sh
hai build --target compile
hai build --target image --json
```

The first produces compiled files; the second needs a container engine and produces image archives plus JSON metadata. Native targets need their SDK and signing prerequisites.

[Detailed parameters and workflows](cli.md#builds)

<a id="deployments"></a>

### Plan and deliver: `hai deploy`

Inspect the environment plan before choosing direct deployment or an offline bundle.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `hai deploy [appDir]` | Plan, bundle or deploy | 目录默认由当前工程确定。需选择或传入 `--env`。制品、服务及环境文件可单独指定 | Plan JSON, bundle files or a deployment receipt | `hai deploy --env prod --plan` |

#### Scenario: Plan and deliver

```sh
hai deploy --env prod --plan
```

The input is prod; output is plan JSON. --plan performs no deployment. Delivery and recovery prerequisites follow below.

[Detailed parameters and workflows](cli.md#deployments)

<a id="diagnostics"></a>

### Inspect help, upgrades and diagnostics: `hai`

Confirm the active CLI and options, use an exact published version for upgrade checks and inspect diagnostic bundles locally.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `hai upgrade <version>` | Inspect an exact release | 填写已发布的精确版本，目录默认当前工程 | Dependency/configuration/skill difference report | `hai upgrade TARGET_VERSION` |
| `hai feedback <action> <bundle>` | Read an offline diagnostic bundle | 操作和 ZIP 路径必填，`evidence` 可按请求、错误及时间范围过滤 | Summary, evidence page or local viewer URL | `hai feedback summary feedback.zip` |
| `hai --version`、`hai --help` | Show version or help | 也可用 `hai <command> --help` | Version/options text | `hai deploy --help` |

#### Scenario: Inspect help, upgrades and diagnostics

```sh
hai --version
hai --help
hai deploy --help
hai feedback summary feedback.zip
```

Help and version print text; summary reads an existing ZIP and prints a digest. Replace upgrade’s placeholder with an exact registry version to produce dependency, configuration and skill differences.

[Detailed parameters and workflows](cli.md#diagnostics)
