# Crypto configuration files

[Chinese](crypto.md) · [日本語](crypto.ja.md)

[Configuration handbook](README.en.md)

Crypto has no standalone `config/_crypto.yml`; `crypto.init()` takes no file configuration. Algorithm options, transport-manager parameters and registry TTL/quotas are code arguments documented in [call options](../function/crypto.en.md#call-options).

HTTP file settings belong to `config/_serv.yml` and `config/_kit.yml`; see [Serv](serv.en.md) and [Kit](kit.en.md). Cache backend file settings belong to [Cache](cache.en.md). Trusted server startup injects private keys; never place them in public configuration.
