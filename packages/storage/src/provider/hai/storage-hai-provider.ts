/**
 * =============================================================================
 * @hai/storage - HAI Storage Provider
 * =============================================================================
 */

import { ok, err } from '@hai/core'
import type { Result } from '@hai/core'
import type {
    DirectoryProvider,
    FileMetadata,
    FileProvider,
    ListResult,
    LocalStorageOptions,
    MemoryStorageOptions,
    SignedUrlOptions,
    StorageDriver,
    StorageError,
    StorageServiceConfig,
    UrlProvider,
} from '../../storage-types.js'

// =============================================================================
// Memory Storage Driver
// =============================================================================

interface MemoryFile {
    data: Uint8Array
    metadata: FileMetadata
}

class MemoryStorageDriverImpl implements StorageDriver {
    readonly name = 'memory'
    private files = new Map<string, MemoryFile>()

    constructor(_options: MemoryStorageOptions = {}) { }

    async exists(path: string): Promise<Result<boolean, StorageError>> {
        return ok(this.files.has(this.normalizePath(path)))
    }

    async getMetadata(path: string): Promise<Result<FileMetadata, StorageError>> {
        const file = this.files.get(this.normalizePath(path))
        if (!file) return err({ type: 'NOT_FOUND', message: 'File not found', path })
        return ok(file.metadata)
    }

    async read(path: string): Promise<Result<Uint8Array, StorageError>> {
        const file = this.files.get(this.normalizePath(path))
        if (!file) return err({ type: 'NOT_FOUND', message: 'File not found', path })
        return ok(file.data)
    }

    async readText(path: string, encoding: BufferEncoding = 'utf8'): Promise<Result<string, StorageError>> {
        const result = await this.read(path)
        if (!result.success) return result
        return ok(new TextDecoder(encoding).decode(result.data))
    }

    async readJson<T>(path: string): Promise<Result<T, StorageError>> {
        const result = await this.readText(path)
        if (!result.success) return result
        try {
            return ok(JSON.parse(result.data) as T)
        } catch {
            return err({ type: 'IO_ERROR', message: 'Invalid JSON', path })
        }
    }

    async write(path: string, data: Uint8Array | string, options: any = {}): Promise<Result<FileMetadata, StorageError>> {
        const normalizedPath = this.normalizePath(path)
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        const now = new Date()
        const metadata: FileMetadata = {
            path: normalizedPath,
            name: normalizedPath.split('/').pop() || '',
            size: bytes.length,
            mimeType: options.contentType || 'application/octet-stream',
            createdAt: this.files.get(normalizedPath)?.metadata.createdAt || now,
            updatedAt: now,
        }
        this.files.set(normalizedPath, { data: bytes, metadata })
        return ok(metadata)
    }

    async writeJson(path: string, data: unknown, options: any = {}): Promise<Result<FileMetadata, StorageError>> {
        return this.write(path, JSON.stringify(data, null, 2), { ...options, contentType: 'application/json' })
    }

    async append(path: string, data: Uint8Array | string): Promise<Result<void, StorageError>> {
        const existing = await this.read(path)
        const newData = typeof data === 'string' ? new TextEncoder().encode(data) : data
        const combined = existing.success ? new Uint8Array([...existing.data, ...newData]) : newData
        await this.write(path, combined)
        return ok(undefined)
    }

    async delete(path: string): Promise<Result<void, StorageError>> {
        this.files.delete(this.normalizePath(path))
        return ok(undefined)
    }

    async copy(source: string, destination: string): Promise<Result<FileMetadata, StorageError>> {
        const file = this.files.get(this.normalizePath(source))
        if (!file) return err({ type: 'NOT_FOUND', message: 'Source not found', path: source })
        return this.write(destination, file.data)
    }

    async move(source: string, destination: string): Promise<Result<FileMetadata, StorageError>> {
        const result = await this.copy(source, destination)
        if (result.success) await this.delete(source)
        return result
    }

    async list(path: string, _options?: any): Promise<Result<ListResult, StorageError>> {
        const prefix = this.normalizePath(path)
        const files: FileMetadata[] = []
        for (const [key, file] of this.files) {
            if (key.startsWith(prefix)) files.push(file.metadata)
        }
        return ok({ files, directories: [], hasMore: false })
    }

    async createDirectory(_path: string): Promise<Result<void, StorageError>> {
        return ok(undefined)
    }

    async deleteDirectory(path: string, recursive = false): Promise<Result<void, StorageError>> {
        if (recursive) {
            const prefix = this.normalizePath(path)
            for (const key of this.files.keys()) {
                if (key.startsWith(prefix)) this.files.delete(key)
            }
        }
        return ok(undefined)
    }

    private normalizePath(path: string): string {
        return path.replace(/^\/+/, '').replace(/\/+$/, '')
    }
}

// =============================================================================
// Local Storage Driver
// =============================================================================

class LocalStorageDriverImpl implements StorageDriver {
    readonly name = 'local'
    private root: string

    constructor(options: LocalStorageOptions) {
        this.root = options.root
    }

    private getFullPath(path: string): string {
        return `${this.root}/${path}`.replace(/\/+/g, '/')
    }

    async exists(path: string): Promise<Result<boolean, StorageError>> {
        const fs = await import('node:fs/promises')
        try {
            await fs.access(this.getFullPath(path))
            return ok(true)
        } catch {
            return ok(false)
        }
    }

    async getMetadata(path: string): Promise<Result<FileMetadata, StorageError>> {
        const fs = await import('node:fs/promises')
        try {
            const fullPath = this.getFullPath(path)
            const stat = await fs.stat(fullPath)
            return ok({
                path,
                name: path.split('/').pop() || '',
                size: stat.size,
                mimeType: 'application/octet-stream',
                createdAt: stat.birthtime,
                updatedAt: stat.mtime,
            })
        } catch {
            return err({ type: 'NOT_FOUND', message: 'File not found', path })
        }
    }

