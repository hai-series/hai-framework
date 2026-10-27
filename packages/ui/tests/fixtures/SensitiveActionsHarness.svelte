<script lang='ts'>
  import type { SensitiveActionsOptions } from '../../src/lib/components/scenes/iam/index.js'
  import { untrack } from 'svelte'
  import { createSensitiveActions, ReauthenticationDialog } from '../../src/lib/components/scenes/iam/index.js'

  const { actions }: { actions: SensitiveActionsOptions } = $props()
  const confirmation = untrack(() => createSensitiveActions(actions))
  let result = $state<string | null | undefined>()
  $effect(() => {
    confirmation.configure({ enabled: true, operations: ['orders.approve'] })
    return () => confirmation.cancel()
  })
</script>

<button data-testid='sensitive-start' onclick={async () => {
  result = await confirmation.authorize('orders.approve')
}}>Approve</button>
<span data-testid='sensitive-result'>{result ?? ''}</span>
<ReauthenticationDialog open={confirmation.open} loading={confirmation.loading} error={confirmation.error} onsubmit={password => confirmation.submit(password)} onclose={() => confirmation.cancel()} />
