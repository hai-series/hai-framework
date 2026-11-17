# @h-ai/crypto Data structures

[Chinese source](crypto.md) · [Configuration](../configuration/crypto.en.md) · [API reference](../function/crypto.en.md)

Long-term key ownership belongs to the application. The transport registry stores temporary client public keys and replay protection records.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_crypto_transport_client_keys` | Primary key `client_id`, SM2 `public_key`, `created_at_ms`, nullable `expires_at_ms`. |
| `hai_crypto_transport_requests` | Unique `request_key` is a JSON pair of client and request ID. `expires_at` is in milliseconds. |
| `hai_crypto_transport_capacity` | Single row `id=1`, `max_clients=10000`, `revision=0` initially. Shared across service instances. |
| `hai:crypto:transport:client:<clientId>` | Redis registry for a client SM2 public key. |
| `hai:crypto:transport:request:<clientId>:<requestId>` | Expiring replay marker with value `true`. |
