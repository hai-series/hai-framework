# Datapipe data

[Data reference](README.en.md) · [Datapipe options](../configuration/datapipe.en.md) · [Datapipe APIs](../function/datapipe.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Cleaned and split text

Structure: `PipelineResult`.

Clean input and split it into smaller pieces for retrieval or model input. Datapipe returns the result without storing it.

```json
{
  "text": "abcdef",
  "chunks": [
    {
      "index": 0,
      "content": "abc"
    },
    {
      "index": 1,
      "content": "cde"
    },
    {
      "index": 2,
      "content": "ef"
    }
  ]
}
```

With three characters per chunk and one repeated character, abcdef becomes abc, cde, ef. index starts at zero.

## Field, storage and cleanup reference

### Database and cache

Datapipe creates no SQL tables, Redis keys, or disk cache. A call returns the processed text or chunks. The application can save them in a [knowledge base](ai.md) or its own storage.

### Input and output

Text, chunks, and metadata used during processing live in the current invocation. The application can keep returned content and any source information it has, such as the URL, file name, or content type. For deduplication or history across calls, store, compare, and clean up results in the application.
