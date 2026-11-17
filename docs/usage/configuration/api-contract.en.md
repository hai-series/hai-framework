# @h-ai/api-contract Configuration

[Chinese source](api-contract.md) · [Data structures](../data/api-contract.en.md) · [API reference](../function/api-contract.en.md)

The contract is application code. Put shared endpoint schemas in the contract package and pass selected domains to `apiContract.create()`. The public IAM response contains settings needed by the form.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `apiContract.create(domains)` | Required | Mapping of domain names to contracts. Use `false` to exclude a domain. |
| `captcha` | `{ enabled: false }` | Whether to display and submit a CAPTCHA proof. |
| `reauthentication`, `initialCredentials` | Optional | Visible operations that require reauthentication and initial credential options. |
| `password`, `register`, `login` | Required | Public password rules, registration toggle, and allowed login methods. |
| `passwordReset`, `otp` | Required | Reset toggle and channel, OTP length and resend interval. |
| `agreements`, `ui` | Required | Terms and privacy copy or URL, and card/split appearance. |
| `session.maxAge`, `session.endOnPageHide` | `endOnPageHide: false` | Public session lifetime and opt-in page-exit policy. |