    async read(path: string): Promise<Result<Uint8Array, StorageError>> {
        const fs = await import('node:fs/promises')
        try {
            const data = await fs.readFile(this.getFullPath(path))
            return ok(new Uint8Array(data))
        } catch {
            return err({ type: 'NOT_FOUND', message: 'File not found', path })
        }
    }

    async readText(path: string, encoding: BufferEncoding = 'utf8'): Promise<Result<string, StorageError>> {
        const fs = await import('node:fs/promises')
        try {
            const data = await fs.readFile(this.getFullPath(path), encoding)
            return ok(data)
        } catch {
            return err({ type: 'NOT_FOUND', message: 'File not found', path })
        }
    }

    async readJson<T>(path: string): Promise<Result<T, StorageError>> {
        const result = await this.readText(path)
        if (!result.success) return result
        try {
            return ok(JSON.parse(result.data) as T)
        } catch {
            return err({ type: 'IO_ERROR', message: 'Invalid JSON', path })
        }
    }

    async write(path: string, data: Uint8Array | string, _options?: any): Promise<Result<FileMetadata, StorageError>> {
        const fs = await import('node:fs/promises')
        const nodePath = await import('node:path')
        const fullPath = this.getFullPath(path)
        await fs.mkdir(nodePath.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, data)
        return this.getMetadata(path)
    }

    async writeJson(path: string, data: unknown, _options?: any): Promise<Result<FileMetadata, StorageError>> {
        return this.write(path, JSON.stringify(data, null, 2))
    }

    async append(path: string, data: Uint8Array | string): Promise<Result<void, StorageError>> {
        const fs = await import('node:fs/promises')
        await fs.appendFile(this.getFullPath(path), data)
        return ok(undefined)
    }

    async delete(path: string): Promise<Result<void, StorageError>> {
        const fs = await import('node:fs/promises')
        try {
            await fs.unlink(this.getFullPath(path))
            return ok(undefined)
        } catch {
            return err({ type: 'NOT_FOUND', message: 'File not found', path })
        }
    }

    async copy(source: string, destination: string): Promise<Result<FileMetadata, StorageError>> {
        const fs = await import('node:fs/promises')
        await fs.copyFile(this.getFullPath(source), this.getFullPath(destination))
        return this.getMetadata(destination)
    }

    async move(source: string, destination: string): Promise<Result<FileMetadata, StorageError>> {
        const fs = await import('node:fs/promises')
        await fs.rename(this.getFullPath(source), this.getFullPath(destination))
        return this.getMetadata(destination)
    }

    async list(path: string, _options?: any): Promise<Result<ListResult, StorageError>> {
        const fs = await import('node:fs/promises')
        try {
            const entries = await fs.readdir(this.getFullPath(path), { withFileTypes: true })
            const files: FileMetadata[] = []
            for (const entry of entries) {
                if (entry.isFile()) {
                    const result = await this.getMetadata(`${path}/${entry.name}`)
                    if (result.success) files.push(result.data)
                }
            }
            return ok({ files, directories: [], hasMore: false })
        } catch {
            return ok({ files: [], directories: [], hasMore: false })
        }
    }

    async createDirectory(path: string): Promise<Result<void, StorageError>> {
        const fs = await import('node:fs/promises')
        await fs.mkdir(this.getFullPath(path), { recursive: true })
        return ok(undefined)
    }

    async deleteDirectory(path: string, recursive = false): Promise<Result<void, StorageError>> {
        const fs = await import('node:fs/promises')
        await fs.rm(this.getFullPath(path), { recursive })
        return ok(undefined)
    }
}

// =============================================================================
// Provider 工厂
// =============================================================================

export function createHaiFileProvider(driver: StorageDriver): FileProvider {
    return {
        exists: (path) => driver.exists(path),
        getMetadata: (path) => driver.getMetadata(path),
        read: (path, options) => driver.read(path, options),
        readText: (path, encoding) => driver.readText(path, encoding),
        readJson: (path) => driver.readJson(path),
        write: (path, data, options) => driver.write(path, data, options),
        writeJson: (path, data, options) => driver.writeJson(path, data, options),
        append: (path, data) => driver.append(path, data),
        delete: (path) => driver.delete(path),
        copy: (source, dest, options) => driver.copy(source, dest, options),
        move: (source, dest, options) => driver.move(source, dest, options),
    }
}

export function createHaiDirectoryProvider(driver: StorageDriver): DirectoryProvider {
    return {
        list: (path, options) => driver.list(path, options),
        create: (path) => driver.createDirectory(path),
        delete: (path, recursive) => driver.deleteDirectory(path, recursive),
    }
}

export function createHaiUrlProvider(driver: StorageDriver): UrlProvider {
    return {
        async getSignedUrl(path: string, _options: SignedUrlOptions) {
            if (driver.getSignedUrl) {
                return driver.getSignedUrl(path, _options)
            }
            return err({ type: 'IO_ERROR', message: 'Signed URLs not supported', path })
        },
        getPublicUrl(path: string) {
            return path
        },
    }
}

export function createHaiStorageDriver(config: StorageServiceConfig): StorageDriver {
    switch (config.driver) {
        case 'local':
            return new LocalStorageDriverImpl(config.options as LocalStorageOptions)
        case 'memory':
            return new MemoryStorageDriverImpl(config.options as MemoryStorageOptions)
        default:
            throw new Error(`Unsupported storage driver: ${config.driver}`)
    }
}
