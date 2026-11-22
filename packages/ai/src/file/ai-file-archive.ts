import type { Entry, ZipFile } from 'yauzl'
import { Buffer } from 'node:buffer'
import { fromBuffer } from 'yauzl'

/**
 * 核对 Word 容器结构、解压条目实际大小与总量。
 * @param content - 已限制上传大小的 DOCX 字节
 * @param maxEntries - 最大 ZIP 条目数
 * @param maxExpandedBytes - 最大解压字节数
 * @throws ZIP 格式、条目或限额检查失败时抛错
 * @example 模块内部上下文
 * ```ts
 * async function validateUpload(bytes: Uint8Array) {
 *   await verifyDocxArchive(bytes, 512, 24 * 1024 * 1024)
 * }
 * ```
 */
export async function verifyDocxArchive(content: Uint8Array, maxEntries: number, maxExpandedBytes: number): Promise<void> {
  const buffer = Buffer.from(content.buffer, content.byteOffset, content.byteLength)
  const archive = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error)
        reject(error)
      else
        resolve(zip)
    })
  })
  const names = new Set<string>()
  let expanded = 0
  try {
    if (archive.entryCount > maxEntries)
      throw new Error('Too many Word archive entries')
    await new Promise<void>((resolve, reject) => {
      archive.once('error', reject)
      archive.once('end', resolve)
      archive.on('entry', (entry: Entry) => {
        expanded += entry.uncompressedSize
        if (expanded > maxExpandedBytes || names.has(entry.fileName)) {
          reject(new Error('Invalid Word archive limits'))
          return
        }
        names.add(entry.fileName)
        if (entry.fileName.endsWith('/')) {
          if (entry.uncompressedSize === 0)
            archive.readEntry()
          else
            reject(new Error('Invalid Word archive directory'))
          return
        }
        // 逐项解压，让 yauzl 核对实际条目长度和 ZIP 声明一致。
        archive.openReadStream(entry, (error, stream) => {
          if (error) {
            reject(error)
            return
          }
          stream.once('error', reject)
          stream.once('end', () => archive.readEntry())
          stream.resume()
        })
      })
      archive.readEntry()
    })
    if (!names.has('[Content_Types].xml') || !names.has('word/document.xml'))
      throw new Error('Invalid Word archive structure')
  }
  finally {
    archive.close()
  }
}
