# @h-ai/deploy Data structures

[Chinese source](deploy.md) · [Configuration](../configuration/deploy.en.md) · [API reference](../function/deploy.en.md)

<a id="example-data"></a>

## What these records are for

### Verify the deployment artifact

Structure: `manifest.json`.

A bundle manifest lets deployment verify the expected app and build.

```json
{
  "version": 5,
  "primaryService": "serv",
  "appVersion": "1.0.0",
  "buildId": "example-20261117",
  "partial": false
}
```

example-20261117 identifies the build. Real bundles also need images, checksums and metadata; editing text alone cannot create an artifact.

### Inspect deployment progress

Structure: `steps-<id>.jsonl`.

Append one line per deployment step so progress survives a disconnected session.

```json
{
  "stage": "health",
  "status": "passed",
  "durationSeconds": 2
}
```

The health step passed in two seconds. This alone does not prove deployment success; check the final result.

### What is known after interruption

Structure: `DeployCommandState`.

After a command error, report what stopped and what remains unknown before retrying.

```json
{
  "reason": "timeout",
  "localTermination": "confirmed",
  "remoteExecution": "unknown",
  "deploymentId": "deploy-orders-42",
  "resultFile": "/opt/hai/apps/orders/result-deploy-orders-42.json"
}
```

The local process ended, but the remote outcome is unknown. Inspect the matching resultFile first.

### The deployment’s final outcome

Structure: `result-<id>.json`.

The script writes a final result so a disconnected caller can verify the same deployment ID.

```json
{
  "deploymentId": "deploy-orders-42",
  "stage": "complete",
  "exitCode": 0,
  "durationSeconds": 42,
  "recoveryStatus": "not-needed"
}
```

deploy-orders-42 completed with exit code 0 in 42 seconds, with no recovery needed. This is not a statement about business-data changes.

A CLI receipt with `schemaVersion: 1` contains `artifactDir`, `manifestPath`, and the v5 manifest. The private bundle’s `deploymentTarget` records the project, remote directory, engine and Docker mode, listener and port, and external HTTPS address. The bundle digest covers the target and deployment ID. Successful verification includes `proof.deploymentId` and each running role’s `imageId` and `archiveSha256`. These are the SHA-256 of the image configuration and the entire image tar, respectively. Docker containerd uses the running container’s platform manifest to find the configuration. The caller persists the bundle receipt and verification outcome.

## Field, storage and cleanup reference

<a id="files"></a>

### Files and ownership

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
