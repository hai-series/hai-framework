<script lang='ts'>
  import type { FeedbackAnnotation, FeedbackAttachmentView, FeedbackFormData } from '../../src/lib/components/scenes/app/index.js'
  import FeedbackForm from '../../src/lib/components/scenes/app/FeedbackForm.svelte'

  const { onsubmit, onannotate, onfileschange }: {
    onsubmit: (input: FeedbackFormData) => Promise<void>
    onannotate: (input: FeedbackAnnotation) => Promise<void>
    onfileschange: (files: File[]) => Promise<void>
  } = $props()
  let attachments = $state<FeedbackAttachmentView[]>([])

  async function stage(files: File[]) {
    await onfileschange(files)
    attachments = files.map((file, index) => ({ id: `file-${index}`, name: file.name, mimeType: file.type, size: file.size, url: `blob:file-${index}` }))
  }
</script>

<FeedbackForm {onsubmit} {onannotate} {attachments} onfileschange={stage} />
