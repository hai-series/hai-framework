# Datapipe data

[Data reference](README.en.md) · [Datapipe options](../configuration/datapipe.en.md) · [Datapipe APIs](../function/datapipe.en.md)

<a id="example-data"></a>

## What these records are for

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

### Heading metadata on Markdown chunks

This is `data` from a successful `datapipe.chunk` call. The source is `# Q\r\nabcdef`, with Markdown mode, a maximum of four code points per chunk, and heading text omitted from the chunk bodies.

```json
[
  { "index": 0, "content": "abcd", "metadata": { "title": "Q", "level": 1, "subChunk": true } },
  { "index": 1, "content": "ef", "metadata": { "title": "Q", "level": 1, "subChunk": true } }
]
```

Both chunks belong to the level 1 heading `Q`. `subChunk` indicates that the section produced multiple chunks and is omitted for a single chunk. Text before any heading has an empty title and level `0`.

## Field, storage and cleanup reference

### Database and cache

Datapipe creates no SQL tables, Redis keys, or disk cache. A call returns the processed text or chunks. The application can save them in a [knowledge base](ai.md) or its own storage.

### Input and output

`PipelineResult.text` contains the text after all steps. `chunks` comes from the most recent chunk step and can be changed by subsequent chunk transforms. The calling application can associate its own source URL, file name, or content type with the result and manage deduplication and history across calls.
