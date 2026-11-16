# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

An object storage module with a unified `storage` entry point for S3-compatible storage and local filesystems.

## Quick Start

### Node.js server

Pass validated S3 or local settings and the PNG bytes to `storeImage`. This example owns the full connection lifecycle. Long-running services initialize storage at startup and close it at shutdown.

```ts
import type { FileMetadata, StorageConfigInput } from '@h-ai/storage'
import type { Buffer } from 'node:buffer'
import { storage } from '@h-ai/storage'

export async function storeImage(config: StorageConfigInput, imageBuffer: Uint8Array) {
  // Select one backend and check the initialization result.
  const initialized = await storage.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)

  let result: { metadata: FileMetadata, bytes: Buffer, downloadUrl?: string }
  let closed
  try {
    const key = 'uploads/image.png'
    // Write the PNG bytes at the object key and read the resulting object metadata.
    const uploaded = await storage.file.put(key, imageBuffer, { contentType: 'image/png' })
    if (!uploaded.success)
      throw new Error(uploaded.error.message)

    // Read the same key to obtain the contents as a Buffer.
    const downloaded = await storage.file.get(key)
    if (!downloaded.success)
      throw new Error(downloaded.error.message)

    result = { metadata: uploaded.data, bytes: downloaded.data }
    if (config.type === 's3') {
      // On S3, issue a download URL valid for 3,600 seconds.
      const signed = await storage.presign.getUrl(key, { expiresIn: 3600 })
      if (!signed.success)
        throw new Error(signed.error.message)
      result.downloadUrl = signed.data
    }
  }
  finally {
    // Release the connection and let the caller handle any failure.
    closed = await storage.close()
  }
  if (!closed.success)
    throw new Error(closed.error.message)
  return result
}
```

### Browser client

The browser uses an initialized `apiClient` to obtain an S3 upload URL. Pass a key authorized by your application and the user-selected `File` to `uploadImage`.

```ts
import { apiClient } from '@h-ai/api-client'
import { uploadWithPresignedUrl } from '@h-ai/storage/client'

export async function uploadImage(key: string, file: File) {
  // Use the same Content-Type for signing and uploading.
  const contentType = file.type || 'application/octet-stream'
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // Upload directly to object storage and return the object key confirmed by the server.
  const uploaded = await uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

> Note: `@h-ai/storage` does not include HTTP routes. Implement the signed URL API in the application layer.

## Configuration Reference

Generated projects define the local directory or the connection settings for S3-compatible storage in `config/_storage.yml`. At startup, the application reads the file and passes the settings object to `storage.init(config)`.

See the [configuration reference](../../docs/usage/configuration/storage.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/storage.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `storage.init` / `storage.close` / `storage.config` / `storage.isInitialized` — Select a local directory or S3-compatible storage, check connection status, and release resources at shutdown
- `storage.file` / `storage.dir` / `storage.checksum` / `storage.presign` — Read or write files, list directories, verify checksums, and generate time-limited access links for S3 objects
- `@h-ai/storage/client` / `@h-ai/storage/schemas` — Upload, download and validate keys in browsers

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/storage.md) in Chinese for local files and S3 objects, keys, metadata and retention.

## Development and Testing

```bash
pnpm --filter @h-ai/storage test
```

S3 integration tests require Docker or a compatible runtime. The same initialization, file, directory, presigning, and real HTTP upload/download cases run against both MinIO and RustFS; container startup failures are not skipped.

- MinIO: [`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio), a community image built from upstream source.
- RustFS: [`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs), the official image.

Containers use temporary test credentials. Buckets are created through the S3 API after service readiness; containers and anonymous volumes are removed when the final lease is released.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package storage`; compiling examples does not replace backend behavior tests.

For the real Chrome regression gate, install Chrome, set `HAI_STORAGE_RUN_BROWSER_GATES=1`, then run `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts`. It sends actual HTTP PUT requests and checks native cancellation and listener cleanup; a missing browser fails the gate.

## License

Apache-2.0
