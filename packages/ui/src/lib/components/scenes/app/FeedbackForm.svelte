<!--
  @component FeedbackForm
  可独立承载的反馈收集表单；采集、上传和导出由宿主提供。
  @example
  ```ts
  import type { ComponentProps } from 'svelte'
  import { FeedbackForm } from '@h-ai/ui'
  const props: ComponentProps<typeof FeedbackForm> = { onsubmit: async () => ({ number: 'FB-1', collectionStatus: 'collecting' }) }
  ```
-->
<script lang='ts'>
  import type { DataAttributes, FormLayoutOptions } from '../../../types.js'
  import type { FeedbackAnnotation, FeedbackAttachmentView, FeedbackEvidenceSummary, FeedbackFormData, FeedbackReceipt } from './feedback-types.js'
  import { untrack } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import BareInput from '../../primitives/BareInput.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import Select from '../../primitives/Select.svelte'
  import Textarea from '../../primitives/Textarea.svelte'
  import { collectionLabel } from './feedback-functions.js'
  import FeedbackScreenshot from './FeedbackScreenshot.svelte'

  /**
   * 反馈表单的宿主注入契约，网络和采集服务通过动作回调接入。
   * @example
   * ```ts
   * import type { ComponentProps } from 'svelte'
   * import { FeedbackForm } from '@h-ai/ui'
   * const props: ComponentProps<typeof FeedbackForm> = {
   *   onsubmit: async () => ({ number: 'FB-1', collectionStatus: 'collecting' }),
   * }
   * ```
   */
  interface Props extends FormLayoutOptions {
    labels?: {
      title?: string
      description?: string
      typeLabel?: string
      contentLabel?: string
      contentPlaceholder?: string
      contactLabel?: string
      contactPlaceholder?: string
      cancel?: string
      submit?: string
      errorEmpty?: string
      errorSubmit?: string
      types?: { bug?: string, feature?: string, question?: string, other?: string }
    }
    attachments?: FeedbackAttachmentView[]
    evidenceSummary?: FeedbackEvidenceSummary[]
    onsubmit?: (input: FeedbackFormData) => Promise<void | FeedbackReceipt>
    onannotate?: (annotation: FeedbackAnnotation) => Promise<void>
    /** 宿主准备附件并回填 attachments，使主动添加的图片也可预览、遮挡和标注。 */
    onfileschange?: (files: File[]) => Promise<void>
    onexport?: (input: FeedbackFormData) => Promise<void>
    oncancel?: () => void
    oncomplete?: () => void
    /** 准备新现场后更新，关闭弹窗不会丢失未提交内容。 */
    resetKey?: string
    receipt?: FeedbackReceipt
    class?: string
  }

  let {
    labels = {},
    attachments = [],
    evidenceSummary = [],
    onsubmit,
    onannotate,
    onfileschange,
    onexport,
    oncancel,
    oncomplete,
    resetKey = '',
    receipt = $bindable(),
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    class: className = '',
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const instanceId = $props.id()
  let description = $state('')
  let contact = $state('')
  let feedbackType = $state<NonNullable<FeedbackFormData['type']>>('bug')
  let files = $state<File[]>([])
  let removedAttachmentIds = $state<string[]>([])
  let loading = $state(false)
  let annotating = $state(false)
  let staging = $state(false)
  let filesError = $state(false)
  let exporting = $state(false)
  let error = $state('')
  let previousKey = $state(untrack(() => resetKey))
  const visibleAttachments = $derived(attachments.filter(item => !removedAttachmentIds.includes(item.id)))
  const typeOptions = $derived([
    { value: 'bug', label: labels.types?.bug ?? uiM('feedback_type_bug') },
    { value: 'feature', label: labels.types?.feature ?? uiM('feedback_type_feature') },
    { value: 'question', label: labels.types?.question ?? uiM('feedback_type_question') },
    { value: 'other', label: labels.types?.other ?? uiM('feedback_type_other') },
  ])

  $effect(() => {
    if (previousKey !== resetKey) {
      previousKey = resetKey
      description = ''
      contact = ''
      files = []
      filesError = false
      removedAttachmentIds = []
      receipt = undefined
      error = ''
    }
  })

  function values(): FeedbackFormData {
    return { description: description.trim(), type: feedbackType, contact: contact.trim() || undefined, files: [...files], removedAttachmentIds: [...removedAttachmentIds] }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (loading || annotating || staging || (onfileschange && filesError) || receipt)
      return
    if (!onsubmit) {
      error = labels.errorSubmit ?? uiM('feedback_error_submit')
      return
    }
    loading = true
    error = ''
    try {
      const result = await onsubmit(values())
      if (result)
        receipt = result
      else
        oncomplete?.()
    }
    catch (cause) {
      error = cause instanceof Error ? cause.message : labels.errorSubmit ?? uiM('feedback_error_submit')
    }
    finally {
      loading = false
    }
  }

  async function saveLocal() {
    if (!onexport || exporting || annotating || staging)
      return
    exporting = true
    try {
      await onexport(values())
    }
    catch (cause) {
      error = cause instanceof Error ? cause.message : uiM('feedback_action_failed')
    }
    finally {
      exporting = false
    }
  }

  async function annotate(annotation: FeedbackAnnotation) {
    if (!onannotate || loading)
      return
    annotating = true
    try {
      await onannotate(annotation)
    }
    finally {
      annotating = false
    }
  }

  async function stageFiles() {
    if (!onfileschange || staging || !files.length)
      return
    staging = true
    filesError = false
    error = ''
    try {
      await onfileschange([...files])
      files = []
    }
    catch (cause) {
      filesError = true
      error = cause instanceof Error ? cause.message : uiM('feedback_action_failed')
    }
    finally {
      staging = false
    }
  }

  function selectFiles(event: Event & { currentTarget: HTMLInputElement }) {
    files = [...files, ...Array.from(event.currentTarget.files ?? [])]
    // 清空原生选择值允许再次选择同名文件，不绑定浏览器的文件路径。
    event.currentTarget.value = ''
    if (onfileschange)
      void stageFiles()
  }

  function removeFile(index: number) {
    files = files.filter((_, position) => position !== index)
    if (!files.length)
      filesError = false
  }
</script>

<form {...dataAttributes} class={`feedback-form min-w-0 space-y-4 ${className}`} onsubmit={submit} data-feedback-ui='true' data-feedback-ignore='true'>
  {#if error}<div class='alert alert-error break-words' role='alert'>{error}</div>{/if}
  {#if receipt}
    <div role='status' class='alert alert-success block space-y-2 break-words'>
      <p class='font-medium'>{uiM('feedback_accepted', { number: receipt.number })}</p>
      <p>{collectionLabel(receipt.collectionStatus)}</p>
      <p class='text-sm'>{uiM('feedback_accepted_hint')}</p>
    </div>
  {:else}
    <p class='text-sm text-base-content/65'>{labels.description ?? uiM('feedback_quick_hint')}</p>
    <FormLayout {columns} {labelPosition} {labelWidth}>
      <FormField for={`${instanceId}-description`} label={labels.contentLabel ?? uiM('feedback_optional_description')}>
        <Textarea id={`${instanceId}-description`} name='description' class='h-28' maxlength={10000} placeholder={labels.contentPlaceholder ?? uiM('feedback_content_placeholder')} bind:value={description} disabled={loading} />
      </FormField>
    </FormLayout>
    {#if visibleAttachments.length}
      <section class='space-y-3' aria-label={uiM('feedback_screenshots')}>
        {#each visibleAttachments as attachment (attachment.id)}
          <div class='rounded-lg border border-base-content/10 p-3 min-w-0 space-y-2'>
            <div class='flex items-center justify-between gap-3'>
              <span class='min-w-0 text-sm break-all'>{attachment.name}</span>
              <Button size='xs' variant='ghost' disabled={loading} ariaLabel={`${uiM('feedback_remove')} ${attachment.name}`} onclick={() => removedAttachmentIds = [...removedAttachmentIds, attachment.id]}>{uiM('feedback_remove')}</Button>
            </div>
            {#if attachment.mimeType?.startsWith('image/') && attachment.url}<FeedbackScreenshot {attachment} onannotate={!loading && onannotate ? annotate : undefined} />{/if}
            {#if attachment.missingReason}<p class='text-warning text-sm break-words'>{uiM('feedback_missing')}: {attachment.missingReason}</p>{/if}
          </div>
        {/each}
      </section>
    {/if}
    <details class='rounded-lg border border-base-content/10 p-3'>
      <summary class='cursor-pointer text-sm font-medium'>{uiM('feedback_more')}</summary>
      <div class='pt-3 space-y-4'>
        <FormLayout {columns} {labelPosition} {labelWidth}>
          <FormField for={`${instanceId}-type`} label={labels.typeLabel ?? uiM('feedback_type_label')}><Select id={`${instanceId}-type`} options={typeOptions} bind:value={feedbackType} disabled={loading} /></FormField>
          <FormField for={`${instanceId}-contact`} label={labels.contactLabel ?? uiM('feedback_contact_label')}><Input id={`${instanceId}-contact`} placeholder={labels.contactPlaceholder ?? uiM('feedback_contact_placeholder')} bind:value={contact} maxlength={254} autocomplete='email' disabled={loading} /></FormField>
          <FormField for={`${instanceId}-files`} label={uiM('feedback_add_files')}><BareInput id={`${instanceId}-files`} type='file' accept='.png,.jpg,.jpeg,.webp,.txt,.log,.json,image/png,image/jpeg,image/webp,text/plain,application/json' multiple disabled={loading || staging} class='file-input file-input-bordered w-full' onchange={selectFiles} /></FormField>
        </FormLayout>
        {#each files as file, index (`${file.name}:${file.lastModified}:${index}`)}
          <div class='flex items-center gap-2 min-w-0 text-sm'><span class='min-w-0 flex-1 break-all'>{file.name}</span><Button size='xs' variant='ghost' disabled={loading || staging} ariaLabel={`${uiM('feedback_remove')} ${file.name}`} onclick={() => removeFile(index)}>{uiM('feedback_remove')}</Button></div>
        {/each}
        {#if onfileschange && filesError}<Button size='sm' loading={staging} onclick={stageFiles}>{uiM('feedback_retry')}</Button>{/if}
      </div>
    </details>
    {#if evidenceSummary.length}
      <details class='rounded-lg border border-base-content/10 p-3'>
        <summary class='cursor-pointer text-sm font-medium'>{uiM('feedback_materials')}</summary>
        <dl class='space-y-2 pt-3 text-sm'>
          {#each evidenceSummary as item, index (`${item.label}:${index}`)}
            <div class='min-w-0'><dt class='font-medium'>{item.label}{item.count === undefined ? '' : ` · ${item.count}`}</dt><dd class='text-base-content/65 break-words'>{item.status === 'missing' ? uiM('feedback_missing') : item.status === 'not-applicable' ? uiM('feedback_not_applicable') : item.status === 'partial' ? uiM('feedback_partial') : uiM('feedback_complete')}{item.detail ? ` · ${item.detail}` : ''}</dd></div>
          {/each}
        </dl>
      </details>
    {/if}
  {/if}
  <div class='flex flex-wrap justify-end gap-2 border-t border-base-content/10 pt-4'>
    {#if onexport}<Button variant='ghost' loading={exporting} disabled={annotating || staging} onclick={saveLocal}>{uiM('feedback_local_export')}</Button>{/if}
    {#if oncancel}<Button variant='ghost' onclick={oncancel}>{receipt ? uiM('feedback_close') : labels.cancel ?? uiM('feedback_cancel')}</Button>{/if}
    {#if !receipt}<Button type='submit' variant='primary' loading={loading || staging} disabled={annotating || Boolean(onfileschange && filesError)}>{labels.submit ?? uiM('feedback_submit')}</Button>{/if}
  </div>
</form>
