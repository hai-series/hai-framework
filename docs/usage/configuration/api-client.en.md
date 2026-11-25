# @h-ai/api-client Configuration

<a id="h-aiapi-client-file-configuration"></a>

[Chinese](api-client.md) · [日本語](api-client.ja.md)

<a id="configuration-fields"></a>

## Configuration entry

This module has no standalone configuration file. At startup, the application passes the API address, authentication mode and transport options to `apiClient.init(config)`. The application reads any environment variables for those values. When browsers use a refresh cookie, the server also enables `serv.createApp({ iam, refreshCookie: {} })`. See [Serv application setup](../function/serv.en.md#host-options) for the server options.

See arguments, defaults and examples in [Call arguments and integration options](../function/api-client.en.md#call-options).
