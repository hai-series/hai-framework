<script lang='ts'>
  // LLM 对话面板：发送对话、按需注入记忆，并在展示回复后后台提取记忆（避免二次 LLM 调用阻塞回复）
  import type { LabMessage } from '$lib/ai-lab-types.js'
  import * as m from '$lib/paraglide/messages.js'
  import { rememberExchange, sendChat } from '$lib/services/ai-lab.js'
  import { Button, Card, ToggleInput } from '@h-ai/ui'

  interface Props {
    profileId: string
    onmemorychange: () => void
  }

  const { profileId, onmemorychange }: Props = $props()
  const sessionId = crypto.randomUUID()
  let messages = $state<LabMessage[]>([
    { role: 'assistant', content: m.chat_welcome() },
  ])
  let prompt = $state('')
  let useMemory = $state(true)
  let busy = $state(false)
  let error = $state('')
  let remembered = $state(0)
  let remembering = $state(false)
  let chatAbortController: AbortController | undefined
  let memoryAbortController: AbortController | undefined

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const content = prompt.trim()
    if (!content || busy)
      return

    memoryAbortController?.abort()
    memoryAbortController = undefined
    remembering = false

    const nextMessages = [...messages, { role: 'user' as const, content }]
    messages = nextMessages
    prompt = ''
    busy = true
    error = ''
    remembered = 0
    chatAbortController = new AbortController()
    let replyAdded = false
    try {
      const result = await sendChat({
        profileId,
        sessionId,
        messages: nextMessages.slice(1).slice(-20),
        useMemory,
      }, (reply) => {
        if (replyAdded) {
          messages = messages.map((message, index) => index === messages.length - 1
            ? { role: 'assistant', content: reply }
            : message)
        }
        else {
          messages = [...messages, { role: 'assistant', content: reply }]
          replyAdded = true
        }
      }, chatAbortController.signal)
      if (!replyAdded) {
        messages = [...messages, { role: 'assistant', content: m.chat_empty_reply() }]
        replyAdded = true
      }
      // 记忆提取与对话解耦：回复已展示，后台异步提取，不阻塞 UI
      if (useMemory && result.reply)
        void remember(content, result.reply)
    }
    catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError')
        return
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
    }
    finally {
      chatAbortController = undefined
      busy = false
    }
  }

  // 后台提取本轮记忆；失败仅静默忽略，不打断对话
  async function remember(userMessage: string, assistantMessage: string) {
    const controller = new AbortController()
    memoryAbortController?.abort()
    memoryAbortController = controller
    remembering = true
    try {
      const result = await rememberExchange({ profileId, userMessage, assistantMessage }, controller.signal).catch(() => undefined)
      if (!result || memoryAbortController !== controller)
        return
      remembered = result.remembered
      if (result.remembered > 0)
        onmemorychange()
    }
    finally {
      if (memoryAbortController === controller) {
        memoryAbortController = undefined
        remembering = false
      }
    }
  }

  function resetConversation() {
    chatAbortController?.abort()
    memoryAbortController?.abort()
    memoryAbortController = undefined
    messages = [{ role: 'assistant', content: m.chat_welcome() }]
    remembered = 0
    remembering = false
    error = ''
  }

  $effect(() => () => {
    chatAbortController?.abort()
    memoryAbortController?.abort()
  })
</script>

<Card class='flex min-h-[42rem] flex-col border border-base-content/8 bg-base-100/88 shadow-xl shadow-base-content/5' padding='none'>
  <div class='flex flex-wrap items-center justify-between gap-3 border-b border-base-content/8 px-5 py-4'>
    <div>
      <h2 class='flex items-center gap-2 text-lg font-semibold'>
        <span class='icon-[tabler--messages] size-5 text-primary'></span>
        {m.chat_title()}
      </h2>
      <p class='mt-1 text-sm text-base-content/55'>{m.chat_description()}</p>
    </div>
    <div class='flex items-center gap-3'>
      <label class='flex cursor-pointer items-center gap-2 text-sm'>
        <ToggleInput bind:checked={useMemory} class='toggle toggle-primary toggle-sm' />
        <span>{m.chat_memory_toggle()}</span>
      </label>
      <Button size='sm' variant='ghost' onclick={resetConversation}>{m.chat_reset()}</Button>
    </div>
  </div>

  <div class='flex-1 space-y-4 overflow-y-auto px-5 py-5' data-testid='chat-messages' aria-live='polite'>
    {#each messages as message, index (`${message.role}-${index}`)}
      <div class:justify-end={message.role === 'user'} class='flex'>
        <div
          class='max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap'
          class:bg-primary={message.role === 'user'}
          class:text-primary-content={message.role === 'user'}
          class:bg-base-200={message.role === 'assistant'}
          data-role={message.role}
        >
          {message.content}
        </div>
      </div>
    {/each}
    {#if busy}
      <div class='flex items-center gap-2 text-sm text-base-content/55' data-testid='chat-loading'>
        <span class='loading loading-dots loading-sm text-primary'></span>
        {m.chat_thinking()}
      </div>
    {/if}
  </div>

  <form class='border-t border-base-content/8 p-4' onsubmit={submit}>
    {#if error}
      <div class='alert alert-error mb-3 py-2 text-sm' role='alert'>{error}</div>
    {/if}
    {#if remembering}
      <div class='mb-2 flex items-center gap-2 text-xs text-base-content/50'>
        <span class='loading loading-dots loading-xs'></span>
        {m.chat_remembering()}
      </div>
    {:else if remembered > 0}
      <div class='mb-2 text-xs text-success'>{m.chat_remembered({ count: remembered })}</div>
    {/if}
    <div class='flex items-end gap-3'>
      <textarea
        class='textarea textarea-bordered min-h-24 flex-1 resize-none bg-base-100'
        bind:value={prompt}
        placeholder={m.chat_placeholder()}
        maxlength='4000'
        aria-label={m.chat_input_label()}
      ></textarea>
      <Button type='submit' variant='primary' disabled={busy || !prompt.trim()} data-testid='chat-send'>
        <span class='icon-[tabler--send] size-4'></span>
        {m.chat_send()}
      </Button>
    </div>
  </form>
</Card>
