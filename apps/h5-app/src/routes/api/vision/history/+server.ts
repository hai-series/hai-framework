/**
 * =============================================================================
 * H5 App - 拍照识图历史 API
 * =============================================================================
 */

import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'
import { ownedImageUrl } from '#lib/server/storage-access.js'

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

export const GET = kit.handler(async ({ locals }) => {
  const userId = locals.session?.userId
  if (!userId)
    return kit.response.unauthorized()
  const rowsResult = await reldb.sql.query<VisionRow>(
    `SELECT id, storage_key, file_name, mime_type, prompt, analysis, tags_json, confidence, created_at
     FROM vision_records
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId],
  )

  if (!rowsResult.success) {
    return kit.response.internalError('Query history failed')
  }

  return kit.response.ok(
    rowsResult.data.map(row => ({
      id: row.id,
      key: row.storage_key,
      imageUrl: ownedImageUrl(row.storage_key),
      fileName: row.file_name,
      mimeType: row.mime_type,
      prompt: row.prompt,
      analysis: row.analysis,
      tags: (() => {
        try {
          const parsed = JSON.parse(row.tags_json) as unknown
          return Array.isArray(parsed)
            ? parsed.filter(v => typeof v === 'string')
            : []
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
