# @h-ai/cli Configuration

[Chinese source](cli.md) · [Data structures](../data/cli.en.md) · [API reference](../function/cli.en.md)

Use `hai.json` for persistent build and deployment settings. A command may override its own supported options. Put private overrides in dotenv local files.

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
