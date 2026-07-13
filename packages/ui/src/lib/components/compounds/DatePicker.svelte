<!--
  @component DatePicker
  日期选择器组件，基于 Bits UI headless + DaisyUI 样式。
  包含日期输入框 + 弹出日历，支持键盘分段输入。

  @prop {DateValue} value - 选中日期（双向绑定）
  @prop {DateValue} minValue - 最小可选日期
  @prop {DateValue} maxValue - 最大可选日期
  @prop {string} placeholder - 输入框占位文本
  @prop {Size} size - 输入框尺寸
  @prop {boolean} disabled - 是否禁用
  @prop {string} error - 错误消息
  @prop {function} onchange - 日期变更回调

  @example
  ```svelte
  <script>
    import { CalendarDate } from '@internationalized/date'
    let date = $state(new CalendarDate(2024, 6, 15))
  </script>
  <DatePicker bind:value={date} />
  ```
-->
<script lang='ts'>
  import type { DateValue } from '@internationalized/date'
  import type { DataAttributes, Size } from '../../types.js'
  import { DatePicker as BitsDatePicker } from 'bits-ui'
  import { cn, getDataAttributes } from '../../utils.js'
  import { getFormControlSizeClasses } from '../control-size.js'

  interface Props {
    /** 选中日期（双向绑定） */
    value?: DateValue
    /** 最小可选日期 */
    minValue?: DateValue
    /** 最大可选日期 */
    maxValue?: DateValue
    /** 周起始日（0=周日，1=周一，默认 1） */
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
    /** 自定义不可用日期判断函数 */
    isDateUnavailable?: (date: DateValue) => boolean
    /** 是否禁用 */
    disabled?: boolean
    /** 尺寸 */
    size?: Size
    /** 错误消息 */
    error?: string
    /** 自定义类名 */
    class?: string
    /** 日期变更回调 */
    onchange?: (value: DateValue | undefined) => void
  }

  let {
    value = $bindable(),
    minValue,
    maxValue,
    weekStartsOn = 1,
    isDateUnavailable,
    disabled = false,
    size = 'md',
    error,
    class: className = '',
    onchange,
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const sizeClasses = $derived(getFormControlSizeClasses(size))
</script>

<div {...dataAttributes} class='fieldset w-full {className}'>
  <BitsDatePicker.Root
    bind:value
    {minValue}
    {maxValue}
    {weekStartsOn}
    {isDateUnavailable}
    {disabled}
    onValueChange={v => onchange?.(v)}
  >
    <BitsDatePicker.Input
      class={cn(
        'flex w-full items-center gap-0.5 rounded-lg border bg-base-100 pr-2 transition-[border-color,box-shadow] duration-150',
        sizeClasses.control,
        error
          ? 'border-error/60 focus-within:ring-2 focus-within:ring-error/15'
          : 'border-base-content/15 hover:border-base-content/25 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {#snippet children({ segments })}
        {#each segments as { part, value: segValue }, index (`${part}-${index}`)}
          <BitsDatePicker.Segment
            {part}
            class='rounded px-0.5 py-0.5 tabular-nums focus:bg-primary focus:text-primary-content focus:outline-none data-[type=literal]:px-0 data-[type=literal]:text-base-content/50'
          >
            {segValue}
          </BitsDatePicker.Segment>
        {/each}
        <BitsDatePicker.Trigger class='ml-auto btn btn-ghost btn-xs btn-circle'>
          <span class='icon-[tabler--calendar] size-4'></span>
        </BitsDatePicker.Trigger>
      {/snippet}
    </BitsDatePicker.Input>

    <BitsDatePicker.Content class='z-50 mt-1 rounded-xl border border-base-content/10 bg-base-100 p-3 shadow-lg' sideOffset={4}>
      <BitsDatePicker.Calendar>
        {#snippet children({ months, weekdays })}
          <BitsDatePicker.Header class='flex items-center justify-between px-1 pb-3'>
            <BitsDatePicker.PrevButton class='btn btn-ghost btn-sm btn-circle'>
              <span class='icon-[tabler--chevron-left] size-4'></span>
            </BitsDatePicker.PrevButton>
            <BitsDatePicker.Heading class='text-sm font-semibold' />
            <BitsDatePicker.NextButton class='btn btn-ghost btn-sm btn-circle'>
              <span class='icon-[tabler--chevron-right] size-4'></span>
            </BitsDatePicker.NextButton>
          </BitsDatePicker.Header>

          {#each months as month (month.value.toString())}
            <BitsDatePicker.Grid class='w-full border-collapse'>
              <BitsDatePicker.GridHead>
                <BitsDatePicker.GridRow class='flex w-full'>
                  {#each weekdays as day, weekdayIndex (weekdayIndex)}
                    <BitsDatePicker.HeadCell class='w-9 text-center text-xs font-medium text-base-content/50'>
                      {day}
                    </BitsDatePicker.HeadCell>
                  {/each}
                </BitsDatePicker.GridRow>
              </BitsDatePicker.GridHead>

              <BitsDatePicker.GridBody>
                {#each month.weeks as weekDates, weekIndex (weekIndex)}
                  <BitsDatePicker.GridRow class='flex w-full'>
                    {#each weekDates as date (date.toString())}
                      <BitsDatePicker.Cell {date} month={month.value} class='p-0'>
                        <BitsDatePicker.Day class='inline-flex size-9 items-center justify-center rounded-lg text-sm transition-colors hover:bg-base-200 data-[selected]:bg-primary data-[selected]:text-primary-content data-[disabled]:opacity-30 data-[unavailable]:line-through data-[unavailable]:opacity-30 data-[outside-month]:text-base-content/30'>
                          {date.day}
                        </BitsDatePicker.Day>
                      </BitsDatePicker.Cell>
                    {/each}
                  </BitsDatePicker.GridRow>
                {/each}
              </BitsDatePicker.GridBody>
            </BitsDatePicker.Grid>
          {/each}
        {/snippet}
      </BitsDatePicker.Calendar>
    </BitsDatePicker.Content>
  </BitsDatePicker.Root>

  {#if error}
    <span class='fieldset-label text-error'>{error}</span>
  {/if}
</div>
