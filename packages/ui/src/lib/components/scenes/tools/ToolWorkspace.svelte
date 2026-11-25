<!--
  @component ToolWorkspace
  以表单、预设和执行进度呈现工具，业务执行由宿主回调提供。
  @example
  ```ts
  import { mount } from 'svelte'
  import { ToolWorkspace } from '@h-ai/ui'
  const component = mount(ToolWorkspace, { target: document.body, props: {
    tools: [{ name: 'echo', description: '回显文字', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }],
    onrun: async request => ({ id: 'run-1', status: 'succeeded', result: request.input }),
  } })
  ```
-->
<script lang='ts'>
  import type { ToolResource, ToolRun, ToolRunRequest, ToolWorkspaceProps } from './workspace-types.js'
  import { onDestroy, onMount, untrack } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import { uiM } from '../../../messages.js'
  import { notifyError, notifyWarning } from '../../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import Combobox from '../../compounds/Combobox.svelte'
  import Confirm from '../../compounds/Confirm.svelte'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Button from '../../primitives/Button.svelte'
  import { asRecord, buildToolInput, describeToolFields, toolResourceIds, toolResourceOptions } from './tool-form.js'

  const { tools, resources = [], initialRun, onrunchange, onrun, onstatus, oncancel, onartifact, onerror, pollIntervalMs = 1000, class: className, ...rest }: ToolWorkspaceProps = $props()
  const dataAttributes = $derived(getDataAttributes(rest))
  const uid = $props.id()
  let name = $state('')
  let query = $state('')
  let values = $state<Record<string, unknown>>({})
  let rawInput = $state('{}')
  let run = $state<ToolRun | undefined>(untrack(() => initialRun))
  let pendingKey = $state(untrack(() => initialRun?.idempotencyKey ?? ''))
  let pendingRequest = $state.raw<ToolRunRequest>()
  let pendingNotFound = $state(false)
  let restoring = $state(untrack(() => !!initialRun && !!onstatus))
  let confirmNewOperation = $state(false)
  let submitting = $state(false)
  let cancelling = $state(false)
  let disconnected = $state(false)
  let generatedResources = $state<ToolResource[]>([])
  let initialized = ''
  let request: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const selected = $derived(tools.find(tool => tool.name === name))
  const visible = $derived(tools.filter(tool => `${tool.title ?? tool.name} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase())))
  const fields = $derived(selected
    ? describeToolFields(selected.inputSchema)
    : [])
  const simple = $derived(fields.filter(field => field.kind !== 'json'))
  const advanced = $derived(fields.filter(field => field.kind === 'json'))
  const active = $derived(!!run && ['queued', 'running', 'cancelling'].includes(run.status))
  const unverifiedReceipt = $derived(run?.status === 'unknown' && !run.idempotencyKey)
  const inputLocked = $derived(submitting || active || restoring || !!pendingRequest || unverifiedReceipt || (!!pendingKey && !pendingNotFound))
  const submitBlocked = $derived(submitting || active || restoring || unverifiedReceipt || (!!pendingKey && !pendingRequest && !pendingNotFound))
  const availableResources = $derived([
    ...resources,
    ...generatedResources,
  ])
  const resultText = $derived.by(() => {
    try {
      return typeof run?.result === 'string'
        ? run.result
        : run?.result === undefined
        ? ''
        : JSON.stringify(run.result, null, 2)
    }
    catch { return uiM('tool_result_unavailable') }
  })

  $effect(() => {
    const first = tools[0]?.name
    if (!untrack(() => name) && first)
      name = first
  })

  $effect(() => {
    const tool = selected
    if (tool && tool.name !== untrack(() => initialized)) {
      const previous = initialized
      initialized = tool.name
      values = Object.fromEntries(describeToolFields(tool.inputSchema)
        .filter(field => field.defaultValue !== undefined || (field.required && (field.kind === 'boolean' || field.kind === 'string')))
        .map(field => [
          field.name,
          field.defaultValue === undefined
            ? field.kind === 'boolean'
              ? false
              : ''
            : field.defaultValue,
        ]))
      rawInput = '{}'
      if (previous) {
        // 未知提交的幂等键保留到拿回真实回执，换表单也不能产生第二次扣费。
        if (!pendingKey)
          run = undefined
        disconnected = false
        request?.abort()
        clearTimeout(timer)
      }
    }
  })

  $effect(() => {
    onrunchange?.(run)
  })

  $effect(() => {
    const completed = run
    if (completed?.status === 'succeeded' && completed.artifacts?.length) {
      untrack(() => {
        const merged = new SvelteMap(generatedResources.map(item => [item.id, item]))
        for (const artifact of completed.artifacts ?? []) {
          merged.delete(artifact.id)
          merged.set(artifact.id, artifact)
        }
        generatedResources = [
          ...merged.values(),
        ].slice(-100)
      })
    }
  })

  onMount(() => {
    if (run && onstatus)
      void refresh()
  })

  function failed(error: unknown) {
    notifyError(error, uiM('tool_failed'))
    onerror?.(error)
  }

  function setValue(key: string, value: unknown) {
    values = { ...values, [key]: value }
  }

  function schedule(signal: AbortSignal) {
    clearTimeout(timer)
    if (signal.aborted || !run || !['queued', 'running', 'cancelling'].includes(run.status) || !onstatus)
      return
    const interval = Number.isFinite(pollIntervalMs)
      ? Math.max(250, pollIntervalMs)
      : 1000
    timer = setTimeout(() => {
      void refresh(signal)
    }, interval)
  }

  async function refresh(signal?: AbortSignal) {
    if (!run || !onstatus || cancelling || signal?.aborted)
      return
    if (!signal) {
      request?.abort()
      request = new AbortController()
      signal = request.signal
    }
    const id = run.id
    if (run.status === 'unknown')
      restoring = true
    try {
      const result = await onstatus(id, signal)
      if (signal.aborted || run?.id !== id)
        return
      if (result) {
        run = result
        pendingKey = result.idempotencyKey ?? ''
        if (!pendingKey)
          pendingRequest = undefined
        pendingNotFound = false
      }
      else {
        pendingNotFound = true
        run = {
          ...run,
          status: 'unknown',
          message: uiM('tool_submission_not_found'),
        }
      }
      disconnected = false
      schedule(signal)
    }
    catch (error) {
      if (!signal.aborted) {
        disconnected = true
        failed(error)
      }
    }
    finally {
      if (!signal.aborted)
        restoring = false
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!selected || submitBlocked)
      return
    let invocation = pendingRequest
    if (!invocation) {
      let input: Record<string, unknown>
      if (fields.length) {
        const parsed = buildToolInput(selected.inputSchema, values)
        if (!parsed.success) {
          notifyWarning(uiM('tool_invalid_field', { field: parsed.field }))
          return
        }
        input = parsed.input
      }
      else {
        try {
          const parsed = asRecord(JSON.parse(rawInput))
          if (!parsed)
            throw new TypeError('Tool input must be an object')
          input = parsed
        }
        catch {
          notifyWarning(uiM('tool_invalid_json'))
          return
        }
      }
      pendingKey ||= crypto.randomUUID()
      invocation = { name: selected.name, input, idempotencyKey: pendingKey }
      pendingRequest = invocation
    }
    request?.abort()
    const current = new AbortController()
    request = current
    submitting = true
    disconnected = false
    pendingNotFound = false
    const idempotencyKey = invocation.idempotencyKey
    try {
      const result = await onrun(invocation, current.signal)
      if (current.signal.aborted)
        return
      run = result
      pendingKey = result.idempotencyKey ?? ''
      if (!pendingKey)
        pendingRequest = undefined
      schedule(current.signal)
    }
    catch (error) {
      if (!current.signal.aborted) {
        run = {
          id: `pending.${idempotencyKey}`,
          idempotencyKey,
          status: 'unknown',
          message: uiM('tool_submission_unknown'),
        }
        disconnected = true
        failed(error)
      }
    }
    finally {
      if (!current.signal.aborted)
        submitting = false
    }
  }

  function startAnotherOperation() {
    // 只结束当前界面的等待，不宣称远端已取消；新意图生成新的幂等键。
    request?.abort()
    clearTimeout(timer)
    pendingRequest = undefined
    pendingKey = ''
    pendingNotFound = false
    restoring = false
    disconnected = false
    run = undefined
  }

  async function cancel() {
    if (!run || !oncancel || cancelling)
      return
    request?.abort()
    clearTimeout(timer)
    const current = new AbortController()
    request = current
    cancelling = true
    // 被取消请求接管的状态查询不会再复位恢复标志。
    restoring = false
    try {
      const result = await oncancel(run.id, current.signal)
      if (!current.signal.aborted) {
        run = result
        disconnected = false
        schedule(current.signal)
      }
    }
    catch (error) {
      if (!current.signal.aborted) {
        disconnected = true
        failed(error)
      }
    }
    finally {
      if (!current.signal.aborted)
        cancelling = false
    }
  }

  onDestroy(() => {
    request?.abort()
    clearTimeout(timer)
  })
</script>

<section {...dataAttributes} class={cn('hai-tool-workspace grid min-w-0 content-start gap-4', className)} aria-label={uiM('tool_workspace')}>
  <div class='grid min-w-0 items-end gap-3 sm:grid-cols-2'>
    <label class='grid min-w-0 gap-1 text-sm'>{uiM('tool_search')}<input class='input w-full' bind:value={query} disabled={inputLocked} /></label>
    <label class='grid min-w-0 gap-1 text-sm'>{uiM('tool_choose')}
      <select class='select w-full' bind:value={name} disabled={inputLocked}>
        {#if selected && !visible.some(tool => tool.name === selected?.name)}<option value={selected.name}>{selected.title ?? selected.name}</option>{/if}
        {#if !tools.length}<option value=''>{uiM('tool_empty')}</option>{/if}
        {#each visible as tool (tool.name)}<option value={tool.name}>{tool.title ?? tool.name}</option>{/each}
      </select>
    </label>
  </div>
  {#if selected}
    <p class='text-sm leading-relaxed text-base-content/70'>{selected.description}</p>
    {#if selected.examples?.length}
      <div class='flex flex-wrap items-center gap-2' aria-label={uiM('tool_examples')}>
        <span class='text-xs text-base-content/60'>{uiM('tool_examples')}</span>
        {#each selected.examples as example (example.label)}
          <Button size='sm' variant='ghost' disabled={inputLocked} onclick={() => {
            values = { ...example.input }
            rawInput = JSON.stringify(example.input, null, 2)
          }}>{example.label}</Button>
        {/each}
      </div>
    {/if}
    <form class='grid min-w-0 gap-4' onsubmit={submit}>
      <FormLayout columns={2}>
        {#each simple as field (field.name)}
          <FormField label={field.title} hint={field.description} required={field.required} for={`${uid}-${field.name}`}>
            {#if field.kind === 'resource' || field.kind === 'resources'}
              {@const multiple = field.kind === 'resources'}
              {@const chosen = toolResourceIds(values[field.name])}
              <Combobox options={toolResourceOptions(availableResources, field.mediaType, chosen)} {multiple}
                        value={multiple
                          ? chosen
                          : String(values[field.name] ?? '')} disabled={inputLocked}
                        placeholder={uiM('tool_resource_choose')} onchange={value => setValue(field.name, value)} />
              <details class='mt-2 text-xs text-base-content/60'>
                <summary class='cursor-pointer'>{uiM('tool_resource_manual')}</summary>
                <p class='mt-2'>{uiM('tool_resource_manual_hint')}</p>
                <textarea class='textarea mt-2 w-full font-mono text-xs' rows={multiple ? 3 : 1}
                          aria-label={uiM('tool_resource_manual_field', { field: field.title })} disabled={inputLocked}
                          value={Array.isArray(values[field.name])
                            ? chosen.join('\n')
                            : String(values[field.name] ?? '')}
                          oninput={event => setValue(field.name, event.currentTarget.value)}></textarea>
              </details>
            {:else if field.kind === 'boolean'}
              <input id={`${uid}-${field.name}`} class='checkbox' type='checkbox' checked={values[field.name] === true} disabled={inputLocked}
                     onchange={event => setValue(field.name, event.currentTarget.checked)} />
            {:else if field.kind === 'enum'}
              <select id={`${uid}-${field.name}`} class='select w-full' required={field.required} disabled={inputLocked}
                      value={field.values?.indexOf(values[field.name] as string | number | boolean | null) ?? -1}
                      onchange={event => setValue(field.name, field.values?.[Number(event.currentTarget.value)])}>
                <option value={-1}>{uiM('tool_choose_value')}</option>
                {#each field.values ?? [] as value, index (index)}<option value={index}>{String(value)}</option>{/each}
              </select>
            {:else if field.kind === 'number' || field.kind === 'integer'}
              <input id={`${uid}-${field.name}`} class='input w-full' type='number' step={field.kind === 'integer'
                ? 1
                : 'any'}
                     required={field.required} min={field.minimum} max={field.maximum} value={String(values[field.name] ?? '')} disabled={inputLocked}
                     oninput={event => setValue(field.name, event.currentTarget.value)} />
            {:else}
              <textarea id={`${uid}-${field.name}`} class='textarea w-full' rows={3} required={field.required && (field.minLength ?? 0) > 0} minlength={field.minLength} maxlength={field.maxLength}
                        value={String(values[field.name] ?? '')} disabled={inputLocked} oninput={event => setValue(field.name, event.currentTarget.value)}></textarea>
            {/if}
          </FormField>
        {/each}
      </FormLayout>
      {#if advanced.length || !fields.length}
        <details class='rounded-lg border border-base-300 p-3' open={advanced.some(field => field.required)}>
          <summary class='cursor-pointer text-sm font-medium'>{uiM('tool_advanced')}</summary>
          <div class='mt-3'>
            <FormLayout>
              {#each advanced as field (field.name)}
                <FormField label={field.title} hint={field.description} required={field.required} for={`${uid}-${field.name}`}>
                  <textarea id={`${uid}-${field.name}`} class='textarea w-full font-mono text-sm' rows={4} disabled={inputLocked}
                            value={typeof values[field.name] === 'string'
                              ? values[field.name] as string
                              : values[field.name] === undefined
                              ? ''
                              : JSON.stringify(values[field.name], null, 2)}
                            oninput={event => setValue(field.name, event.currentTarget.value)}></textarea>
                </FormField>
              {:else}
                <FormField label={uiM('tool_parameters')} for={`${uid}-json`}>
                  <textarea id={`${uid}-json`} class='textarea w-full font-mono text-sm' rows={6} bind:value={rawInput} disabled={inputLocked}></textarea>
                </FormField>
              {/each}
            </FormLayout>
          </div>
        </details>
      {/if}
      <div class='flex flex-wrap items-center gap-2'>
        <Button type='submit' variant='primary' loading={submitting} disabled={submitBlocked} submitHint>{pendingKey && run?.status === 'unknown'
          ? uiM('tool_retry_submission')
          : uiM('tool_run')}</Button>
        {#if active && oncancel}<Button disabled={cancelling || run?.status === 'cancelling'} loading={cancelling || run?.status === 'cancelling'} onclick={cancel}>{uiM('tool_cancel')}</Button>{/if}
      </div>
    </form>
  {:else}
    <div class='rounded-lg border border-dashed border-base-300 p-6 text-sm text-base-content/60'>{uiM('tool_empty')}</div>
  {/if}
  {#if run}
    <section class='grid min-w-0 gap-3 rounded-lg border border-base-300 p-4' aria-label={uiM('tool_result')}>
      <div class='flex flex-wrap items-center gap-2' role='status'><span class='text-sm font-medium'>{uiM(`tool_status_${run.status}`)}</span>
        {#if run.message}<span class='min-w-0 text-sm break-words text-base-content/70'>{run.message}</span>{/if}
        {#if (disconnected || run.status === 'unknown') && onstatus}<Button size='sm' disabled={restoring || cancelling} loading={restoring} onclick={() => refresh()}>{uiM('tool_resume')}</Button>{/if}
        {#if run.status === 'unknown' && !restoring}<Button size='sm' variant='ghost' onclick={() => { confirmNewOperation = true }}>{uiM('tool_new_operation')}</Button>{/if}
      </div>
      {#if active}
        <progress class='progress progress-primary w-full' aria-label={uiM('tool_progress')} max={1}
                  value={run.progress === undefined
                    ? undefined
                    : Math.min(1, Math.max(0, run.progress))}></progress>
      {/if}
      {#if resultText}<pre class='max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-base-200 p-3 text-sm'>{resultText}</pre>{/if}
      {#each run.artifacts ?? [] as artifact (artifact.id)}
        <Button variant='ghost' onclick={() => onartifact?.(artifact)} disabled={!onartifact}>{artifact.title}</Button>
      {/each}
    </section>
  {/if}
  {#if confirmNewOperation}
    <Confirm bind:open={confirmNewOperation} title={uiM('tool_new_operation')} message={uiM('tool_new_operation_confirm')}
             confirmText={uiM('tool_new_operation')} onconfirm={startAnotherOperation} />
  {/if}
</section>
