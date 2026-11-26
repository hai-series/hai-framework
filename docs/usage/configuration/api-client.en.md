# @h-ai/api-client Configuration

<a id="h-aiapi-client-file-configuration"></a>

[简体中文](api-client.md) · [日本語](api-client.ja.md)

[Configuration index](README.en.md) · [API reference](../function/api-client.en.md) · [Data structures](../data/api-client.en.md)

<a id="configuration-fields"></a>

## Configuration entry

`@h-ai/api-client` has no configuration file or environment variable prefix of its own. The application reads its runtime settings, selects credential storage and transport, and passes those values to `apiClient.init(config)` or an independent instance's `client.init(config)`. The application controls precedence and when changes take effect. See [call options](../function/api-client.en.md#call-options) for the initialization arguments, requirements, and defaults.

See [browser session refresh](../function/api-client.en.md#browser-refresh) and [same-user recovery](../function/api-client.en.md#recover-session) for complete authentication options and callbacks.

<a id="configuration-sources"></a>

## Configuration owners

| Setting | Who provides it | What to check |
| --- | --- | --- |
| API address | Frontend or runtime configuration provides `baseUrl`. | For a same-origin browser deployment, use a root-relative path such as `/api/v1`. Use an absolute HTTP(S) URL in Node.js and native runtimes without a browser origin. Include the API mount prefix and omit user information, query strings, and fragments. |
| Refresh credentials | The client selects `auth.storage`. In cookie mode, the server sets, rotates, and clears the HttpOnly cookie. | Omitting `auth` disables automatic authentication. Passing `auth: {}` selects browser cookie mode by default. For cross-origin deployment, verify the specific allowed origin, credential settings, and cookie attributes on the server. |
| Application-layer encryption | The client supplies an initialized Crypto instance. The server manages private keys, the key exchange route, and encryption policy. | Omitting client `transport` disables application-layer encryption. When enabled, the URL formed by the origin of `baseUrl` and client `transport.keyExchangePath` must match the server's exchange endpoint. |

Serv can load its API prefix and transport settings from the application's `config/_serv.yml`. The startup code passes them to `serv.createApp`. For browser refresh cookies, also supply an initialized `iam` and `refreshCookie` in that call. See [Serv configuration](serv.en.md), [host options](../function/serv.en.md#host-options), and [Serv authentication and cookies](../function/serv.en.md#authentication).

In a Kit application, SvelteKit routes determine the mount path, Kit's server-side authentication handles cookies, and `kit.createHandle` integrates transport encryption. See [Kit configuration](kit.en.md), [Kit authentication](../function/kit.en.md#auth), and [Kit transport encryption](../function/kit.en.md#transport).

<a id="mobile-api-base-example"></a>

## Configuration example

The repository's `mobile-app` uses `PUBLIC_API_BASE` to select the API service during local development. If the service is at `http://localhost:3000/api/v1`, add this line to `apps/mobile-app/.env.local`. To use a different service, set the protocol, host, port, and API prefix to an address the client can reach. See the [mobile-app environment template](../../../apps/mobile-app/.env.example).

```dotenv
PUBLIC_API_BASE='http://localhost:3000/api/v1'
```

Start the API service, then run `pnpm --filter mobile-app dev`. See the [api-service quick start](../../../apps/api-service/README.md#快速开始) to start the service from this repository. The application uses the injected runtime `apiBase` first, then `PUBLIC_API_BASE` from Vite, and falls back to `http://localhost:3000/api/v1` when both are empty. Restart the development server after editing the environment file. Open `/auth/login` on the development site. In the browser's Network panel, check that the public authentication configuration request goes to `http://localhost:3000/api/v1/auth/config`. Clients can see this address. Keep server credentials in the server environment. See [mobile-app client initialization](../../../apps/mobile-app/src/lib/api.ts).
