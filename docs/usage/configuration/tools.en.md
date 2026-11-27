# @h-ai/tools Configuration

<a id="h-aitools-file-configuration"></a>

[简体中文](tools.md) · [日本語](tools.ja.md)

[Configuration index](README.en.md) · [API reference](../function/tools.en.md) · [Data structures](../data/tools.en.md)

<a id="configuration-fields"></a>

## Configuration entry

The application passes options directly to Tools factories. Use `tools.define()` for the input schema, handler, and timeout. Set `authorize` when creating a registry with `tools.createRegistry()`. For artifact tools, pass the trusted principal and host file callbacks to the Node entry. [Call options](../function/tools.en.md#call-options) · [Artifact example](../function/tools.en.md#artifact-example)

Applications can read tool options from their own configuration and refresh factories through their normal loading flow. The host configures durable execution, database access, and container mappings.

<a id="local-service"></a>
<a id="job-environments"></a>

See [Tools Runner configuration](tools-runner.en.md) for service selection and container environments.
