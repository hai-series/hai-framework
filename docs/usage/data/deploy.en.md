# @h-ai/deploy Data structures

[Chinese source](deploy.md) · [Configuration](../configuration/deploy.en.md) · [API reference](../function/deploy.en.md)

<a id="files"></a>

## Files and ownership

Deploy does not create SQL tables or Redis keys. Build artifacts are local until published. The target server owns deployed releases; cloud-managed resources are tracked by the cloud provider.

| Field or table | Shape and meaning |
| --- | --- |
| Build `manifest.json` | Artifact type, application and build IDs, image/file list and digests. |
| Archive `manifest.json` | Target and build metadata packaged with `apply.sh`, `config/`, `images/` and `.hai/`. |
| `.hai/SHA256SUMS` | Per-file SHA-256 sums verified before applying a release. |
| `<root>/releases/<id>/` | Directory per deployment ID, containing Compose files and runtime configuration. |
| `<root>/.deploy.lock` | One deployment process per root. The process unlocks on exit; deleting the file manually can break mutual exclusion. |
| `<root>/steps-<id>.jsonl` | One row per stage, with `stage`, `status`, and `durationSeconds`. |
| `<root>/result-<id>.json` | Final outcome; can be read after a connection drops. |
| Target runtime config | May contain application or connection credentials. Manage it with the release and restrict access on the target host. |

Deployment state tracks the release procedure. Business data stays in the application database or object store.
