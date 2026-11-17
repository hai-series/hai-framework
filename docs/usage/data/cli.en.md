# @h-ai/cli Data structures

[Chinese source](cli.md) · [Configuration](../configuration/cli.en.md) · [API reference](../function/cli.en.md)

The CLI generates project files and builds artifacts. The modules enabled in the generated app own runtime tables and keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Project / プロジェクト | Source, workspace manifests, feature settings and resources under the chosen target directory. |
| `manifest.json` | Generated after a successful build. Records source identity and artifacts alongside the output. |
| Diagnostic bundle / 診断バンドル | Caller-selected file. See [Feedback](feedback.md) for evidence and export shape. |
| Deploy / デプロイ | Archives and server release state belong to [Deploy](deploy.md). |
