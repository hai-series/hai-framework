# @h-ai/deploy API reference

<!-- translation: partial -->

[Chinese source](deploy.md) · [Configuration](../configuration/deploy.en.md) · [Data structures](../data/deploy.en.md)

## Quick start

Scan the app and generate a deployment plan before making remote changes. Validate artifact identity and target. Use the documented recovery flow if a remote command has an uncertain result.

```sh
# Read the prod settings and report the deployment plan without applying it. Invalid inputs produce a diagnostic.
pnpm run deploy --env prod --plan
# Build and deploy the current app for prod. Build, connection, or remote deployment failure exits nonzero.
pnpm run deploy --env prod --build
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success before reading data and returns the original failed result to its caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="delivery"></a>

### Scan and deliver applications: `deploy`

Scan requirements and artifacts before choosing a read-only plan, offline bundle or deployment. SDK and CLI share the same capabilities.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `deploy.init` | Prepare the configured deployment provider | `config` | `void` | `await deploy.init(config)` |
| `deploy.close` | Release deployment provider resources | None | `Promise<void>` | `await deploy.close()` |
| `deploy.scan` | Inspect a project and delivery target | `appDir, options?` | `ScanResult` | `await deploy.scan('./apps/orders', { environment: 'prod' })` |
| `deploy.provisionAll` | Provision selected middleware | `projectName, services?` | `ProvisionResult[]` | `await deploy.provisionAll('orders', ['db', 'cache'])` |
| `deploy.deployApp` | Deploy an app or produce a delivery bundle | `appDir, options?` | `DeployResult` | `await deploy.deployApp('./apps/orders', { environment: 'prod', bundleOnly: true })` |

#### Scenario: Scan and deliver applications

This is the caller’s delivery workflow. plan is read-only, build prepares artifacts, and deploy changes the target environment.

![Deployment: plan, delivery and recovery](../images/function-deploy-delivery.en.svg)

Review applications, middleware, variables and capacity before delivering verified artifacts. Startup or health failures use available recovery information; recovery can also fail and must be reported. Restoring images/configuration does not undo migrations or external business effects.

Supply a built project and its real deployment config. scan reads requirements; provisionAll provisions selected services and belongs after plan review. The quick-start --plan is read-only.

```ts
import type { DeployConfigInput } from '@h-ai/deploy'
import { deploy } from '@h-ai/deploy'

async function deliver(appDir: string, config: DeployConfigInput) {
  // Scan the supplied app directory using production config. Success reports the app and its middleware requirements. Return the failed result on failure.
  const scanResult = await deploy.scan(appDir, { environment: 'prod' })
  if (!scanResult.success)
    return scanResult
  const scan = scanResult.data
  // Initialize the deployment service with the supplied provider and credentials. Return the failed result on invalid config or failed initialization.
  const initResult = await deploy.init(config)
  if (!initResult.success)
    return initResult
  try {
    // Provision database and cache for orders. Success lists each provisioned resource. Return the failed result on a failed provisioning result.
    const provisionedResult = await deploy.provisionAll('orders', ['db', 'cache'])
    if (!provisionedResult.success)
      return provisionedResult
    const provisioned = provisionedResult.data
    // Package the supplied app for prod in offline bundle mode. Success contains its bundle path and instructions. Return the failed result on failure.
    const deliveredResult = await deploy.deployApp(appDir, { environment: 'prod', bundleOnly: true })
    if (!deliveredResult.success)
      return deliveredResult
    const delivered = deliveredResult.data
    return { scan, provisioned, delivered } // bundlePath/instructions do not imply remote readiness
  }
  finally {
    // Release deployment providers and resources opened by init. The promise resolves without data.
    await deploy.close()
  }
}
```

<a id="credentials"></a>

### Manage local private credentials: `deploy.credentials`

The deploy operator owns the private file. Display loaded names rather than credential values.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `deploy.credentials.getPath` | Locate local credentials | None | `string` | `deploy.credentials.getPath()` |
| `deploy.credentials.load` | Read local credentials | None | `HaiResult<string[]>` | `deploy.credentials.load()` |
| `deploy.credentials.save` | Save credentials for a target | `key, value` | `HaiResult<void>` | `deploy.credentials.save(key, secret)` |
| `deploy.credentials.saveAll` | Save the credential set | `entries` | `HaiResult<void>` | `deploy.credentials.saveAll(privateEntries)` |

#### Scenario: Manage local private credentials

```ts
// Fragment inside an async application function; return failed results to its caller.
// Read the current user's private credentials file path. This requires no initialized deployment provider.
const credentialPath = deploy.credentials.getPath() // operator-private path
// Load saved credentials for this process. Success lists loaded variable names. Return the failed result on a failed read.
const loadedNamesResult = deploy.credentials.load()
if (!loadedNamesResult.success)
  return loadedNamesResult
