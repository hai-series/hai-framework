<script lang='ts'>
  import type { PageData } from './$types'
  import { FeedbackList, ui } from '@h-ai/ui'
  import { staffFeedbackActions } from '#lib/services/feedback.js'

  const { data }: { data: PageData } = $props()
  const { hasPerm } = ui.usePermission()
  const canProcess = $derived(hasPerm('feedback:process'))
</script>

{#key data.feedbackId}
  <FeedbackList actions={staffFeedbackActions} initialId={data.feedbackId} {canProcess} canReply={canProcess} />
{/key}
