/**
 * =============================================================================
 * @h-ai/reach - 发送逻辑测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { isDndBlocked } from '../src/reach-send.js'

describe('reach-send: isDndBlocked', () => {
  it('未启用 DND 时不应拦截', () => {
    expect(isDndBlocked(undefined)).toBe(false)
    expect(isDndBlocked({ enabled: false, start: '22:00', end: '08:00' })).toBe(false)
  })

  it('同一天时段内应拦截', () => {
    const dnd = { enabled: true, start: '08:00', end: '22:00' }
    // 12:00 在 08:00-22:00 内
    const noon = new Date('2026-01-01T12:00:00')
    expect(isDndBlocked(dnd, noon)).toBe(true)
  })

  it('同一天时段外不应拦截', () => {
    const dnd = { enabled: true, start: '08:00', end: '22:00' }
    // 23:00 在 08:00-22:00 外
    const late = new Date('2026-01-01T23:00:00')
    expect(isDndBlocked(dnd, late)).toBe(false)
  })

  it('跨午夜时段内应拦截（晚上部分）', () => {
    const dnd = { enabled: true, start: '22:00', end: '08:00' }
    // 23:30 在 22:00-08:00 内
    const lateNight = new Date('2026-01-01T23:30:00')
    expect(isDndBlocked(dnd, lateNight)).toBe(true)
  })

  it('跨午夜时段内应拦截（凌晨部分）', () => {
    const dnd = { enabled: true, start: '22:00', end: '08:00' }
    // 03:00 在 22:00-08:00 内
    const earlyMorning = new Date('2026-01-02T03:00:00')
    expect(isDndBlocked(dnd, earlyMorning)).toBe(true)
  })

  it('跨午夜时段外不应拦截', () => {
    const dnd = { enabled: true, start: '22:00', end: '08:00' }
    // 12:00 在 22:00-08:00 外
    const noon = new Date('2026-01-01T12:00:00')
    expect(isDndBlocked(dnd, noon)).toBe(false)
  })

  it('开始和结束相同时不应拦截', () => {
    const dnd = { enabled: true, start: '08:00', end: '08:00' }
    const anytime = new Date('2026-01-01T08:00:00')
    expect(isDndBlocked(dnd, anytime)).toBe(false)
  })

  it('边界时间：在 start 时刻应拦截', () => {
    const dnd = { enabled: true, start: '22:00', end: '08:00' }
    const atStart = new Date('2026-01-01T22:00:00')
    expect(isDndBlocked(dnd, atStart)).toBe(true)
  })

  it('边界时间：在 end 时刻不应拦截', () => {
    const dnd = { enabled: true, start: '22:00', end: '08:00' }
    const atEnd = new Date('2026-01-02T08:00:00')
    expect(isDndBlocked(dnd, atEnd)).toBe(false)
  })
})
