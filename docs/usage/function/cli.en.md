# @h-ai/cli API reference

<!-- translation: partial -->

[Chinese source](cli.md) · [Configuration](../configuration/cli.en.md) · [Data structures](../data/cli.en.md)

<a id="quick-start"></a>

Install the CLI with `pnpm add -g @h-ai/cli`, then scaffold an application. Commands exit nonzero on failure.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `hai create`, `hai add`, `hai init` | Create an app, add a capability, or fill missing configuration and AI entry files. | `hai create orders --type admin --defaults` |
| `hai generate` (`g`), `g:page`, `g:component`, `g:api`, `g:model` | Generate named files. Select a target with `--workspace` when needed. Existing files are protected by default. | `hai g:api orders --workspace orders-serv` |
| `hai build` | Compile by default, or request image, mobile or desktop artifacts. Image builds support machine-readable output. | `hai build --target image --json` |
| `hai deploy` | Select a target environment. Plan, package or deploy an application and return the corresponding result. | `hai deploy --env prod --plan` |
| `hai upgrade` | Inspect migration differences for an exact published release. | `hai upgrade TARGET_VERSION` |
| `hai feedback` | Inspect a local diagnostic bundle and filter evidence. | `hai feedback summary feedback.zip` |
| `hai --version`, `hai --help` | Show the CLI version or command usage. | `hai deploy --help` |

Additional options and workflow examples are available in the [Chinese reference](cli.md).
