<!--
  @component ScheduleInput
  日期时间与高级 Cron 的统一调度输入。

  日期时间使用配置的 IANA 时区，默认 Asia/Shanghai。Cron 编辑由
  CronExpressionBuilder 提供。
-->
<script lang='ts'>
  import type { DateValue } from '@internationalized/date'
  import type { DataAttributes, FormText, Size } from '../../types.js'
  import type { ScheduleDateTimeDraft, ScheduleInputConfig } from './schedule-input.js'
  import { parseDate } from '@internationalized/date'
  import { getFormFieldContext } from '../../internal/form-context.js'
  import { resolveFormText, useControlFeedback } from '../../internal/form-validation.svelte.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import Input from '../primitives/Input.svelte'
  import Select from '../primitives/Select.svelte'
  import { isCronExpressionValid } from './cron-expression-builder.js'
  import CronExpressionBuilder from './CronExpressionBuilder.svelte'
  import DatePicker from './DatePicker.svelte'
  import {
    DEFAULT_SCHEDULE_INPUT_CONFIG,
    inspectScheduleDateTimeDraft,
    normalizeScheduleInputConfig,
    parseScheduleDateTimeValue,
    serializeScheduleDateTime,
  } from './schedule-input.js'

  /**
   * ScheduleInput 的编辑模式。
   *
   * @example 模块内部上下文
   * ```ts
   * const mode: ScheduleInputMode = 'datetime'
   * ```
   */
  type ScheduleInputMode = 'datetime' | 'cron'

  /**
   * ScheduleInput 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { ScheduleInput } from '@h-ai/ui'
   * const component = mount(ScheduleInput, {
   *   target: document.body,
   *   props: { required: true },
   * })
   * await unmount(component)
   * ```
   */
  interface Props {
    /** Schema 元数据；省略时使用默认的北京时间、分钟精度配置。 */
    config?: ScheduleInputConfig
    /** 日期时间 canonical 值或 Cron 表达式。 */
    value?: string
    /** 当前值是否通过组件边界校验。 */
    valid?: boolean
    /** 是否必须填写。 */
    required?: boolean
    /** 是否禁用交互。 */
    disabled?: boolean
    /** 自定义错误提示。 */
    error?: FormText
    /** 表单字段名。 */
    name?: string
    /** 控件 ID。 */
    id?: string
    /** 控件尺寸。 */
    size?: Size
    /** 自定义类名。 */
    class?: string
    /** 值变化回调。 */
    onchange?: (value: string) => void
  }

  let {
    config: rawConfig = DEFAULT_SCHEDULE_INPUT_CONFIG,
    value = $bindable(''),
    valid = $bindable(false),
    required = false,
    disabled = false,
    error,
    name,
    id,
    size = 'md',
    class: className = '',
    onchange,
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const field = getFormFieldContext()
  const uniqueId = $props.id()
  const controlId = $derived(id ?? field?.controlId ?? `${uniqueId}-control`)
  const messageId = `${uniqueId}-error`
  const normalizedConfig = $derived(normalizeScheduleInputConfig(rawConfig))
  const effectiveConfig = $derived(normalizedConfig ?? DEFAULT_SCHEDULE_INPUT_CONFIG)
  const configIsValid = $derived(normalizedConfig !== undefined)

  let mode = $state<ScheduleInputMode>('datetime')
  let dateDraft = $state<ScheduleDateTimeDraft>({ date: '', hour: '', minute: '' })
  let calendarDate = $state<DateValue | undefined>(undefined)
  let cronDraft = $state('')
  let lastSyncedValue = $state<string | undefined>(undefined)
  let hasSyncedExternalValue = $state(false)
  let dateTimeFormatValid = $state(true)
  let dateTimeOffset = $state<string>()
  let validationClock = $state(Date.now())
  let nativeInput = $state<HTMLInputElement | undefined>(undefined)

  const modeOptions = $derived([
    {
      value: 'datetime' as const,
      label: uiM('schedule_input_mode_datetime'),
    },
    {
      value: 'cron' as const,
      label: uiM('schedule_input_mode_cron'),
    },
  ])
  const cronLabels = $derived({
    presets: uiM('schedule_input_cron_presets'),
    modeMinute: uiM('schedule_input_cron_mode_minute'),
    modeHour: uiM('schedule_input_cron_mode_hour'),
    modeDay: uiM('schedule_input_cron_mode_day'),
    modeWeek: uiM('schedule_input_cron_mode_week'),
    modeMonth: uiM('schedule_input_cron_mode_month'),
    modeCustom: uiM('schedule_input_cron_mode_custom'),
    fieldInterval: uiM('schedule_input_cron_field_interval'),
    fieldMinute: uiM('schedule_input_cron_field_minute'),
    fieldTime: uiM('schedule_input_cron_field_time'),
    fieldWeekdays: uiM('schedule_input_cron_field_weekdays'),
    fieldMonthDay: uiM('schedule_input_cron_field_month_day'),
    fieldExpression: uiM('schedule_input_cron_field_expression'),
  })
  const dateTimeStatus = $derived(inspectScheduleDateTimeDraft(dateDraft, new Date(validationClock), effectiveConfig.timezone, dateTimeOffset))
  const dateTimeDraftValue = $derived(serializeScheduleDateTime(dateDraft, effectiveConfig.timezone, dateTimeOffset) ?? '')
  const draftMatchesValue = $derived(mode === 'datetime'
    ? dateTimeDraftValue === value
    : cronDraft.trim() === value.trim())
  const cronIsValid = $derived(isFiveSegmentCronExpressionValid(cronDraft))
  const inputIsValid = $derived.by(() => {
    if (!configIsValid)
      return false
    if (mode === 'datetime') {
      return draftMatchesValue
        && dateTimeFormatValid
        && (dateTimeStatus === 'valid' || (dateTimeStatus === 'empty' && !required))
    }
    if (!effectiveConfig.allowCron)
      return false
    return draftMatchesValue && (cronIsValid || (!cronDraft.trim() && !required))
  })
  const validationMessage = $derived.by(() => {
    if (!configIsValid)
      return uiM('schedule_input_invalid_config')
    if (mode === 'datetime') {
      if (!draftMatchesValue || !dateTimeFormatValid)
        return uiM('schedule_input_invalid')
      switch (dateTimeStatus) {
        case 'empty': return required
          ? uiM('schedule_input_required')
          : ''
        case 'partial': return uiM('schedule_input_partial')
        case 'invalid': return uiM('schedule_input_invalid')
        case 'past': return uiM('schedule_input_past')
        case 'valid': return ''
      }
    }
    if (!cronDraft.trim()) {
      return required
        ? uiM('schedule_input_required')
        : ''
    }
    if (!draftMatchesValue)
      return uiM('schedule_input_cron_invalid')
    return cronIsValid
      ? ''
      : uiM('schedule_input_cron_invalid')
  })
  const localError = $derived(resolveFormText(error) || validationMessage)
  const effectiveError = $derived(field?.error || localError)
  const cronError = $derived(mode === 'cron'
    ? localError
    : '')

  useControlFeedback(() => localError)

  // 外部回填只同步对应模式的草稿；用户在模式之间切换时不走这条路径。
  $effect(() => {
    const incoming = typeof value === 'string'
      ? value
      : ''
    if (hasSyncedExternalValue && incoming === lastSyncedValue)
      return

    syncExternalValue(incoming)
    lastSyncedValue = incoming
    hasSyncedExternalValue = true
  })

  $effect(() => {
    if (!effectiveConfig.allowCron && mode === 'cron')
      mode = 'datetime'
  })

  $effect(() => {
    valid = inputIsValid
    if (nativeInput) {
      nativeInput.setCustomValidity(inputIsValid ? '' : localError)
    }
  })

  $effect(() => {
    if (mode !== 'datetime' || !dateTimeDraftValue)
      return

    const deadline = Date.parse(dateTimeDraftValue)
    let timer: ReturnType<typeof setTimeout> | undefined
    function updateClock() {
      const now = Date.now()
      validationClock = now
      const remaining = deadline - now
      if (remaining > 0)
        timer = setTimeout(updateClock, Math.min(remaining, 2_147_483_647))
    }
    updateClock()
    return () => clearTimeout(timer)
  })

  $effect(() => {
    const form = nativeInput?.form
    if (!form)
      return
    // 后台标签页可能延迟计时器，原生提交用即时钟再核对一次。
    form.addEventListener('submit', checkSubmissionTime, true)
    return () => form.removeEventListener('submit', checkSubmissionTime, true)
  })

  function checkSubmissionTime(event: SubmitEvent): void {
    const now = Date.now()
    if (disabled || mode !== 'datetime' || !dateTimeDraftValue || Date.parse(dateTimeDraftValue) > now)
      return

    event.preventDefault()
    event.stopImmediatePropagation()
    validationClock = now
    nativeInput?.setCustomValidity(uiM('schedule_input_past'))
    nativeInput?.reportValidity()
  }

  function focusInvalidControl(event: Event & { currentTarget: HTMLInputElement }): void {
    // 表单值由代理输入提交，用户在当前模式的可见输入中修正错误。
    event.preventDefault()
    const input = event.currentTarget
    if (!input.form || input.form.querySelector(':invalid') === input)
      input.ownerDocument.getElementById(controlId)?.focus()
  }

  function syncExternalValue(incoming: string): void {
    const parsed = parseScheduleDateTimeValue(incoming)
    if (parsed) {
      mode = 'datetime'
      dateTimeFormatValid = parsed.seconds === '00'
      dateTimeOffset = parsed.offset
      dateDraft = {
        date: parsed.date,
        hour: parsed.hour,
        minute: parsed.minute,
      }
      calendarDate = parseCalendarDate(parsed.date)
      return
    }

    if (effectiveConfig.allowCron && incoming.trim()) {
      mode = 'cron'
      cronDraft = incoming.trim()
      return
    }

    mode = 'datetime'
    dateTimeFormatValid = !incoming.trim()
    dateTimeOffset = undefined
    dateDraft = { date: '', hour: '', minute: '' }
    calendarDate = undefined
  }

  function setValue(nextValue: string): void {
    if (disabled)
      return

    value = nextValue
    lastSyncedValue = nextValue
    hasSyncedExternalValue = true
    onchange?.(nextValue)
  }

  function syncDateTimeValue(): void {
    dateTimeFormatValid = true
    dateTimeOffset = undefined
    setValue(dateTimeDraftValue)
  }

  function handleDateChange(nextDate: DateValue | undefined): void {
    if (disabled)
      return

    calendarDate = nextDate
    dateDraft = {
      ...dateDraft,
      date: nextDate?.toString() ?? '',
    }
    syncDateTimeValue()
  }

  function updateTime(part: 'hour' | 'minute', nextValue: string): void {
    if (disabled)
      return

    dateDraft = {
      ...dateDraft,
      [part]: nextValue,
    }
    syncDateTimeValue()
  }

  function handleModeChange(nextMode: string): void {
    if (nextMode !== 'datetime' && nextMode !== 'cron')
      return

    if (disabled || nextMode === mode || (!effectiveConfig.allowCron && nextMode === 'cron'))
      return

    mode = nextMode
    if (nextMode === 'datetime') {
      calendarDate = parseCalendarDate(dateDraft.date)
      setValue(dateTimeDraftValue)
    }
    else {
      setValue(cronDraft.trim())
    }
  }

  function handleCronChange(nextValue: string): void {
    if (disabled)
      return

    cronDraft = nextValue
    setValue(nextValue)
  }

  function isFiveSegmentCronExpressionValid(expression: string): boolean {
    const normalized = expression.trim()
    return normalized.split(/\s+/).length === 5 && isCronExpressionValid(normalized)
  }

  function parseCalendarDate(valueToParse: string): DateValue | undefined {
    if (!valueToParse)
      return undefined

    try {
      return parseDate(valueToParse)
    }
    catch {
      return undefined
    }
  }
</script>

<div {...dataAttributes} class={cn('fieldset w-full min-w-0', className)}>
  <input
    bind:this={nativeInput}
    type='text'
    class='sr-only'
    tabindex='-1'
    aria-hidden='true'
    aria-invalid={effectiveError ? true : undefined}
    aria-describedby={[
      field?.messageId,
      localError && !field?.error
        ? messageId
        : '',
    ].filter(Boolean).join(' ') || undefined}
    {name}
    {required}
    {disabled}
    value={value}
    oninvalid={focusInvalidControl}
  />

  <div class={cn('grid min-w-0 gap-3', effectiveError && 'rounded-lg ring-1 ring-error/35', size === 'sm' && 'gap-2')}>
    {#if effectiveConfig.allowCron}
      <label class='sr-only' for={`${controlId}-mode`}>{uiM('schedule_input_mode')}</label>
      <Select
        id={`${controlId}-mode`}
        size={size}
        options={modeOptions}
        value={mode}
        disabled={disabled}
        onchange={handleModeChange}
      />
    {/if}

    {#if mode === 'datetime'}
      <div class='grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.75fr)]'>
        <DatePicker
          value={calendarDate}
          size={size}
          disabled={disabled}
          ariaLabel={uiM('schedule_input_date')}
          onchange={handleDateChange}
        />
        <div class='grid min-w-0 grid-cols-2 gap-2'>
          <label class='sr-only' for={controlId}>{uiM('schedule_input_hour')}</label>
          <Input
            id={controlId}
            data-schedule-hour
            error={localError || undefined}
            type='number'
            size={size}
            min={0}
            max={23}
            step={1}
            inputmode='numeric'
            value={dateDraft.hour}
            disabled={disabled}
            placeholder='HH'
            oninput={event => updateTime('hour', event.currentTarget.value)}
          />
          <label class='sr-only' for={`${controlId}-minute`}>{uiM('schedule_input_minute')}</label>
          <Input
            id={`${controlId}-minute`}
            type='number'
            size={size}
            min={0}
            max={59}
            step={1}
            inputmode='numeric'
            value={dateDraft.minute}
            disabled={disabled}
            placeholder='MM'
            oninput={event => updateTime('minute', event.currentTarget.value)}
          />
        </div>
      </div>
      <p class='text-xs text-base-content/55'>
        {effectiveConfig.timezone === 'Asia/Shanghai'
          ? uiM('schedule_input_timezone_hint')
          : uiM('schedule_input_timezone_explicit', { timezone: effectiveConfig.timezone })}
      </p>
    {:else}
      <CronExpressionBuilder
        id={controlId}
        name=''
        value={cronDraft}
        disabled={disabled}
        required={required}
        error={cronError || undefined}
        describedBy={field?.error
          ? field.messageId
          : cronError ? messageId : undefined}
        labels={cronLabels}
        onchange={handleCronChange}
      />
      <p class='text-xs text-base-content/55'>{uiM('schedule_input_cron_hint')}</p>
    {/if}
  </div>

  {#if localError && !field?.error}
    <p id={messageId} class='mt-1 text-xs text-error'>{localError}</p>
  {/if}
</div>
