# @h-ai/cli Configuration

[Chinese source](cli.md) · [Data structures](../data/cli.en.md) · [API reference](../function/cli.en.md)

Use `hai.json` for persistent build and deployment settings. A command may override its own supported options. Put private overrides in dotenv local files.

## Configuration examples

```json
{
  "build": {
    "images": [{ "name": "serv", "context": ".", "dockerfile": "images/serv.Dockerfile", "containerPort": 3000 }],
    "sources": { "image": { "type": "official" }, "npm": { "type": "official" } },
    "proxy": { "mode": "inherit" }
  }
}
```

### Declare mobile and desktop projects

This is the root `hai.json`. Each path must point to an existing project with Capacitor or Tauri configuration. Declaring a path does not create a project. These settings are used when the corresponding build target is selected.

```json
{
  "build": {
    "app": ["apps/orders-app"],
    "desktop": ["apps/orders-desktop"]
  }
}
```

### Use a company npm registry for container builds

Keep the Dockerfile path used by your project. This sends npm downloads in container builds to the company registry and disables the proxy. It does not change the developer machine’s global npm configuration. The registry must be reachable from the build environment; keep credentials out of its URL.

```json
{
  "build": {
    "images": [{ "name": "serv", "context": ".", "dockerfile": "images/serv.Dockerfile", "containerPort": 3000 }],
    "sources": { "npm": { "type": "custom", "registry": "https://npm.example.com/" } },
    "proxy": { "mode": "none" }
  }
}
```

<a id="haijson"></a>

## Settings in `hai.json`

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `build.images` | Required | Required for container image builds. Each unique `name` is `serv` or `web`, with a required `dockerfile`, `context` defaulting to `.`, and optional `containerPort`. |
| `build.app`, `build.desktop` | Optional | Native Capacitor and Tauri project lists. |
| `build.sources.image.type`, `build.sources.npm.type` | `official` | Choose official, cn or custom. Custom requires `registries` or `registry` respectively. |
| `build.proxy.mode`, `url`, `bypass` | `inherit` | Inherit proxy variables, use system/custom/none, and set URL for custom. Bypass is optional. |
| `deploy` | `deploy.environment` | Select the target and environment. See the [deploy settings](deploy.en.md). |
| `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` | Optional | Inherited download proxy settings. Lowercase spellings are supported. |
| `PUBLIC_*`, `VITE_*`, `.env.<mode>.local`, `.env.local` | Optional | The first two can become public browser values. Keep credentials in private server variables. |
