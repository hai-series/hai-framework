<!-- 登录和注册共用协议提示；弹窗不会清空表单或触发提交。 -->
<script lang='ts'>
  import type { AgreementDisplay } from '../types.js'
  import { uiM } from '../../../messages.js'
  import Modal from '../../compounds/Modal.svelte'
  import BareButton from '../../primitives/BareButton.svelte'
  import MarkdownRenderer from '../ai/MarkdownRenderer.svelte'

  const { agreements }: { agreements?: AgreementDisplay } = $props()
  let selected = $state<'user' | 'privacy' | null>(null)
  let open = $state(false)
  const url = $derived(selected === 'user' ? agreements?.userAgreementUrl : agreements?.privacyPolicyUrl)
  const markdown = $derived(selected === 'user' ? agreements?.userAgreementMarkdown : agreements?.privacyPolicyMarkdown)
  const hasUserAgreement = $derived(Boolean(agreements?.userAgreementMarkdown || agreements?.userAgreementUrl))
  const hasPrivacyPolicy = $derived(Boolean(agreements?.privacyPolicyMarkdown || agreements?.privacyPolicyUrl))
  const title = $derived(selected === 'user' ? uiM('agreement_user_agreement') : uiM('agreement_privacy_policy'))

  function show(kind: 'user' | 'privacy') {
    selected = kind
    open = true
  }
</script>

{#snippet openPage()}
  <a href={url} target='_blank' rel='noopener noreferrer' class='link link-primary text-sm'>{uiM('agreement_open_page')}</a>
{/snippet}

{#if hasUserAgreement || hasPrivacyPolicy}
  <p class='text-xs text-base-content/50 text-center'>
    {uiM('agreement_prefix')}
    {#if hasUserAgreement}
      <BareButton type='button' class='link link-primary' onclick={() => show('user')}>{uiM('agreement_user_agreement')}</BareButton>
    {/if}
    {#if hasUserAgreement && hasPrivacyPolicy}{uiM('agreement_and')}{/if}
    {#if hasPrivacyPolicy}
      <BareButton type='button' class='link link-primary' onclick={() => show('privacy')}>{uiM('agreement_privacy_policy')}</BareButton>
    {/if}
  </p>
  <Modal bind:open {title} size='lg' height='min(80dvh, 48rem)' bodyClass='p-0' footer={url ? openPage : undefined}>
    {#if open && markdown}
      <!-- 正文优先；复用安全 Markdown 渲染，不开启原始 HTML 或协议页不需要的代码工具。 -->
      <MarkdownRenderer content={markdown} class='p-6' enableHighlight={false} showCopyButton={false} breaks={false} />
    {:else if open && url}
      <!-- 配置只允许 HTTP(S)；协议隔离显示，不允许执行脚本或顶层导航。 -->
      <iframe src={url} {title} sandbox='' referrerpolicy='no-referrer' class='h-full min-h-80 w-full border-0 bg-white'></iframe>
    {/if}
  </Modal>
{/if}
