/**
 * =============================================================================
 * H5 App - 拍照识图历史 API
 * =============================================================================
 */

import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'

interface VisionRow {
  id: string
  storage_key: string
  file_name: string
  mime_type: string
  prompt: string | null
  analysis: string
  tags_json: string
  confidence: number
  created_at: number
}

export const GET = kit.handler(async () => {
  const rowsResult = await reldb.sql.query<VisionRow>(
    `SELECT id, storage_key, file_name, mime_type, prompt, analysis, tags_json, confidence, created_at
     FROM vision_records
     ORDER BY created_at DESC
     LIMIT 20`,
  )

  if (!rowsResult.success) {
    return kit.response.internalError('Query history failed')
  }

  return kit.response.ok(
    rowsResult.data.map(row => ({
      id: row.id,
      key: row.storage_key,
      imageUrl: storage.presign.publicUrl(row.storage_key),
      fileName: row.file_name,
      mimeType: row.mime_type,
      prompt: row.prompt,
      analysis: row.analysis,
      tags: (() => {
        try {
          const parsed = JSON.parse(row.tags_json) as unknown
          return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
        }
        catch {
          return []
        }
      })(),
      confidence: row.confidence,
      createdAt: row.created_at,
    })),
  )
})
