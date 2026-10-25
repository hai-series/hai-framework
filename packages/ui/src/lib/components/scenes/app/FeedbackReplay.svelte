<!-- 按需加载回放引擎；仅接受宿主已脱敏的页面事件，不执行原应用脚本。 -->
<script lang='ts'>
  import type { Replayer } from '@rrweb/replay'
  import type { FeedbackEvidenceView } from './feedback-types.js'
  import { uiM } from '../../../messages.js'
  import { errorMessage } from '../../../toast.svelte.js'
  import Button from '../../primitives/Button.svelte'

  const { load }: { load: () => Promise<FeedbackEvidenceView[]> } = $props()
  /**
   * 回放引擎自身的事件契约；不复制第三方格式。
   * @example 模块内部上下文
   * ```ts
   * const records: ReplayEvent[] = []
   * ```
   */
  type ReplayEvent = Exclude<ConstructorParameters<typeof Replayer>[0][number], string>
  let viewport = $state<HTMLDivElement>()
  let target = $state<HTMLDivElement>()
  let player = $state.raw<Replayer>()
  let loading = $state(true)
  let error = $state('')
  let playing = $state(false)
  let position = $state(0)
  let duration = $state(0)
  let scale = $state(1)
  let height = $state(400)
  let frame = 0
  let events: ReplayEvent[] = []
  let snapshotOffset = 0

  function isEvent(value: unknown): value is ReplayEvent {
    return value !== null && typeof value === 'object' && 'timestamp' in value && typeof value.timestamp === 'number'
      && 'type' in value && typeof value.type === 'number' && Number.isInteger(value.type) && value.type >= 0 && value.type <= 6 && 'data' in value
  }
  function construct() {
    if (!player || !target)
      return
    const Player = player.constructor as typeof Replayer
    player.destroy()
    player = new Player(events, { root: target, showWarning: false, showDebug: false, loadTimeout: 1000 })
  }
  function seek(value: number) {
    playing = false
    cancelAnimationFrame(frame)
    construct()
    position = Math.max(0, Math.min(duration, value))
    player?.pause(Math.max(position, snapshotOffset) + 1)
  }
  function update() {
    if (!playing || !player)
      return
    position = Math.min(duration, player.getCurrentTime())
    if (position >= duration) {
      player.pause()
      playing = false
      return
    }
    frame = requestAnimationFrame(update)
  }
  function play() {
    if (!player)
      return
    if (position >= duration)
      seek(0)
    playing = true
    player.play(Math.max(position, snapshotOffset))
    cancelAnimationFrame(frame)
    update()
  }
  function pause() {
    player?.pause()
    playing = false
    cancelAnimationFrame(frame)
  }

  $effect(() => {
    const root = target
    const container = viewport
    if (!root || !container)
      return
    let active = true
    const observer = new ResizeObserver(() => {
      const width = Number(player?.iframe.width) || 1024
      scale = Math.min(1, container.clientWidth / width)
      height = (Number(player?.iframe.height) || 768) * scale
    })
    void (async () => {
      try {
        const records = await load()
        if (!active)
          return
        events = records.map(item => item.data.event).filter(isEvent).sort((a, b) => a.timestamp - b.timestamp)
        const snapshot = events.find(event => event.type === 2)
        if (!snapshot || events.length < 2)
          return
        const { Replayer: Player } = await import('@rrweb/replay')
        await import('@rrweb/replay/dist/style.css')
        if (!active)
          return
        duration = Math.max(0, events.at(-1)!.timestamp - events[0]!.timestamp)
        snapshotOffset = Math.max(0, snapshot.timestamp - events[0]!.timestamp)
        player = new Player(events, { root, showWarning: false, showDebug: false, loadTimeout: 1000 })
        player.pause(snapshotOffset + 1)
        observer.observe(container)
      }
      catch (cause) {
        if (active)
          error = errorMessage(cause, uiM('feedback_action_failed'))
      }
      finally {
        if (active)
          loading = false
      }
    })()
    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      player?.destroy()
      player = undefined
    }
  })
</script>

<div class='space-y-3 min-w-0'>
  <p class='text-sm text-base-content/65'>{uiM('feedback_replay_hint')}</p>
  {#if error}<p class='text-error text-sm break-words' role='alert'>{error}</p>{/if}
  {#if loading}<p role='status'>{uiM('feedback_loading')}</p>
  {:else if !player}<p class='rounded bg-base-200 p-4 text-sm'>{uiM('feedback_replay_empty')}</p>{/if}
  <div bind:this={viewport} class='relative w-full overflow-hidden rounded-lg bg-base-200' style:height={player ? `${height}px` : '0'}>
    <div bind:this={target} class='origin-top-left' style:transform={`scale(${scale})`}></div>
  </div>
  {#if player}
    <div class='flex flex-wrap items-center gap-2'>
      <Button size='sm' disabled={playing} onclick={play}>{uiM('feedback_replay_play')}</Button>
      <Button size='sm' variant='ghost' disabled={!playing} onclick={pause}>{uiM('feedback_replay_pause')}</Button>
      <input type='range' min={0} max={Math.max(1, duration)} step={1} value={position} oninput={event => seek(Number(event.currentTarget.value))} aria-label={uiM('feedback_replay')} class='range range-xs min-w-24 flex-1' />
      <span class='text-xs tabular-nums'>{Math.floor(position / 1000)} / {Math.ceil(duration / 1000)} s</span>
    </div>
  {/if}
</div>
