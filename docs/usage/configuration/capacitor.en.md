# @h-ai/capacitor Configuration

[Chinese source](capacitor.md) · [Data structures](../data/capacitor.en.md) · [API reference](../function/capacitor.en.md)

Set `appId`, `appName` and the actual web output directory `webDir` in the native project. A physical device must be able to reach the API URL passed to the API client. `CAPACITOR_SERVER_URL` is optional for device development; ship synced assets in release builds.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `camera.takePhoto`: `source`, `quality`, `resultType` | `prompt`, `90`, `uri` | Select camera, album or prompt, quality from 0 to 100, and URI/Base64/Data URL output. |
| `camera.takePhoto`: `width`, `height` | Optional | Maximum dimensions in pixels. |
| `statusBar.configure`: `style`, `backgroundColor`, `overlay` | Optional | Preserve current settings when omitted. Use a hex color and choose whether to cover the WebView. |
| `push.register`, `push.listen`: `signal` | Optional | Cancel registration or remove listeners when aborted. |
| `push.listen`: `onReceived`, `onActionPerformed` | Optional | Callbacks for delivery and interaction. |
