# @h-ai/deploy API reference

<!-- translation: partial -->

[Chinese source](deploy.md) · [Configuration](../configuration/deploy.en.md) · [Data structures](../data/deploy.en.md)

<a id="quick-start"></a>

## Quick start

Scan the app and generate a deployment plan before making remote changes. Validate artifact identity and target. Use the documented recovery flow if a remote command has an uncertain result.

```sh
pnpm run deploy --env prod --plan
pnpm run deploy --env prod --build
```

<a id="api-reference"></a>

## API list

Deployment and credential operations with HaiResult require a success check. Keep credential values private.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `deploy.init` | Prepare the configured deployment provider | `config` | `void` | `await deploy.init(config)` |
| `deploy.close` | Release deployment provider resources | None | `Promise<void>` | `await deploy.close()` |
| `deploy.scan` | Inspect an application and its deployment materials | `appDir, options?` | `ScanResult` | `await deploy.scan('./apps/orders', { environment: 'prod' })` |
| `deploy.provisionAll` | Prepare selected infrastructure services | `projectName, services?` | `ProvisionResult[]` | `await deploy.provisionAll('orders', ['db', 'cache'])` |
| `deploy.deployApp` | Build a bundle or deploy to the configured target | `appDir, options?` | `DeployResult` | `await deploy.deployApp('./apps/orders', { environment: 'prod', bundleOnly: true })` |
| `deploy.credentials.getPath` | Read the local credentials file path | None | `string` | `deploy.credentials.getPath()` |
| `deploy.credentials.load` | Load private values and return the loaded variable names | None | `HaiResult<string[]>` | `deploy.credentials.load()` |
| `deploy.credentials.save` | Save one credential | `key, value` | `HaiResult<void>` | `deploy.credentials.save(key, secret)` |
| `deploy.credentials.saveAll` | Save supplied private credentials together | `entries` | `HaiResult<void>` | `deploy.credentials.saveAll(privateEntries)` |

With bundleOnly, inspect the build package before deployment; this call does not update the target host.

Still untranslated: direct versus offline deployment and failure recovery. Read the [Chinese source section](deploy.md#detailed-workflow).