const loadedNames = loadedNamesResult.data // loaded environment variable names
// Save only credentials supplied securely by the operator:
function saveCredential(providerToken: string) {
  // Save the operator-supplied token under HAI_DEPLOY_PROVIDER_TOKEN. Return the failed result on persistence failure.
  const saveResult = deploy.credentials.save('HAI_DEPLOY_PROVIDER_TOKEN', providerToken)
  if (!saveResult.success)
    return saveResult
  // Save the same token using the batch API. Return the failed result if the credentials file cannot be updated.
  const saveAllResult = deploy.credentials.saveAll({ HAI_DEPLOY_PROVIDER_TOKEN: providerToken })
  if (!saveAllResult.success)
    return saveAllResult
}
```

Save inputs come from a secure channel; success has no business data. load returns loaded names only. The example contains no real secret.

[Detailed parameters and workflows](deploy.md#credentials)

<a id="environments"></a>

### Read, merge and save deployment variables: environment helpers

Read deployment and runtime files separately, merge by explicit precedence and save only the selected environment.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `loadDeploymentEnvironment` | Read deployment environment layers | 指定环境名、环境目录，可要求文件存在 | `HaiResult<DeploymentEnvironment>` | `loadDeploymentEnvironment({ environment: 'prod', envDir: './deployment', requireFile: true })` |
| `mergeEnvironmentLayers` | Merge environment layers by priority | 依优先顺序传入变量映射，可按前缀筛选 | 扁平变量映射 | `mergeEnvironmentLayers([workspaceValues, targetValues], 'HAI_CACHE')` |
| `loadDeploymentConfig` | Read target deployment configuration | 运行时模块名、配置文件路径、解析时使用的环境变量 | `HaiResult<Record<string, unknown>>` | `loadDeploymentConfig('cache', './config/_cache.yml', environment.values)` |
| `saveDeploymentEnvironment` | Save deployment environment variables | 已读取的部署环境、新变量、可选 private/replace 参数 | `HaiResult<string[]>` | `saveDeploymentEnvironment(environment, { HAI_DB_HOST: 'db' })` |
| `saveMiddlewareEnvironment` | Save middleware environment variables | 部署环境及包含应用路径、后端与配置的选项 | `HaiResult<string[]>` | `saveMiddlewareEnvironment(environment, { appDir: '.', requirement, backend: 'memory', configuration: { type: 'memory' } })` |

#### Scenario: Read, merge and save deployment variables: environment helpers

The operator selects the prod directory. Only run this after confirming it: load/merge read values and save returns written key names, without displaying secrets.

```ts
import type { MiddlewareRequirement } from '@h-ai/deploy'
import { loadDeploymentEnvironment, loadDeploymentConfig, mergeEnvironmentLayers, saveDeploymentEnvironment, saveMiddlewareEnvironment } from '@h-ai/deploy'

