<script lang='ts'>
  import type { ScheduleInputConfig } from '../../src/lib/components/compounds/schedule-input-config.js'
  import { ScheduleInput } from '../../src/lib/components/compounds/index.js'

  let config = $state<ScheduleInputConfig>({
    kind: 'schedule',
    timezone: 'Asia/Shanghai',
    precision: 'minute',
    allowCron: true,
  })
  let schedule = $state('0 10 * * *')
  let valid = $state(false)
  let changeCount = $state(0)

  function toggleCron(): void {
    config = { ...config, allowCron: !config.allowCron }
  }
</script>

<button type='button' data-toggle-cron onclick={toggleCron}>Toggle Cron</button>
<output data-schedule>{schedule}</output>
<output data-valid>{String(valid)}</output>
<output data-change-count>{changeCount}</output>

<ScheduleInput
  config={config}
  bind:value={schedule}
  bind:valid={valid}
  onchange={() => changeCount += 1}
/>
