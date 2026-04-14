import { describe, expect, it } from 'vitest'
import { buildVisionHistoryQuery, buildVisionInsertStatement, getSessionUserId } from './vision-user-isolation'

describe('vision-user-isolation helpers', () => {
  it('resolves user id only when session has non-empty userId', () => {
    expect(getSessionUserId(null)).toBeNull()
    expect(getSessionUserId(undefined)).toBeNull()
    expect(getSessionUserId({ userId: '' })).toBeNull()
    expect(getSessionUserId({ userId: '   ' })).toBeNull()
    expect(getSessionUserId({ userId: 'user-1' })).toBe('user-1')
  })

  it('builds history query scoped to user_id', () => {
    const query = buildVisionHistoryQuery('user-1')

    expect(query.sql).toContain('FROM vision_records')
    expect(query.sql).toContain('WHERE user_id = ?')
    expect(query.params).toEqual(['user-1'])
  })

  it('builds insert statement with user_id binding', () => {
    const statement = buildVisionInsertStatement({
      id: 'record-1',
      userId: 'user-1',
      key: 'vision/file.jpg',
      fileName: 'file.jpg',
      mimeType: 'image/jpeg',
      prompt: 'find coffee',
      analysis: 'summary',
      tagsJson: '["coffee"]',
      confidence: 0.88,
      createdAt: 12345,
    })

    expect(statement.sql).toContain('(id, user_id, storage_key')
    expect(statement.params[1]).toBe('user-1')
    expect(statement.params).toEqual([
      'record-1',
      'user-1',
      'vision/file.jpg',
      'file.jpg',
      'image/jpeg',
      'find coffee',
      'summary',
      '["coffee"]',
      0.88,
      12345,
    ])
  })
})
