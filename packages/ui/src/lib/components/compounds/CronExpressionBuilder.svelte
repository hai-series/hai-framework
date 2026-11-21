<!--
  @component CronExpressionBuilder
  可视化编辑常用的五段 Cron 表达式，并保留自定义表达式输入。

  组件不负责 Cron 解析器校验或自然语言预览；宿主可通过 error 和回调接入自己的业务校验。
-->
<script lang='ts'>
  import type { DataAttributes } from '../../types.js'
  import type {
    CronBuilderMode,
    CronBuilderState,
    CronExpressionBuilderLabels,
    CronExpressionBuilderPreset,
    CronExpressionBuilderWeekdayOption,
    CronWeekdayValue,
  } from './cron-expression-builder-types.js'
  import { getDataAttributes } from '../../utils.js'
  import {
    createDefaultCronBuilderState,
    cronBuilderStateToExpression,
    cronExpressionToBuilderState,
  } from './cron-expression-builder.js'

  const DEFAULT_LABELS: CronExpressionBuilderLabels = {
    presets: 'Presets',
    modeMinute: 'Every few minutes',
    modeHour: 'Hourly',
    modeDay: 'Daily',
    modeWeek: 'Weekly',
    modeMonth: 'Monthly',
    modeCustom: 'Custom',
    fieldInterval: 'Interval (minutes)',
    fieldMinute: 'Minute',
    fieldTime: 'Time',
    fieldWeekdays: 'Weekdays',
    fieldMonthDay: 'Day of month',
    fieldExpression: 'Cron expression',
  }

  const DEFAULT_WEEKDAY_OPTIONS: CronExpressionBuilderWeekdayOption[] = [
    { value: '1', label: 'Mon' },
    { value: '2', label: 'Tue' },
    { value: '3', label: 'Wed' },
    { value: '4', label: 'Thu' },
    { value: '5', label: 'Fri' },
    { value: '6', label: 'Sat' },
    { value: '0', label: 'Sun' },
  ]

  /**
   * CronExpressionBuilder 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { CronExpressionBuilder } from '@h-ai/ui'
   * const component = mount(CronExpressionBuilder, {
   *   target: document.body,
   *   props: { value: '0 10 * * *' },
   * })
   * await unmount(component)
   * ```
   */
  interface Props {
    id?: string
    name?: string
    value?: string
    disabled?: boolean
    required?: boolean
    error?: string
    presets?: CronExpressionBuilderPreset[]
    labels?: Partial<CronExpressionBuilderLabels>
    weekdayOptions?: CronExpressionBuilderWeekdayOption[]
    onchange?: (value: string) => void
  }

  let {
    id = 'cron-expression',
    name = 'cronExpression',
    value = $bindable(''),
    disabled = false,
    required = false,
    error = '',
    presets = [],
    labels: labelOverrides = {},
    weekdayOptions = DEFAULT_WEEKDAY_OPTIONS,
    onchange,
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let builderState = $state<CronBuilderState>(createDefaultCronBuilderState())
  let lastSyncedValue = $state('')
  let panelOpen = $state(false)
  let rootElement = $state<HTMLDivElement | null>(null)

  const labels = $derived<CronExpressionBuilderLabels>({
    ...DEFAULT_LABELS,
    ...labelOverrides,
  })

  const modeOptions = $derived([
    { value: 'minute' as const, label: labels.modeMinute },
    { value: 'hour' as const, label: labels.modeHour },
    { value: 'day' as const, label: labels.modeDay },
    { value: 'week' as const, label: labels.modeWeek },
    { value: 'month' as const, label: labels.modeMonth },
    { value: 'custom' as const, label: labels.modeCustom },
  ])

  const activeExpression = $derived(value.trim())
  const manualExpressionValue = $derived(builderState.customExpression || activeExpression)

  $effect(() => {
    const normalized = value.trim()
    if (normalized === lastSyncedValue) {
      return
    }

    applyBuilderState(cronExpressionToBuilderState(normalized))
    lastSyncedValue = normalized
  })

  function applyBuilderState(nextState: CronBuilderState): void {
    builderState = {
      ...nextState,
      weekDays: ensureWeekDays(nextState.weekDays),
    }
  }

  function syncValue(nextValue: string): void {
    const normalized = nextValue.trim()
    value = normalized
    lastSyncedValue = normalized
    onchange?.(normalized)
  }

  function buildCurrentState(mode: CronBuilderMode = builderState.mode): CronBuilderState {
    return {
      ...builderState,
      mode,
      weekDays: ensureWeekDays(builderState.weekDays),
    }
  }

  function openConfigPanel(): void {
    if (disabled) {
      return
    }

    panelOpen = true
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (!panelOpen || !rootElement) {
      return
    }

    const target = event.target
    if (!(target instanceof Node)) {
      return
    }

    if (rootElement.contains(target)) {
      return
    }

    panelOpen = false
  }

  function handleDocumentFocusIn(event: FocusEvent): void {
    if (!panelOpen || !rootElement) {
      return
    }

    const target = event.target
    if (!(target instanceof Node)) {
      panelOpen = false
      return
    }

    if (rootElement.contains(target)) {
      return
    }

    panelOpen = false
  }

  function applyPreset(expression: string): void {
    if (disabled) {
      return
    }

    syncValue(expression)
    applyBuilderState(cronExpressionToBuilderState(expression))
    panelOpen = true
  }

  function activateMode(mode: CronBuilderMode): void {
    if (disabled) {
      return
    }

    if (mode === 'custom') {
      builderState = {
        ...builderState,
        mode,
      }
      syncValue(builderState.customExpression || activeExpression)
      return
    }

    builderState = buildCurrentState(mode)
    syncVisualExpression(mode)
  }

  function syncVisualExpression(mode: CronBuilderMode = builderState.mode): void {
    const nextState = buildCurrentState(mode)
    const nextExpression = cronBuilderStateToExpression(nextState)
    syncValue(nextExpression)
    applyBuilderState(cronExpressionToBuilderState(nextExpression))
  }

  function updateMinuteInterval(nextValue: string): void {
    builderState = {
      ...builderState,
      minuteInterval: normalizeNumber(nextValue, 1, 59, builderState.minuteInterval),
    }
    syncVisualExpression('minute')
  }

  function updateMinute(nextValue: string, mode: Extract<CronBuilderMode, 'hour' | 'day' | 'week' | 'month'>): void {
    builderState = {
      ...builderState,
      minute: normalizeNumber(nextValue, 0, 59, builderState.minute),
    }
    syncVisualExpression(mode)
  }

  function updateHour(nextValue: string, mode: Extract<CronBuilderMode, 'day' | 'week' | 'month'>): void {
    builderState = {
      ...builderState,
      hour: normalizeNumber(nextValue, 0, 23, builderState.hour),
    }
    syncVisualExpression(mode)
  }

  function updateMonthDay(nextValue: string): void {
    builderState = {
      ...builderState,
      monthDay: normalizeNumber(nextValue, 1, 31, builderState.monthDay),
    }
    syncVisualExpression('month')
  }

  function toggleWeekDay(day: CronWeekdayValue): void {
    const nextWeekDays = builderState.weekDays.includes(day)
      ? builderState.weekDays.filter(value => value !== day)
      : [...builderState.weekDays, day]

    builderState = {
      ...builderState,
      weekDays: ensureWeekDays(nextWeekDays),
    }
    syncVisualExpression('week')
  }

  function handleManualInput(event: Event): void {
    const nextValue = (event.currentTarget as HTMLInputElement).value
    syncValue(nextValue)
    applyBuilderState(cronExpressionToBuilderState(nextValue))
  }

  function isPresetActive(expression: string): boolean {
    return activeExpression === expression
  }

  function normalizeNumber(value: string, min: number, max: number, fallback: number): number {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) {
      return fallback
    }

    return Math.min(max, Math.max(min, parsed))
  }

  function ensureWeekDays(values: readonly CronWeekdayValue[]): CronWeekdayValue[] {
    const uniqueValues = weekdayOptions
      .map(option => option.value)
      .filter((optionValue, index, source) => source.indexOf(optionValue) === index)
      .filter(optionValue => values.includes(optionValue))

    return uniqueValues.length > 0
      ? uniqueValues
      : [weekdayOptions[0]?.value ?? '1']
  }
