<script lang='ts'>
  import type { PanelGuideId } from '#lib/components/lab-api-examples.js'
  import type { DemoId } from '#lib/demo-input.js'
  import { MarkdownRenderer } from '@h-ai/ui'
  import { labApiExample } from '#lib/components/lab-api-examples.js'
  import * as m from '#lib/paraglide/messages.js'

  interface Props {
    id: DemoId | PanelGuideId
  }

  const { id }: Props = $props()
  const example = $derived(labApiExample(id))
  const code = $derived(['```ts', example.code, '```'].join('\n'))
</script>

<details data-testid={`api-guide-${id}`} class='mt-4 min-w-0 rounded-xl border border-base-content/10 bg-base-100'>
  <summary class='cursor-pointer rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary'>
    <span>{m.api_guide_title()}</span>
    <code class='ml-2 font-mono text-xs wrap-anywhere text-primary'>{example.api}</code>
  </summary>
  <div class='min-w-0 border-t border-base-content/10 px-4 pt-3 pb-4 [contain:inline-size]'>
    <MarkdownRenderer content={code} allowHtmlTags={false} enableHighlight={false} fontSize='0.8125rem' />
    <dl class='mt-3 space-y-2 text-sm leading-6'>
      <div>
        <dt class='font-semibold'>{m.api_guide_params()}</dt>
        <dd class='text-base-content/75'>{example.params()}</dd>
      </div>
      <div>
        <dt class='font-semibold'>{m.api_guide_output()}</dt>
        <dd class='text-base-content/75'>{example.output()}</dd>
      </div>
      <div>
        <dt class='font-semibold'>{m.api_guide_config()}</dt>
        <dd class='text-base-content/75'>{example.config()}</dd>
      </div>
    </dl>
  </div>
</details>
