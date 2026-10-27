<!--
  @component GuideHost
  GuideHost 组件的公开使用示例。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { GuideHost, createGuide } from '@h-ai/ui'
  const guide = createGuide({ tours: [], persistence: 'memory' })
  const host = mount(GuideHost, { target: document.body, props: { guide, locale: 'zh-CN', scope: 'demo' } })
  await unmount(host)
  guide.stop()
  ```
-->
<script lang='ts'>
  import type { GuideController } from '../../../guide-types.js'
  import type { DataAttributes } from '../../../types.js'
  import { getUILocale, uiM } from '../../../messages.js'
  import Alert from '../../compounds/Alert.svelte'
  import Button from '../../primitives/Button.svelte'
  import GuideHostContent from './GuideHostContent.svelte'

  /** GuideHost 组件的属性契约。
   * @example
   * ```ts
   * import type { ComponentProps } from 'svelte'
   * import { GuideHost } from '@h-ai/ui'
   * const props: Partial<ComponentProps<typeof GuideHost>> = {}
   * void props
   * ```
   */
  interface Props {
    guide: GuideController
    locale?: string
    scope?: string
    autoStart?: string
  }
  const { guide, locale = getUILocale(), ...rest }: Props & DataAttributes = $props()
  function release() {
    guide.stop()
    guide.closeHelp()
  }
</script>

<svelte:boundary onerror={release}>
  <GuideHostContent {guide} {locale} {...rest} />
  {#snippet failed(_error, reset)}
    <div class='fixed bottom-4 right-4 z-[1150] max-w-[calc(100vw-2rem)]' data-testid='guide-error'>
      <Alert variant='warning'>
        <span>{uiM('guide_startFailed', undefined, locale)}</span>
        <Button variant='ghost' size='sm' onclick={() => {
          guide.defer()
          reset()
        }}>{uiM('guide_close', undefined, locale)}</Button>
      </Alert>
    </div>
  {/snippet}
</svelte:boundary>
