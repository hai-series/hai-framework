# @h-ai/tools-runner Configuration

[简体中文](tools-runner.md) · [日本語](tools-runner.ja.md)

[Module README](../../../packages/tools-runner/README.en.md) · [Data ownership](../data/tools-runner.en.md) · [API reference](../function/tools-runner.en.md)

<a id="configuration-fields"></a>

## Configuration entry

Pass Tools settings to its factories in application code. Tools has no YAML file or environment variables of its own. An application can read its own configuration file and pass the selected tools to Tools. The application decides where to read that file, which sources take precedence, and when to reload it.

| What to configure | Where to set it | Who uses it |
| --- | --- | --- |
| Which tools the service offers and who can run them | `toolsRunner.createService(...)` in server code. The application supplies `createTools`, `enabled`, and `authorize` | Tools builds the enabled catalog and checks permissions at submission and execution |
| Where tasks are saved and which process runs them | Configure RelDB at startup, then set the Runner `nodeId`, execution role, and capacity | RelDB connects to the database. Runner stores, claims, and runs tasks |
| Container images, network policy, and resource limits | Runner's `environments`. Bind the environment ID to the tool in application code | Runner provides the container. The tool uses file access authorized by the host |

The application derives `scope` from authentication and passes it to the service separately from the tool input. For example, `{ tenantId: 'demo', userId: 'alice' }` identifies Alice in the demo tenant. `createTools` and `enabled` determine what appears in the catalog. Filter them by context for a per-user catalog. `authorize` checks execution permissions, and the host checks file access when reading or writing. See [call options](../function/tools.en.md#call-options) and the [service factory](../function/tools-runner.en.md#services) for defaults and arguments.

<a id="local-service"></a>

## Run a local addition service

1. In the application's startup code, open a local SQLite database with RelDB, then start Runner. Give Runner a `nodeId` and use its default executor role to process tasks in the same process. The addition function runs in Node. RelDB and Runner provide persistence and scheduling. [RelDB connection settings](reldb.en.md#configuration-fields) · [Runner node settings](runner.en.md#configuration-fields)
2. Create a Tools service with ID `sum-demo` and pass it the running Runner. Include the `sum` function in the tool set returned by `createTools` and set `enabled: { tools: ['sum'] }`. Use the trusted context to check whether Alice can run it. When `sum` appears in the catalog, submit `{ a: 2, b: 3 }` and check the receipt until you see `5`. [Complete addition service example](../function/tools-runner.en.md#service-example) · [Example receipt and result](../data/tools-runner.en.md#example-data)
3. At application shutdown, close the Tools service to unregister its handler, then close Runner. Keep the RelDB connection open until Runner has closed. [Runner shutdown](../function/runner.en.md#nodes)

For an immediate call in the current process, create a registry with `tools.createRegistry()`. It works without Runner or persistent tasks. [Lightweight registry](../function/tools.en.md#registry)

<a id="job-environments"></a>

## Add a job that uses a container

To build an HTML preview from a ZIP, register a Runner environment named `preview-local` with a pinned image, the `preview.build` capability, resource limits, and the `offline` network policy. In application code, pass `environments: { preview: 'preview-local' }` to `toolsRunner.createJobTools(...)` and enable `preview_build`. Once the tool appears in the catalog, submit a ZIP reference authorized by the host and check the result for the generated artifact. Verify it with the actual image, permissions, and network settings of your deployment. [Runner container settings](runner.en.md#configuration-fields) · [Tools job environments and factory](../function/tools-runner.en.md#job-tools) · [Job image and resource examples in Chinese](../../../packages/tools/jobs/README.md#配置)

Browser screenshots and web capture also need an internal network and a deployment-controlled `browserProxy`. The host passes the proxy to the job factory. See [job environment options](../function/tools-runner.en.md#job-tools) for browser network requirements and the proxy address format.
