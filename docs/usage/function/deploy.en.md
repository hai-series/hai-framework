# @h-ai/deploy API reference

<!-- translation: partial -->

[Chinese source](deploy.md) · [Configuration](../configuration/deploy.en.md) · [Data structures](../data/deploy.en.md)

<a id="quick-start"></a>

Scan the app and generate a deployment plan before making remote changes. Validate artifact identity and target. Use the documented recovery flow if a remote command has an uncertain result.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `deploy.scan`, `provisionAll`, `deployApp` | Read project structure, provision selected services, or deploy the selected provider configuration. | `await deploy.scan(appDir)` |
| `deploy.credentials.getPath`, `load`, `save`, `saveAll` | Find or read credential files and persist provider credentials for later runs. | `deploy.credentials.getPath(environment)` |
| `hai deploy --plan`, `--build`, `--services`, `--artifact-dir`, `--bundle-only` | Inspect the plan, build for deployment, select services, reuse an artifact, or produce a standalone bundle. | `hai deploy --env staging --plan` |

Additional options and workflow examples are available in the [Chinese reference](deploy.md).
