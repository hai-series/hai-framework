<!-- 先建立禁止网络访问的文档，再在其内部重建已脱敏的页面事件。 -->
<script lang='ts'>
  import type { Replayer } from '@rrweb/replay'
  import type { FeedbackEvidenceView } from './feedback-types.js'
  import { uiM } from '../../../messages.js'
  import { errorMessage, useToastFeedback } from '../../../toast.svelte.js'
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
  // 回放引擎会替换内层快照文档，限制在外层文档设定并由其子文档继承。
  const replayDocument = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src about:; base-uri 'none'; form-action 'none'"><style>body{margin:0;overflow:hidden}iframe{border:0}</style></head><body></body></html>`
  let viewport = $state<HTMLDivElement>()
  let sandboxFrame = $state<HTMLIFrameElement>()
  let target = $state.raw<HTMLElement>()
  let player = $state.raw<Replayer>()
  let loading = $state(true)
  let error = $state('')
  let playing = $state(false)
  let position = $state(0)
  let duration = $state(0)
  let viewportWidth = $state(0)
  let replayWidth = $state(1024)
  let replayHeight = $state(768)
  const scale = $derived(viewportWidth
    ? Math.min(1, viewportWidth / replayWidth)
    : 1)
  let frame = 0
  let events: ReplayEvent[] = []
  let snapshotOffset = 0

  function isEvent(value: unknown): value is ReplayEvent {
    return value !== null && typeof value === 'object' && 'timestamp' in value && typeof value.timestamp === 'number'
      && 'type' in value && typeof value.type === 'number' && Number.isInteger(value.type) && value.type >= 0 && value.type <= 6 && 'data' in value
  }
  function createPlayer(Player: typeof Replayer, root: HTMLElement) {
    const current = new Player(events, {
      root,
      showWarning: false,
      showDebug: false,
      loadTimeout: 1000,
    })
    current.on('resize', () => {
      if (player === current) {
        replayWidth = Number(current.iframe.width) || 1024
        replayHeight = Number(current.iframe.height) || 768
      }
    })
    return current
  }
  function seek(value: number) {
    if (!player || !target)
      return
    playing = false
    cancelAnimationFrame(frame)
    const Player = player.constructor as typeof Replayer
    player.destroy()
    player = createPlayer(Player, target)
    position = Math.max(0, Math.min(duration, value))
    player.pause(Math.max(position, snapshotOffset) + 1)
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
    let styles: HTMLStyleElement | undefined
    const observer = new ResizeObserver(() => {
      viewportWidth = container.clientWidth
    })
    observer.observe(container)
    void (async () => {
      try {
        const records = await load()
        if (!active)
          return
        events = records.map(item => item.data.event).filter(isEvent).sort((a, b) => a.timestamp - b.timestamp)
        const snapshot = events.find(event => event.type === 2)
        if (!snapshot || events.length < 2)
          return
        const [{ Replayer: Player }, { default: replayStyles }] = await Promise.all([
          import('@rrweb/replay'),
          import('@rrweb/replay/dist/style.css?inline'),
        ])
        if (!active)
          return
        styles = root.ownerDocument.createElement('style')
        styles.textContent = replayStyles
        root.ownerDocument.head.append(styles)
        duration = Math.max(0, events.at(-1)!.timestamp - events[0]!.timestamp)
        snapshotOffset = Math.max(0, snapshot.timestamp - events[0]!.timestamp)
        player = createPlayer(Player, root)
        player.pause(snapshotOffset + 1)
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
      styles?.remove()
    }
  })
  useToastFeedback(() => error)
</script>

<div class='space-y-3 min-w-0'>
  <p class='text-sm text-base-content/65'>{uiM('feedback_replay_hint')}</p>
  {#if loading}<p role='status'>{uiM('feedback_loading')}</p>
  {:else if !player}<p class='rounded bg-base-200 p-4 text-sm'>{uiM('feedback_replay_empty')}</p>{/if}
  <div bind:this={viewport} class='relative w-full overflow-hidden rounded-lg bg-base-200' style:height={player
    ? `${replayHeight * scale}px`
    : '0'}>
    <iframe
      bind:this={sandboxFrame}
      title={uiM('feedback_replay')}
      srcdoc={replayDocument}
      sandbox='allow-same-origin'
      tabindex='-1'
      class='origin-top-left border-0 pointer-events-none'
      width={replayWidth}
      height={replayHeight}
      style:transform={`scale(${scale})`}
      onload={() => {
        const replay = sandboxFrame?.contentDocument
        target = replay?.URL === 'about:srcdoc'
          ? replay.body
          : undefined
      }}
    ></iframe>
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
