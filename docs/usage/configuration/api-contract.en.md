# @h-ai/api-contract Configuration

<a id="h-aiapi-contract-file-configuration"></a>

[简体中文](api-contract.md) · [日本語](api-contract.ja.md)

<a id="configuration-fields"></a>

## Configuration entry

Applications declare HTTP operations and compose domains in shared TypeScript code. This module has no YAML file or environment variables of its own. The application reads its own feature switches to select domains to mount, and the client uses the corresponding contract. After changing a shared definition, rebuild and deploy the server and client that use it. [Declare a route](../function/api-contract.en.md#declare-routes) · [Compose domains](../function/api-contract.en.md#compose-domains)

## Settings owned by consumers

| Setting | Where it is read and configured |
| --- | --- |
| Serv API prefix and documentation routes | The Serv application reads settings such as `http.apiPrefix` at startup. With a prefix of `/api/v1`, the contract route `/iam/users/{id}` is mounted at `/api/v1/iam/users/{id}`. [Serv configuration](serv.en.md) |
| Kit routes and request policy | SvelteKit maps route files to paths. The application configures Kit's request policy on the server. [Kit configuration](kit.en.md) |
| Typed client API address | The application passes the address, including its mount prefix, to `client.init({ baseUrl })`. A same-origin browser example is `/api/v1`. [API Client configuration](api-client.en.md) |
| Sign-in, registration and CAPTCHA policies | IAM reads server configuration and generates the public policy. [IAM configuration](iam.en.md) · [Public response data](../data/api-contract.en.md#public-settings) |
