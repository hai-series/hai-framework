export interface SessionLike {
  userId?: string | null
}

export interface VisionInsertInput {
  id: string
  userId: string
  key: string
  fileName: string
  mimeType: string
  prompt: string | null
  analysis: string
  tagsJson: string
  confidence: number
  createdAt: number
}

export function getSessionUserId(session: SessionLike | null | undefined): string | null {
  const normalized = session?.userId?.trim()
  return normalized || null
}

export function buildVisionHistoryQuery(userId: string): { sql: string, params: [string] } {
  return {
    sql: `SELECT id, storage_key, file_name, mime_type, prompt, analysis, tags_json, confidence, created_at
     FROM vision_records
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    params: [userId],
  }
}

export function buildVisionInsertStatement(input: VisionInsertInput): { sql: string, params: unknown[] } {
  return {
    sql: `INSERT INTO vision_records
      (id, user_id, storage_key, file_name, mime_type, prompt, analysis, tags_json, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      input.id,
      input.userId,
      input.key,
      input.fileName,
      input.mimeType,
      input.prompt,
      input.analysis,
      input.tagsJson,
      input.confidence,
      input.createdAt,
    ],
  }
}
