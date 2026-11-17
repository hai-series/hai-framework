# @h-ai/ui Data structures

[Chinese source](ui.md) · [Configuration](../configuration/ui.en.md) · [API reference](../function/ui.en.md)

UI keeps current form state in the component. The host owns persistence, authorization and conflict detection for submitted forms, tools and artifacts. During SSR, keep state request-local.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `theme` | localStorage theme ID. Custom bootstrap can store JSON with `themeId`, optional color and locale. Fallback is `light` unless the app specifies a value. |
| `hai-locale` | Stored locale. Change the key via `persistKey`. Missing values follow the app and browser preference. |
| `<persistKey>:<scope>:<id>` | Guide progress per application scope and tour. Default key is `hai-guide`, default backend is cookies. |
| `<persistKey>-pending` | sessionStorage record for recovering a guide after navigation. |
| Component preferences / コンポーネント設定 | Application-defined keys for preferences such as column widths. Use in-memory fallback when storage is unavailable. |

ArtifactWorkspace keeps drafts, version lists and conflicts in its instance. ToolWorkspace keeps the current form, polling timer and abort signal. The host owns versions, receipts and execution state.
