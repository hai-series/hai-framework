import { describe, expect, it } from 'vitest'
import {
  createDefaultCronBuilderState,
  cronBuilderStateToExpression,
  cronExpressionToBuilderState,
  isCronExpressionValid,
} from '../src/lib/components/compounds/cron-expression-builder.js'

it('keeps out-of-range fields in manual input without clamping them into another schedule', () => {
  const original = '99 25 * * *'
  const state = cronExpressionToBuilderState(original)
  expect(isCronExpressionValid(original)).toBe(false)
  expect(state.mode).toBe('custom')
  expect(cronBuilderStateToExpression(state)).toBe(original)
})

describe('cron expression builder state', () => {
  it('creates the same defaults as the task builder', () => {
    expect(createDefaultCronBuilderState()).toEqual({
      mode: 'day',
      customExpression: '',
      minuteInterval: 5,
      hour: 10,
      minute: 0,
      monthDay: 1,
      weekDays: ['1'],
    })
  })

  it('maps common five and zero-second six segment expressions to visual modes', () => {
    expect(cronExpressionToBuilderState('*/15 * * * *')).toMatchObject({
      mode: 'minute',
      minuteInterval: 15,
    })
    expect(cronExpressionToBuilderState('30 * * * *')).toMatchObject({
      mode: 'hour',
      minute: 30,
    })
    expect(cronExpressionToBuilderState('0 10 * * *')).toMatchObject({
      mode: 'day',
      hour: 10,
      minute: 0,
    })
    expect(cronExpressionToBuilderState('0 30 9 * * 1-5')).toMatchObject({
      mode: 'week',
      customExpression: '30 9 * * 1-5',
      hour: 9,
      minute: 30,
      weekDays: ['1', '2', '3', '4', '5'],
    })
    expect(cronExpressionToBuilderState('0 8 15 * *')).toMatchObject({
      mode: 'month',
      hour: 8,
      minute: 0,
      monthDay: 15,
    })
  })

  it('keeps unsupported expressions in custom mode without changing their text', () => {
    expect(cronExpressionToBuilderState('0 0 1,15 * 1-5')).toMatchObject({
      mode: 'custom',
      customExpression: '0 0 1,15 * 1-5',
    })
    expect(cronExpressionToBuilderState('  0 0 1,15 * 1-5  ')).toMatchObject({
      mode: 'custom',
      customExpression: '0 0 1,15 * 1-5',
    })
    expect(cronExpressionToBuilderState('0 30 9 * * 1-5 2026')).toMatchObject({
      mode: 'custom',
      customExpression: '0 30 9 * * 1-5 2026',
    })
  })

  it('serializes each visual mode with the task builder grammar', () => {
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'minute',
      minuteInterval: 15,
    })).toBe('*/15 * * * *')
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'hour',
      minute: 45,
    })).toBe('45 * * * *')
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'day',
      hour: 9,
      minute: 30,
    })).toBe('30 9 * * *')
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'week',
      hour: 9,
      minute: 30,
      weekDays: ['1', '3', '5'],
    })).toBe('30 9 * * 1,3,5')
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'month',
      hour: 8,
      minute: 0,
      monthDay: 15,
    })).toBe('0 8 15 * *')
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'custom',
      customExpression: ' 0 0 L * * ',
    })).toBe('0 0 L * *')
  })

  it('normalizes weekday ranges, seven as Sunday, and invalid values', () => {
    expect(cronExpressionToBuilderState('0 9 * * 7')).toMatchObject({
      mode: 'week',
      weekDays: ['0'],
    })
    expect(cronExpressionToBuilderState('0 9 * * 5,1,1')).toMatchObject({
      mode: 'week',
      weekDays: ['1', '5'],
    })
    expect(cronExpressionToBuilderState('0 9 * * 1-7')).toMatchObject({
      mode: 'week',
      weekDays: ['1', '2', '3', '4', '5', '6', '0'],
    })
    expect(cronExpressionToBuilderState('0 9 * * 8')).toMatchObject({
      mode: 'custom',
      customExpression: '0 9 * * 8',
    })
  })

  it('clamps numeric state fields while retaining the custom fallback', () => {
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'minute',
      minuteInterval: 0,
    })).toBe('*/1 * * * *')
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'day',
      hour: 99,
      minute: -1,
    })).toBe('0 23 * * *')
    expect(cronBuilderStateToExpression({
      ...createDefaultCronBuilderState(),
      mode: 'week',
      weekDays: [],
    })).toBe('0 10 * * 1')
  })

  it('delegates expression validation to cron-parser', () => {
    expect(isCronExpressionValid('* * * * *')).toBe(true)
    expect(isCronExpressionValid('30 9 * * 1-5')).toBe(true)
    expect(isCronExpressionValid('0 30 9 * * 1-5')).toBe(true)
    expect(isCronExpressionValid('0 0 ? * MON-FRI')).toBe(true)
    expect(isCronExpressionValid('0 0 L * *')).toBe(true)

    expect(isCronExpressionValid('')).toBe(false)
    expect(isCronExpressionValid('   ')).toBe(false)
    expect(isCronExpressionValid('60 * * * *')).toBe(false)
    expect(isCronExpressionValid('0 9 * * 8')).toBe(false)
    expect(isCronExpressionValid('*/0 * * * *')).toBe(false)
    expect(isCronExpressionValid('abc * * * *')).toBe(false)
  })
})
