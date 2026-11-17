# @h-ai/payment API reference

<!-- translation: partial -->

[Chinese source](payment.md) · [Configuration](../configuration/payment.en.md) · [Data structures](../data/payment.en.md)

<a id="quick-start"></a>

Initialize Payment before creating orders. Validate amounts and authorize operations in application code. Treat provider callbacks and query results as inputs to the app’s own order state machine.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `payment.createOrder`, `queryOrder` | Create provider payment parameters, or query current provider status. | `await payment.queryOrder(provider, orderNo)` |
| `payment.refund`, `closeOrder` | Request a refund or close a still-open order. Inspect the returned result. | `await payment.refund(provider, refundRequest)` |
| `payment.handleNotify` | Verify and parse a provider notification using its original request body and headers. | `await payment.handleNotify(provider, body, headers)` |
| `payment.getProvider`, `registerProvider` | Get an available provider or register a provider before use. | `payment.getProvider(provider)` |

Additional options and workflow examples are available in the [Chinese reference](payment.md).
