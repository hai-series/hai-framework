<script lang='ts'>
  import ChangePasswordForm from '../../src/lib/components/scenes/iam/ChangePasswordForm.svelte'
  import { useToastFeedback } from '../../src/lib/toast.svelte.js'

  let message = $state('')
  let count = $state(0)
  useToastFeedback(() => message)
</script>

<button onclick={() => message = '安全操作失败'} data-testid='fail'>失败</button>
<button onclick={() => message = ''} data-testid='reset'>重试</button>
<button onclick={() => count++} data-testid='unrelated'>{count}</button>
<ChangePasswordForm errors={{ general: message }} />
