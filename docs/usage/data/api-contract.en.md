# @h-ai/api-contract Data Structures

[简体中文](api-contract.md) · [日本語](api-contract.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/api-contract.en.md) · [API reference](../function/api-contract.en.md)

A login form uses the contract to know which fields to send and reads allowed sign-in methods from the public settings response. Endpoint definitions ship with application code. The relevant modules persist sessions and business records.

<a id="response-data"></a>

## Request and response data

The contract stores endpoint metadata in code. Database columns, cache values and sessions belong to the business modules. A request schema default only fills omitted request fields.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Endpoint | HTTP method, route template, path and query parameters, request and response schemas. |
| `HaiResult<T>` | Discriminated success value or failure error object. |

<a id="example-data"></a>

### Business data promised by an endpoint

After calling `POST /auth/otp/send` from `apiContract.iam.auth.sendOtp`, the sign-in form uses the expiry from the successful response. The HTTP JSON body carries a UTC date-time string.

```json
{
  "success": true,
  "data": {
    "expiresAt": "2026-05-20T10:05:00.000Z"
  }
}
```

In this example the server accepted the send request and the code expires at 10:05 UTC. The OTP sign-in endpoint still asks IAM to verify the code entered by the user.

The `createdAt` and `updatedAt` fields on users, roles and permissions, and `expiresAt` on an OTP response are required dates. The Zod schemas accept valid `Date` objects or ISO date-time strings with a time zone. `null` fails validation. The server sends ISO strings in JSON, and API Client preserves those strings after validation. Use `null` in the separate nullable `accountExpiresAt` field on user updates to clear the expiry.

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
| `session` | Required | Public session lifetime in `maxAge` seconds and `endOnPageHide`, which defaults to `false`. |
| `session.maxAge`, `session.endOnPageHide` | `endOnPageHide: false` | Public session lifetime and opt-in page-exit policy. |

<a id="policy-visible-to-a-sign-in-page"></a>

#### Example · Policy visible to a sign-in page

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
