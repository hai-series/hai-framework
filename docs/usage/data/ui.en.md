# @h-ai/ui Data structures

[Chinese source](ui.md) · [Configuration](../configuration/ui.en.md) · [API reference](../function/ui.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Remember the selected theme

Structure: `theme`.

Remember the theme across page visits.

```json
"dark"
```

dark selects the dark theme in localStorage with no automatic expiry. Its CSS must still be included.

### Remember the selected language

Structure: `hai-locale`.

Remember the preferred language when reopening a page.

```json
"zh-CN"
```

zh-CN selects Simplified Chinese; the application must actually include that translation.

### Remember a completed tour

Structure: `hai-guide:orders:intro`.

Avoid showing an already completed tour on every visit.

```json
{
  "version": 1,
  "status": "completed",
  "updatedAt": 1794873600000
}
```

Version 1 of intro in orders is complete. Cookie storage is the default; a new tour version may show again. updatedAt dates the progress update.

### Resume a tour after navigation

Structure: `hai-guide-pending`.

Temporarily save the intended tour before navigation and check it on the destination page.

```json
{
  "id": "intro",
  "scope": "orders",
  "route": "/orders",
  "createdAt": 1794873600000
}
```

Start intro for orders at /orders, only within five minutes and with matching scope/route. It is not completed progress.

## Field, storage and cleanup reference

UI keeps current form state in the component. The host owns persistence, authorization and conflict detection for submitted forms, tools and artifacts. During SSR, keep state request-local.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `theme` | localStorage theme ID. Custom bootstrap can store JSON with `themeId`, optional color and locale. Fallback is `light` unless the app specifies a value. |
| `hai-locale` | Stored locale. Change the key via `persistKey`. Missing values follow the app and browser preference. |
| `<persistKey>:<scope>:<id>` | Guide progress per application scope and tour. Default key is `hai-guide`, default backend is cookies. |
| `<persistKey>-pending` | sessionStorage record for recovering a guide after navigation. |
| Component preferences / コンポーネント設定 | Application-defined keys for preferences such as column widths. Use in-memory fallback when storage is unavailable. |

ArtifactWorkspace keeps drafts, version lists and conflicts in its instance. ToolWorkspace keeps the current form, polling timer and abort signal. The host owns versions, receipts and execution state.
