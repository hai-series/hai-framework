import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULE_INPUT_CONFIG,
  inspectScheduleDateTimeDraft,
  inspectScheduleDateTimeValue,
  isScheduleDateTimeValid,
  normalizeScheduleInputConfig,
  parseScheduleDateTimeValue,
  serializeScheduleDateTime,
} from '../src/lib/components/compounds/schedule-input.js'

describe('scheduleInput schema metadata', () => {
  it('normalizes the supported schema and defaults allowCron to false', () => {
    expect(normalizeScheduleInputConfig({
      kind: 'schedule',
      timezone: 'Asia/Shanghai',
      precision: 'minute',
    })).toEqual(DEFAULT_SCHEDULE_INPUT_CONFIG)
    expect(normalizeScheduleInputConfig({
      kind: 'schedule',
      timezone: 'Asia/Shanghai',
      precision: 'minute',
      allowCron: true,
    })).toEqual({ ...DEFAULT_SCHEDULE_INPUT_CONFIG, allowCron: true })
  })

  it('retains an explicit supported IANA time zone', () => {
    expect(normalizeScheduleInputConfig({ kind: 'schedule', timezone: 'America/Los_Angeles', precision: 'minute' }))
      .toEqual({
        kind: 'schedule',
        timezone: 'America/Los_Angeles',
        precision: 'minute',
        allowCron: false,
      })
    expect(normalizeScheduleInputConfig({ kind: 'schedule', timezone: 'UTC', precision: 'minute' })?.timezone).toBe('UTC')
    expect(normalizeScheduleInputConfig({ kind: 'schedule', timezone: 'Unsupported/Zone', precision: 'minute' })).toBeUndefined()
  })

  it('rejects unsupported or malformed schema metadata', () => {
    expect(normalizeScheduleInputConfig(undefined)).toBeUndefined()
    expect(normalizeScheduleInputConfig(null)).toBeUndefined()
    expect(normalizeScheduleInputConfig({ kind: 'other', timezone: 'Asia/Shanghai', precision: 'minute' })).toBeUndefined()
    expect(normalizeScheduleInputConfig({ kind: 'schedule', timezone: '+08:00', precision: 'minute' })).toBeUndefined()
    expect(normalizeScheduleInputConfig({ kind: 'schedule', timezone: 'Asia/Shanghai', precision: 'second' })).toBeUndefined()
    expect(normalizeScheduleInputConfig({
      kind: 'schedule',
      timezone: 'Asia/Shanghai',
      precision: 'minute',
      allowCron: 'true',
    })).toBeUndefined()
    expect(normalizeScheduleInputConfig({
      kind: 'schedule',
      timezone: 'Asia/Shanghai',
      precision: 'minute',
      unsupported: true,
    })).toBeUndefined()
  })
})

describe('scheduleInput date-time values', () => {
  const now = new Date('2026-11-21T03:00:00.000Z')

  it('serializes minute drafts with a fixed Beijing offset', () => {
    expect(serializeScheduleDateTime({ date: '2026-11-22', hour: '10', minute: '05' }))
      .toBe('2026-11-22T10:05:00+08:00')
  })

  it('does not depend on the browser timezone when validating future values', () => {
    const value = '2026-11-22T10:05:00+08:00'
    expect(inspectScheduleDateTimeValue(value, now)).toBe('valid')
    expect(isScheduleDateTimeValid(value, true, now)).toBe(true)
    expect(parseScheduleDateTimeValue(value)).toEqual({
      date: '2026-11-22',
      hour: '10',
      minute: '05',
      seconds: '00',
      offset: '+08:00',
    })
  })

  it('preserves valid offsets across daylight-saving transitions and rejects missing local minutes', () => {
    const timezone = 'America/Los_Angeles'
    const standard = { date: '2030-01-22', hour: '10', minute: '05' }
    const daylight = { ...standard, date: '2030-07-22' }
    const overlap = { date: '2030-11-03', hour: '01', minute: '30' }
    const missing = { date: '2030-03-10', hour: '02', minute: '30' }
    expect(serializeScheduleDateTime(standard, timezone)).toBe('2030-01-22T10:05:00-08:00')
    expect(serializeScheduleDateTime(daylight, timezone)).toBe('2030-07-22T10:05:00-07:00')
    expect(serializeScheduleDateTime(overlap, timezone)).toBe('2030-11-03T01:30:00-07:00')
    expect(serializeScheduleDateTime(overlap, timezone, '-08:00')).toBe('2030-11-03T01:30:00-08:00')
    expect(serializeScheduleDateTime(missing, timezone)).toBeUndefined()
    expect(serializeScheduleDateTime(daylight, timezone, '-08:00')).toBeUndefined()
    expect(inspectScheduleDateTimeValue('2030-11-03T01:30:00-08:00', now, timezone)).toBe('valid')
    expect(inspectScheduleDateTimeValue('2030-01-22T10:05:00Z', now, 'UTC')).toBe('valid')
  })

  it('rejects empty required values, partial values, impossible dates, past values and non-minute values', () => {
    expect(inspectScheduleDateTimeValue('', now)).toBe('empty')
    expect(isScheduleDateTimeValid('', true, now)).toBe(false)
    expect(inspectScheduleDateTimeDraft({ date: '2026-11-22', hour: '', minute: '05' }, now)).toBe('partial')
    expect(inspectScheduleDateTimeValue('2026-02-30T10:05:00+08:00', now)).toBe('invalid')
    expect(inspectScheduleDateTimeValue('2026-11-20T10:05:00+08:00', now)).toBe('past')
    expect(inspectScheduleDateTimeValue('2026-11-22T10:05:30+08:00', now)).toBe('invalid')
    expect(inspectScheduleDateTimeValue('2026-11-22T10:05:00Z', now)).toBe('invalid')
  })
})
