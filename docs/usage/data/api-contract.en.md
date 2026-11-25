# @h-ai/api-contract Data Structures

[简体中文](api-contract.md) · [日本語](api-contract.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/api-contract.en.md) · [API reference](../function/api-contract.en.md)

An API contract defines HTTP operations and their request and response schemas in shared code. The server uses these definitions to implement endpoints. The client uses them to determine what to send and what to read. For example, a file detail page sends an object key and reads the file size, media type and last modification time.

## Data ownership

This module creates no database tables, cache keys or data files. Contract definitions are built with the application. The HTTP host and caller handle each request and response, while domain modules own the persistent records.

| Data | Owner and read path |
| --- | --- |
| Domains, operations and schemas | The shared contract code. The server registers implemented operations and the client derives input and output types from the same definitions. |
| HTTP messages | The server receives path parameters, query parameters and the body. The client reads the HTTP status, headers and body. The host controls log retention. |
| Users, sessions and permissions | IAM manages these records. Applications query them through authorized APIs. [IAM data structures](iam.en.md) |
| File content and object metadata | The Storage backend holds these records. Applications query metadata or obtain download URLs through the Storage API. [Storage data structures](storage.en.md) |
| Chats, payments and feedback | The configured AI storage, payment service and feedback service manage their own records. [AI](ai.en.md) · [Payment](payment.en.md) · [Feedback](feedback.en.md) |

## Contract metadata

A contract groups operations by domain and resource. Each leaf node describes one operation. The table uses `apiContract.iam.users.get` as an example.

| Metadata | Value in this operation | How it is used |
| --- | --- | --- |
| HTTP method | `GET` | Retrieves one user. |
| Path template | `/iam/users/{id}` | The caller supplies a path parameter such as `user-42` for `{id}`. The host configures its API prefix separately. |
| Operation ID | `iam.users.get` | Identifies the operation in generated OpenAPI. |
| Input schema | `IamUserIdInputSchema` | Accepts an object containing `id`. |
| Output schema | `apiContract.haiResultSchema(IamUserSchema.nullable())` | A successful lookup can return a user or `null`. A failure provides `error`. |

Declaring an operation, composing domains and reading a path each have their own entry point. [Declare a route](../function/api-contract.en.md#declare-routes) · [Compose domains](../function/api-contract.en.md#compose-domains) · [Read an operation path](../function/api-contract.en.md#read-route-path)

<a id="response-data"></a>

## Request and response data

<a id="example-data"></a>
<a id="business-data-promised-by-an-endpoint"></a>

### JSON requests and business results

Consider `POST /storage/files/metadata`, defined by `apiContract.storage.files.getMetadata`. The request body carries a `key` from a file record the application can access. The server checks the session and permission to read that object.

```json
{
  "key": "reports/summary.txt"
}
```

On success, `data` contains file metadata. `size` is in bytes and `lastModified` is an ISO date-time string in HTTP JSON. The sample omits the optional `etag` and `metadata`.

```json
{
  "success": true,
  "data": {
    "key": "reports/summary.txt",
    "size": 1200,
    "contentType": "text/plain",
    "lastModified": "2026-05-20T10:00:00.000Z"
  }
}
```

When access is denied, the body uses the `success: false` branch. The caller can use `error.code` to distinguish failures and `traceId`, when present, to match server logs. In this example, `httpStatus` expresses the status associated with the business error. The HTTP host determines the status on the wire.

```json
{
  "success": false,
  "error": {
    "code": "hai:common:101",
    "message": "Forbidden",
    "httpStatus": 403,
    "traceId": "request-42"
  }
}
```

| Structure | Fields and use |
| --- | --- |
| Successful `HaiResult<T>` | Read the declared `data` when `success: true`. Endpoints using `voidResultSchema` have no business data on success. For example, successful file deletion has the JSON body `{ "success": true }`. |
| Failed `HaiResult<T>` | Read `error` when `success: false`. |
| `HaiErrorSchema` | `code` is a string or number and `message` is a string. Optional fields are `traceId` (up to 128 characters), `httpStatus`, `system`, `module`, `cause`, `suggestion` and `ext`. The host controls which diagnostics appear in responses. |
| Other responses | Custom endpoints may declare a bare value or stream. Webhook acknowledgments follow the channel protocol. For example, a successful Alipay notification receives the plain text `success`. [Custom client responses](../function/api-client.en.md#custom-response-results) · [Alipay acknowledgment](../function/payment.en.md#alipay-notification-ack) |

<a id="paginated-data"></a>

### Paginated requests and results

Requests using `PaginationQuerySchema` accept the optional integers `page` (at least 1) and `pageSize` (1 to 100). Numeric values in a GET query string are coerced to numbers. The handler chooses defaults for omitted fields. Cursor-based endpoints such as the Storage file list use their own input and output schemas.

For example, an admin client with `iam.users.read` requests `GET /iam/users?page=1&pageSize=1`. The successful response carries the page under `data`.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "user-42",
        "username": "alice",
        "accountStatus": "active",
        "createdAt": "2026-05-20T10:00:00.000Z",
        "updatedAt": "2026-05-20T10:15:00.000Z"
      }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 1
  }
}
```

`items` contains this page's records, `total` counts all matches for the current filter, and `page` and `pageSize` report the page and size returned by the handler. The sample shows one user with two more available on later pages. For required IAM response dates, including `createdAt` and `updatedAt` for users, roles and permissions and `expiresAt` on an OTP response, the server schema accepts a valid `Date` or ISO date-time string with a time zone and rejects `null`. The client receives strings over HTTP JSON.

<a id="public-settings"></a>

### Public IAM settings response

A sign-in page can request the public sign-in, registration, CAPTCHA and display policies from `GET /auth/config`, defined by `apiContract.iam.auth.publicConfig`. The successful response carries these options under `data` as defined by `IamPublicConfigSchema`, or returns `null` in `data`. For example, an application can use `data.register.enabled` to decide whether to display a registration link. IAM checks the active policy when handling a registration request. [IAM configuration and defaults](../configuration/iam.en.md) · [Mount the IAM endpoints](../function/api-contract.en.md#serv-iam-wiring)
