# @h-ai/api-contract Data structures

[Chinese source](api-contract.md) · [Configuration](../configuration/api-contract.en.md) · [API reference](../function/api-contract.en.md)

The contract stores endpoint metadata in code. Database columns, cache values and sessions belong to the business modules. A request schema default only fills omitted request fields.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Endpoint / エンドポイント | HTTP method, route template, path and query parameters, request and response schemas. |
| `HaiResult<T>` | Discriminated success value or failure error object. |
