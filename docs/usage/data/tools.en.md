# @h-ai/tools Data Structures

[简体中文](tools.md) · [日本語](tools.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/tools.en.md) · [API reference](../function/tools.en.md)

The registry keeps tool definitions in the current process. When a tool needs files, the host manages their bytes, permissions, and versions.

<a id="runtime-data"></a>

## In-process data

Registered tools live in the current process. Call `registry.getNames()` to see the available names. Process exit or `registry.clear()` clears those registrations.

| Data | Who stores it | When it is used |
| --- | --- | --- |
| Tool implementations, parameter schemas, titles, presets, and groups | The application assembles these on each process | Tools builds the catalog, validates inputs, and calls handlers |
| Enabled tools and permissions | The application's server configuration and authorization system | The host supplies a policy that checks the caller and validated input during direct execution |
| File bytes, ownership, versions, and retention | The host's file store and business service | The host reads and writes files for the current principal and checks permissions and versions at publication or save time |

<a id="artifact-access"></a>

## Artifact access contract

When tools need files, the host implements `ToolArtifactAccess`. The host can use [Storage](storage.en.md) or an existing application file store. If multiple nodes share tasks, each node needs access to the same stored files.

| Host callback | Data and permissions |
| --- | --- |
| `read(context, { id })` | Check that the current principal can read the file. Return `id/name/mediaType/data` and optionally `kind/version` |
| `publish(context, { name, kind, mediaType, data, id? })` | Check permission to publish, save bytes, and return an artifact reference. Tools can supply a stable ID. For example, `artifact_create` derives one from a trusted execution ID. The host handles deduplication and retention |
| `publishBatch(context, [table, chart])` | Optional. Commit the table and chart together, then return both references in order. If the commit fails, neither new artifact is visible. Provide this callback to enable `data_analyze`. |
| `save(context, { id, baseVersion, content })` | Optional. Check ownership and the base version before saving new content. The host returns any version conflict |

<a id="artifact-storage"></a>

### Where files are stored

The example registry uses `files.publish` to put bytes into an in-memory `Map` and `files.read` to retrieve them by ID. The files disappear when the process exits. In an application, the host connects both callbacks to its storage and authorization checks. [Example registry](../function/tools.en.md#artifact-setup)

The Agent workspace loads Storage settings from `config/_storage.yml`. The default `type: local` writes bytes to `./data/uploads` relative to the service's working directory. `HAI_STORAGE_ROOT` can set a different root directory. Agent's `.env.prod` selects `s3`, which writes bytes to the S3-compatible bucket configured by `HAI_STORAGE_BUCKET`. Agent keeps file records in `hai_agent_resources` and version records with object keys and checksums in `hai_agent_resource_versions`. A read checks ownership, then uses the version's object key to retrieve the content. [Local and S3 storage configuration](../configuration/storage.en.md)

### Reference a generated file or page

A successful `artifact_create` call returns a reference, as shown in the Markdown example below. The `id` identifies the file in the host's library. If the host provides `files.save`, pass the `version` you read as `baseVersion` to `artifact_save`. On a successful save, Agent keeps the file's ID and increments its version. If a newer version exists, Agent returns a version conflict. [Markdown example](../function/tools.en.md#artifact-example)

```json
{
  "id": "artifact-1",
  "title": "Project notes",
  "kind": "markdown",
  "version": 1,
  "mediaType": "text/markdown"
}
```

<a id="runtime-tasks"></a>
<a id="example-data"></a>
<a id="tool-events"></a>
<a id="size-and-retention"></a>

For a durable tool service, see [job receipts, events, and retention](tools-runner.en.md#runtime-tasks).
