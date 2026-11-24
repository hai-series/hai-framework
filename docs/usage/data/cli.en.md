# @h-ai/cli Data structures

[简体中文](cli.md) · [日本語](cli.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/cli.en.md) · [API reference](../function/cli.en.md)

After a build, CLI writes the version, source identity, and image list to `manifest.json`. Deployment uses that file to identify the artifacts being released.

<a id="files"></a>

## Files and artifacts

The CLI generates project files and builds artifacts. The modules enabled in the generated app own runtime tables and keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Project files | Source, workspace manifests, feature settings and resources under the chosen target directory. |
| `manifest.json` | Generated after a successful build. Records source identity and artifacts alongside the output. |
| Diagnostic bundle | Caller-selected file. See [Feedback](feedback.en.md) for evidence and export shape. |
| Deployment files | Archives and server release state belong to [Deploy](deploy.en.md). |

<a id="example-data"></a>

### App version and images in a build manifest

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
