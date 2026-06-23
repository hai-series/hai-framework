<!--
  Admin Console - 认证页面布局
  使用 @h-ai/ui 的 AuthShell 场景组件（左右分栏 split 布局）
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import * as m from '$lib/paraglide/messages'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()
</script>

<AuthShell
  variant='split'
  brandTitle={m.app_title()}
  brandText={m.meta_description()}
>
  {#snippet logo()}
    <div class='flex items-center gap-2.5'>
      <div class='flex size-9 items-center justify-center rounded-xl bg-primary/10 lg:bg-primary-content/15'>
        <span class='icon-[tabler--box] size-5 text-primary lg:text-primary-content'></span>
      </div>
      <span class='text-base font-semibold tracking-tight text-base-content lg:text-primary-content'>{m.app_title()}</span>
    </div>
  {/snippet}

  {@render children()}

  {#snippet footer()}
    <p class='text-2xs text-base-content/30'>Powered by hai-framework</p>
  {/snippet}
</AuthShell>
