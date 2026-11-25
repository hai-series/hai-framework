# @h-ai/api-contract Configuration

<a id="h-aiapi-contract-file-configuration"></a>

[Chinese](api-contract.md) · [日本語](api-contract.ja.md)

<a id="configuration-fields"></a>

## Configuration entry

This module has no standalone configuration file. The application selects the API contracts to compose in code. The server builds the policy used by the sign-in page from its IAM configuration, including CAPTCHA and enabled sign-in methods. Change those policies in the [IAM configuration](iam.en.md) loaded by the server.

See arguments, defaults and examples in [Public settings response](../data/api-contract.en.md#public-settings).