function updateEnvironment(envDir: string, appDir: string, requirement: MiddlewareRequirement) {
  // Load the required prod environment from envDir. Success contains the merged values and file information. Return the failed result if loading fails.
  const environmentResult = loadDeploymentEnvironment({ environment: 'prod', envDir, requireFile: true })
  if (!environmentResult.success)
    return environmentResult
  const environment = environmentResult.data
  // Merge the loaded values and select the later cache type override under the HAI_CACHE prefix.
  const values = mergeEnvironmentLayers([environment.values, { HAI_CACHE_TYPE: 'memory' }], 'HAI_CACHE')
  // Resolve this app's _cache.yml with those environment values. Success is a cache config object. Return the failed result on load or expansion failure.
  const configResult = loadDeploymentConfig('cache', `${appDir}/config/_cache.yml`, values)
  if (!configResult.success)
    return configResult
  const config = configResult.data
  // Write the memory override to the private production environment. Success lists written variable names. Return the failed result on failure.
  const writtenResult = saveDeploymentEnvironment(environment, { HAI_CACHE_TYPE: 'memory' }, { private: true })
  if (!writtenResult.success)
    return writtenResult
  const written = writtenResult.data
  // Save the given cache requirement as the memory backend for this app. Success lists updated names. Return the failed result if configuration cannot be written.
  const middlewareResult = saveMiddlewareEnvironment(environment, { appDir, requirement, backend: 'memory', configuration: { type: 'memory' } })
  if (!middlewareResult.success)
    return middlewareResult
  const middleware = middlewareResult.data
  return { config, written, middleware } // use the memory cache requirement from this app's scan
}
```

<a id="middleware-fields"></a>

### Validate middleware forms: deployment helpers

Check backend suitability, then convert form strings into actual booleans, ports and other typed fields.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `canKeepMiddleware` | Check whether middleware can be retained | 当前依赖需求、目录中选定的后端与目标环境 | 能否保留该中间件的 boolean | `canKeepMiddleware(requirement, backend, environment)` |
| `describeMiddlewareBackend` | Describe a middleware backend | 后端目录项，读取其 purpose | 本地化的功能说明 | `describeMiddlewareBackend(backend)` |
| `validateMiddlewareField` | Validate a middleware form field | 表单字符串、字段定义与后端名 | 校验是否通过的 boolean | `validateMiddlewareField({ value: '5432', field: { name: 'port', kind: 'port' }, backend: 'postgresql' })` |
| `parseMiddlewareField` | Parse a middleware form field | 表单字符串、字段定义与后端名，可声明托管模式 | `HaiResult<unknown>` | `parseMiddlewareField({ value: 'false', field: { name: 'secure', kind: 'boolean' }, backend: 'smtp' })` |

#### Scenario: Validate middleware forms: deployment helpers

```ts
// Keep imports at module scope; run the remaining fragment inside an async application function and return failures to its caller.
import { parseMiddlewareField, validateMiddlewareField } from '@h-ai/deploy'
// Check the PostgreSQL port field with input 5432. It is valid and returns true. Invalid ports return false.
validateMiddlewareField({ value: '5432', field: { name: 'port', kind: 'port' }, backend: 'postgresql' }) // true
// Parse SMTP secure from the string false. The result is the boolean false. Return the failed result if parsing fails.
const parseMiddlewareFieldResult = parseMiddlewareField({ value: 'false', field: { name: 'secure', kind: 'boolean' }, backend: 'smtp' })
if (!parseMiddlewareFieldResult.success)
  return parseMiddlewareFieldResult
parseMiddlewareFieldResult.data // false
```

String false produces successful boolean false. canKeepMiddleware returns suitability and describeMiddlewareBackend returns localized purpose for a supplied catalog entry.

[Detailed parameters and workflows](deploy.md#middleware-fields)

<a id="artifacts-recovery"></a>

### Check artifact identity and recovery: deployment helpers

Use a stable project identity and verify artifact digests. Inspect structured recovery information after failures.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `normalizeProjectName` | Normalize a project identifier | 应用名称 | 规范化的部署项目名 | `normalizeProjectName('@shop/orders')` |
| `artifactChecksum` | Compute a delivery artifact checksum | 现有镜像或交付产物路径 | `Promise<string>` | `await artifactChecksum('./serv.tar')` |
| `getDeployRecovery` | Read deployment recovery information | 部署失败的 `HaiError` | `DeployRecoveryInfo \| undefined` | `getDeployRecovery(result.error)`（在 `!result.success` 分支调用） |

#### Scenario: Check artifact identity and recovery: deployment helpers

Build this run’s artifact first; digest is its SHA-256. A failed receipt can contain recovery details; reading them neither performs recovery nor confirms unknown remote effects.

```ts
import { artifactChecksum, getDeployRecovery, normalizeProjectName } from '@h-ai/deploy'

async function inspectDelivery(appDir: string, artifactFile: string) {
  // Normalize the supplied scoped name to the deploy project identifier orders.
  const project = normalizeProjectName('@shop/orders') // 'orders'
  // Hash the existing artifact at the supplied path. Success is its SHA-256 digest. An unreadable path rejects.
  const digest = await artifactChecksum(artifactFile) // existing artifact; failures reject
  // Package the supplied app for prod without publishing. Success contains bundle details. On failure inspect recovery below.
  const delivered = await deploy.deployApp(appDir, { environment: 'prod', bundleOnly: true })
  if (!delivered.success)
    // Extract the recovery information attached to this deploy failure, when available.
    return { project, digest, error: delivered.error, recovery: getDeployRecovery(delivered.error) }
  return { project, digest, delivery: delivered.data }
}
```
