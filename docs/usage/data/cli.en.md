# @h-ai/cli Data structures

[Chinese source](cli.md) · [Configuration](../configuration/cli.en.md) · [API reference](../function/cli.en.md)

<a id="example-data"></a>

## What these records are for

### App version and images in a build manifest

Structure: `manifest.json (DeploymentArtifact)`.

The build writes a manifest so deployment can verify app version, build identity and images.

```json
{
  "version": 5,
  "primaryService": "serv",
  "appVersion": "1.0.0",
  "buildId": "example-20261117",
  "source": {
    "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "dirty": false
  },
  "partial": false,
  "hasWeb": false,
  "images": []
}
```

The primary service is serv at app version 1.0.0. Only identity is shown; empty images is an omission, not a deployable artifact.

## Field, storage and cleanup reference

The CLI generates project files and builds artifacts. The modules enabled in the generated app own runtime tables and keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Project / プロジェクト | Source, workspace manifests, feature settings and resources under the chosen target directory. |
| `manifest.json` | Generated after a successful build. Records source identity and artifacts alongside the output. |
| Diagnostic bundle / 診断バンドル | Caller-selected file. See [Feedback](feedback.md) for evidence and export shape. |
| Deploy / デプロイ | Archives and server release state belong to [Deploy](deploy.md). |
