<!--
  @component Calendar
  日历组件，基于 Bits UI headless + DaisyUI 样式。
  支持单选/多选、日期范围限制、自定义不可用日期。

  @prop {DateValue} value - 选中日期（双向绑定）
  @prop {DateValue} minValue - 最小可选日期
  @prop {DateValue} maxValue - 最大可选日期
  @prop {number} weekStartsOn - 周起始日（0=周日，1=周一）
  @prop {function} isDateUnavailable - 自定义不可用日期判断函数
  @prop {function} onchange - 日期变更回调

  @example
  ```svelte
  <script>
    import { CalendarDate } from '@internationalized/date'
    let date = $state(new CalendarDate(2024, 1, 15))
  </script>
  <Calendar bind:value={date} />
  ```
-->
<script lang='ts'>
  import type { DateValue } from '@internationalized/date'
  import { Calendar as BitsCalendar } from 'bits-ui'

  interface Props {
    /** 选中日期（双向绑定） */
    value?: DateValue
    /** 占位日期（控制日历显示月份） */
    placeholder?: DateValue
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
    /** 是否只读 */
    readonly?: boolean
    /** 自定义类名 */
    class?: string
    /** 日期变更回调 */
    onchange?: (value: DateValue | undefined) => void
  }

  let {
    value = $bindable(),
    placeholder = $bindable(),
    minValue,
    maxValue,
    weekStartsOn = 1,
    isDateUnavailable,
    disabled = false,
    readonly: isReadonly = false,
    class: className = '',
    onchange,
  }: Props = $props()
</script>

<div class={className}>
  <BitsCalendar.Root
    type='single'
    bind:value
    bind:placeholder
    {minValue}
    {maxValue}
    {weekStartsOn}
    {isDateUnavailable}
    {disabled}
    readonly={isReadonly}
    onValueChange={v => onchange?.(v)}
  >
    {#snippet children({ months, weekdays })}
      <BitsCalendar.Header class='flex items-center justify-between px-1 pb-3'>
        <BitsCalendar.PrevButton class='btn btn-ghost btn-sm btn-circle'>
          <span class='icon-[tabler--chevron-left] size-4'></span>
        </BitsCalendar.PrevButton>
        <BitsCalendar.Heading class='text-sm font-semibold' />
        <BitsCalendar.NextButton class='btn btn-ghost btn-sm btn-circle'>
          <span class='icon-[tabler--chevron-right] size-4'></span>
        </BitsCalendar.NextButton>
      </BitsCalendar.Header>

      {#each months as month}
        <BitsCalendar.Grid class='w-full border-collapse'>
          <BitsCalendar.GridHead>
            <BitsCalendar.GridRow class='flex w-full'>
              {#each weekdays as day}
                <BitsCalendar.HeadCell class='w-9 text-center text-xs font-medium text-base-content/50'>
                  {day}
                </BitsCalendar.HeadCell>
              {/each}
            </BitsCalendar.GridRow>
          </BitsCalendar.GridHead>

          <BitsCalendar.GridBody>
            {#each month.weeks as weekDates}
              <BitsCalendar.GridRow class='flex w-full'>
                {#each weekDates as date}
                  <BitsCalendar.Cell {date} month={month.value} class='p-0'>
                    <BitsCalendar.Day class='inline-flex size-9 items-center justify-center rounded-lg text-sm transition-colors hover:bg-base-200 data-[selected]:bg-primary data-[selected]:text-primary-content data-[disabled]:opacity-30 data-[unavailable]:line-through data-[unavailable]:opacity-30 data-[outside-month]:text-base-content/30'>
                      {date.day}
                    </BitsCalendar.Day>
                  </BitsCalendar.Cell>
                {/each}
              </BitsCalendar.GridRow>
            {/each}
          </BitsCalendar.GridBody>
        </BitsCalendar.Grid>
      {/each}
    {/snippet}
  </BitsCalendar.Root>
</div>
