# @h-ai/api-contract Data structures

[Chinese source](api-contract.md) · [Configuration](../configuration/api-contract.en.md) · [API reference](../function/api-contract.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Business data promised by an endpoint

Structure: `HaiResult<T>`.

A contract defines the successful endpoint fields so server and client agree.

```json
{
  "success": true,
  "data": {
    "id": "order-42",
    "totalCents": 1200
  }
}
```

The sample returns order-42 with totalCents:1200 in minor currency units; it is not a full database row.

### Policy visible to a sign-in page

Structure: `IamPublicConfig`.

The server exposes safe policy so the page can choose sign-in, registration and CAPTCHA controls.

```json
{
  "captcha": {
    "enabled": false
  },
  "register": {
    "enabled": true
  },
  "login": {
    "password": true,
    "otp": false,
    "ldap": false,
    "email": true,
    "sms": false
  },
  "session": {
    "maxAge": 86400,
    "endOnPageHide": false
  }
}
```

Registration and password login are enabled; CAPTCHA is off. This excerpt excludes secrets and does not replace server-side enforcement.

## Field, storage and cleanup reference

The contract stores endpoint metadata in code. Database columns, cache values and sessions belong to the business modules. A request schema default only fills omitted request fields.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Endpoint / エンドポイント | HTTP method, route template, path and query parameters, request and response schemas. |
| `HaiResult<T>` | Discriminated success value or failure error object. |

<a id="public-settings"></a>

### Public settings response

The contract is application code. Put shared endpoint schemas in the contract package and pass selected domains to `apiContract.create()`. The public IAM response contains settings needed by the form.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `captcha` | `{ enabled: false }` | Whether to display and submit a CAPTCHA proof. |
| `reauthentication`, `initialCredentials` | Optional | Visible operations that require reauthentication and initial credential options. |
| `password`, `register`, `login` | Required | Public password rules, registration toggle, and allowed login methods. |
| `passwordReset`, `otp` | Required | Reset toggle and channel, OTP length and resend interval. |
| `agreements`, `ui` | Required | Terms and privacy copy or URL, and card/split appearance. |
| `session.maxAge`, `session.endOnPageHide` | `endOnPageHide: false` | Public session lifetime and opt-in page-exit policy. |
