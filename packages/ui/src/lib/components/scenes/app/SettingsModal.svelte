<!--
  @component SettingsModal
  应用设置模态框，包含语言和主题切换功能。
  内置多语言支持，自动跟随全局 locale

  @prop {boolean} open - 是否显示模态框（双向绑定）
  @prop {string} currentLanguage - 当前语言
  @prop {string} currentTheme - 当前主题
  @prop {function} onlanguagechange - 语言变更回调
  @prop {function} onthemechange - 主题变更回调
-->
<script lang='ts'>
  import IconButton from '../../primitives/IconButton.svelte'
  import BareButton from '../../primitives/BareButton.svelte'
  import { uiM } from '../../../messages.js'
  
  interface Props {
    open?: boolean
    currentLanguage?: string
    currentTheme?: string
    languages?: { value: string, label: string, icon?: string }[]
    themes?: { value: string, label: string }[]
    onlanguagechange?: (lang: string) => void
    onthemechange?: (theme: string) => void
    onclose?: () => void
  }

  let {
    open = $bindable(false),
    currentLanguage = 'zh-cn',
    currentTheme = 'light',
    languages = [
      { value: 'zh-cn', label: '简体中文', icon: '🇨🇳' },
      { value: 'en-us', label: 'English', icon: '🇺🇸' },
    ],
    themes = [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'corporate', label: 'Corporate' },
      { value: 'luxury', label: 'Luxury' },
      { value: 'pastel', label: 'Pastel' },
    ],
    onlanguagechange,
    onthemechange,
    onclose,
  }: Props = $props()

  function handleClose() {
    open = false
    onclose?.()
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity'
    onclick={handleBackdropClick}
  >
    <div
      class='relative w-full max-w-lg mx-4 transform overflow-hidden rounded-2xl bg-base-100 shadow-xl transition-all'
      role='dialog'
      aria-modal='true'
    >
      <!-- 标题栏 -->
      <div class='flex items-center justify-between border-b border-base-content/10 px-6 py-4'>
        <h3 class='text-lg font-semibold text-base-content'>{uiM('settings_title')}</h3>
        <IconButton
          size="sm"
          variant="ghost"
          label={uiM('settings_close')}
          onclick={handleClose}
          class="hover:bg-base-content/10"
        >
          {#snippet children()}
            <span class='icon-[tabler--x] size-5'></span>
          {/snippet}
        </IconButton>
      </div>

      <!-- 内容区 -->
      <div class='overflow-y-auto p-6' style='max-height: calc(85vh - 4rem);'>
        <!-- 语言设置 -->
        <section class='mb-8'>
          <h4 class='mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-base-content/60'>
            <span class='icon-[tabler--world] size-4'></span>
            {uiM('settings_language')}
          </h4>
          <div class='flex gap-3'>
            {#each languages as lang (lang.value)}
              <BareButton
                type='button'
                class='group flex flex-1 items-center justify-center gap-3 rounded-xl border-2 px-6 py-4 text-base font-medium transition-all duration-200
                  hover:border-primary/60 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                  {currentLanguage === lang.value
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-base-content/15 bg-base-100 text-base-content/80"}'
                onclick={() => onlanguagechange?.(lang.value)}
                role="option"
                ariaSelected={currentLanguage === lang.value}
              >
                {#if lang.icon}
                  <span class='text-2xl'>{lang.icon}</span>
                {/if}
                <span>{lang.label}</span>
                {#if currentLanguage === lang.value}
                  <span class='icon-[tabler--check] size-5 text-primary'></span>
                {/if}
              </BareButton>
            {/each}
          </div>
        </section>

        <!-- 主题设置 -->
        <section>
          <h4 class='mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-base-content/60'>
            <span class='icon-[tabler--sun] size-4'></span>
            {uiM('settings_theme')}
          </h4>
          <div class='grid gap-2.5 grid-cols-2 sm:grid-cols-3'>
            {#each themes as theme (theme.value)}
              <BareButton
                type='button'
                class='group relative flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all duration-200
                  hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                  {currentTheme === theme.value
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-base-content/10 bg-base-100 hover:bg-base-50"}'
                onclick={() => onthemechange?.(theme.value)}
                role="option"
                ariaSelected={currentTheme === theme.value}
              >
                {#if currentTheme === theme.value}
                  <div class='absolute -right-1 -top-1 rounded-full bg-primary p-0.5 text-primary-content shadow'>
                    <span class='icon-[tabler--check] size-3'></span>
                  </div>
                {/if}

                <!-- 主题预览 -->
                <div data-theme={theme.value} class='flex items-center gap-2 rounded-lg bg-base-100 p-2 ring-1 ring-base-content/10' aria-hidden='true'>
                  <span class='text-sm font-bold text-base-content'>Aa</span>
                  <div class='flex flex-1 gap-1'>
                    <span class='h-3 flex-1 rounded bg-primary'></span>
                    <span class='h-3 flex-1 rounded bg-secondary'></span>
                    <span class='h-3 flex-1 rounded bg-accent'></span>
                  </div>
                </div>

                <span class='text-xs font-medium text-base-content/80 group-hover:text-base-content'>
                  {theme.label}
                </span>
              </BareButton>
            {/each}
          </div>
        </section>
      </div>
    </div>
  </div>
{/if}
