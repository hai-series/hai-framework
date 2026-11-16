# Datapipe data

[Data reference](README.en.md) · [Datapipe options](../configuration/datapipe.en.md) · [Datapipe APIs](../function/datapipe.en.md)

## Database and cache

Datapipe creates no SQL tables, Redis keys, or disk cache. A call returns the processed text or chunks. The application can save them in a [knowledge base](ai.md) or its own storage.

## Input and output

Text, chunks, and metadata used during processing live in the current invocation. The application can keep returned content and any source information it has, such as the URL, file name, or content type. For deduplication or history across calls, store, compare, and clean up results in the application.