</script>

<svelte:document
  onpointerdown={handleDocumentPointerDown}
  onfocusin={handleDocumentFocusIn}
/>

<div {...dataAttributes} bind:this={rootElement} class='task-cron-builder'>
  <input type='hidden' {name} value={activeExpression} />

  <div class='task-cron-builder__dropdown'>
    <div class='task-cron-builder__field'>
      <input
        id={id}
        type='text'
        class='task-cron-builder__input'
        class:has-error={Boolean(error)}
        data-cron-manual-input
        value={manualExpressionValue}
        placeholder='0 10 * * *'
        {required}
        disabled={disabled}
        aria-label={labels.fieldExpression}
        aria-invalid={Boolean(error)}
        onfocus={openConfigPanel}
        oninput={handleManualInput}
      />
    </div>

    {#if panelOpen}
      <div class='task-cron-builder__config-panel' data-cron-config-panel>
        {#if presets.length > 0}
          <section class='task-cron-builder__section'>
            <span class='task-cron-builder__caption'>{labels.presets}</span>
            <div class='task-cron-builder__preset-list'>
              {#each presets as preset (preset.expression)}
                <button
                  type='button'
                  class='task-cron-builder__preset'
                  class:is-active={isPresetActive(preset.expression)}
                  data-cron-preset={preset.expression}
                  aria-pressed={isPresetActive(preset.expression)}
                  disabled={disabled}
                  title={preset.description || preset.label}
                  onclick={() => applyPreset(preset.expression)}
                >
                  {preset.label}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <section class='task-cron-builder__section'>
          <div class='task-cron-builder__mode-list' role='tablist' aria-label={labels.fieldExpression}>
            {#each modeOptions as option (option.value)}
              <button
                type='button'
                class='task-cron-builder__mode'
                class:is-active={builderState.mode === option.value}
                data-cron-mode={option.value}
                role='tab'
                aria-selected={builderState.mode === option.value}
                disabled={disabled}
                onclick={() => activateMode(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>

          <div class='task-cron-builder__controls'>
            {#if builderState.mode === 'week'}
              <div class='task-cron-builder__field task-cron-builder__field--stacked'>
                <span class='task-cron-builder__label'>{labels.fieldWeekdays}</span>
                <div class='task-cron-builder__weekday-list'>
                  {#each weekdayOptions as option (option.value)}
                    <label class='task-cron-builder__weekday'>
                      <input
                        type='checkbox'
                        data-cron-weekday={option.value}
                        checked={builderState.weekDays.includes(option.value)}
                        disabled={disabled}
                        onchange={() => toggleWeekDay(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}

            {#if builderState.mode === 'minute'}
              <div class='task-cron-builder__field task-cron-builder__field--compact'>
                <label class='task-cron-builder__label' for={`${id}-interval`}>{labels.fieldInterval}</label>
                <input
                  id={`${id}-interval`}
                  type='number'
                  min='1'
                  max='59'
                  class='task-cron-builder__input'
                  value={builderState.minuteInterval}
                  disabled={disabled}
                  onchange={event => updateMinuteInterval((event.currentTarget as HTMLInputElement).value)}
                />
              </div>
            {/if}

            {#if builderState.mode === 'hour'}
              <div class='task-cron-builder__field task-cron-builder__field--compact'>
                <label class='task-cron-builder__label' for={`${id}-hour-minute`}>{labels.fieldMinute}</label>
                <input
                  id={`${id}-hour-minute`}
                  type='number'
                  min='0'
                  max='59'
                  class='task-cron-builder__input'
                  value={builderState.minute}
                  disabled={disabled}
                  onchange={event => updateMinute((event.currentTarget as HTMLInputElement).value, 'hour')}
                />
              </div>
            {/if}

            {#if builderState.mode === 'day' || builderState.mode === 'week' || builderState.mode === 'month'}
              <div class='task-cron-builder__field-grid'>
                {#if builderState.mode === 'month'}
                  <div class='task-cron-builder__field task-cron-builder__field--compact'>
                    <label class='task-cron-builder__label' for={`${id}-month-day`}>{labels.fieldMonthDay}</label>
                    <input
                      id={`${id}-month-day`}
                      type='number'
                      min='1'
                      max='31'
                      class='task-cron-builder__input'
                      value={builderState.monthDay}
                      disabled={disabled}
                      onchange={event => updateMonthDay((event.currentTarget as HTMLInputElement).value)}
                    />
                  </div>
                {/if}

                <div class='task-cron-builder__field task-cron-builder__field--compact'>
                  <label class='task-cron-builder__label' for={`${id}-hour`}>{labels.fieldTime}</label>
                  <div class='task-cron-builder__time-grid'>
                    <input
                      id={`${id}-hour`}
                      type='number'
                      min='0'
                      max='23'
                      class='task-cron-builder__input'
                      value={builderState.hour}
                      disabled={disabled}
                      onchange={event => updateHour(
                        (event.currentTarget as HTMLInputElement).value,
                        builderState.mode === 'day'
                          ? 'day'
                          : builderState.mode === 'week'
                          ? 'week'
                          : 'month',
                      )}
                    />
                    <span class='task-cron-builder__time-separator'>:</span>
                    <input
                      id={`${id}-minute`}
                      type='number'
                      min='0'
                      max='59'
                      class='task-cron-builder__input'
                      value={builderState.minute}
                      disabled={disabled}
                      onchange={event => updateMinute(
                        (event.currentTarget as HTMLInputElement).value,
                        builderState.mode === 'day'
                          ? 'day'
                          : builderState.mode === 'week'
                          ? 'week'
                          : 'month',
                      )}
                    />
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </section>
      </div>
    {/if}
  </div>
</div>

<style>
  .task-cron-builder {
    position: relative;
  }

  .task-cron-builder__dropdown {
    position: relative;
  }

  .task-cron-builder__field,
  .task-cron-builder__section,
  .task-cron-builder__controls,
  .task-cron-builder__config-panel {
    display: grid;
    gap: 8px;
  }

  .task-cron-builder__label,
  .task-cron-builder__caption {
    color: color-mix(in oklab, var(--color-base-content) 76%, transparent);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.02em;
  }

  .task-cron-builder__input {
    width: 100%;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 14%, transparent);
    border-radius: 8px;
    background: var(--color-base-100);
    color: var(--color-base-content);
    font-size: 13px;
    line-height: 1.4;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .task-cron-builder__input:focus {
    outline: none;
    border-color: color-mix(in oklab, var(--color-primary) 72%, transparent);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 14%, transparent);
  }

  .task-cron-builder__input.has-error {
    border-color: color-mix(in oklab, var(--color-error) 64%, transparent);
  }

  .task-cron-builder__config-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    left: 0;
    z-index: 30;
    padding: 10px 12px 12px;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 10%, transparent);
    border-radius: 10px;
    background:
      linear-gradient(
        180deg,
        color-mix(in oklab, var(--color-base-100) 94%, white) 0%,
        var(--color-base-100) 100%
      );
    box-shadow: 0 10px 28px color-mix(in oklab, var(--color-base-content) 10%, transparent);
  }

  .task-cron-builder__preset-list,
  .task-cron-builder__mode-list,
  .task-cron-builder__weekday-list {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .task-cron-builder__preset,
  .task-cron-builder__mode,
  .task-cron-builder__weekday {
    flex: 0 0 auto;
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 12%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-base-100) 92%, white);
    color: color-mix(in oklab, var(--color-base-content) 78%, transparent);
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;
  }

  .task-cron-builder__preset,
  .task-cron-builder__mode {
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .task-cron-builder__preset:hover,
  .task-cron-builder__mode:hover,
  .task-cron-builder__weekday:hover {
    border-color: color-mix(in oklab, var(--color-primary) 42%, transparent);
    background: color-mix(in oklab, var(--color-primary) 7%, transparent);
    color: var(--color-primary);
  }

  .task-cron-builder__preset.is-active,
  .task-cron-builder__mode.is-active {
    border-color: color-mix(in oklab, var(--color-primary) 58%, transparent);
    background: color-mix(in oklab, var(--color-primary) 11%, transparent);
    color: var(--color-primary);
  }

  .task-cron-builder__field-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }

  .task-cron-builder__field--compact,
  .task-cron-builder__field--stacked {
    gap: 6px;
  }

  .task-cron-builder__time-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 6px;
    align-items: center;
  }

  .task-cron-builder__time-separator {
    color: color-mix(in oklab, var(--color-base-content) 54%, transparent);
    font-weight: 600;
  }

  .task-cron-builder__weekday-list {
    width: 100%;
  }

  .task-cron-builder__weekday {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    padding: 0 7px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 11px;
    line-height: 1;
  }

  .task-cron-builder__weekday input {
    margin: 0;
    inline-size: 11px;
    block-size: 11px;
  }
</style>
