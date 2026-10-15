<!--
  Admin Console - 认证页面布局
  使用 @h-ai/ui 的 AuthShell 场景组件（左右分栏 split 布局）
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()
</script>

<!-- AuthPanel 自带配置驱动布局；找回与重置页沿用独立结果页布局。 -->
{#if page.route.id === '/(auth)/auth/login' || page.route.id === '/(auth)/auth/register'}
  {@render children()}
{:else}
  <AuthShell
    {...page.data.iamPublicConfig?.ui}
    variant={page.data.iamPublicConfig?.ui.variant ?? 'split'}
    brandTitle={page.data.iamPublicConfig?.ui.brandTitle || m.app_title()}
    brandText={page.data.iamPublicConfig?.ui.brandText || m.meta_description()}
  >
    {#snippet logo()}
      {#if page.data.iamPublicConfig?.ui.logoUrl}
        <img src={page.data.iamPublicConfig.ui.logoUrl} alt={m.app_title()} class='h-12 max-w-full object-contain' />
      {:else}
        <div class='flex items-center gap-2.5'>
          <div class='flex size-9 items-center justify-center rounded-xl bg-primary/10 lg:bg-primary-content/15'>
            <span class='icon-[tabler--box] size-5 text-primary lg:text-primary-content'></span>
          </div>
          <span class='text-base font-semibold tracking-tight text-base-content lg:text-primary-content'>{m.app_title()}</span>
        </div>
      {/if}
    {/snippet}

    {@render children()}

    {#snippet footer()}
      <p class='text-2xs text-base-content/30'>Powered by hai-framework</p>
    {/snippet}
  </AuthShell>
{/if}
