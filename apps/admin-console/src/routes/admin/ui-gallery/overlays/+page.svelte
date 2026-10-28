<!--
  覆盖层 / 主题（Overlays）展示
  Modal / Drawer / Confirm / Toast / Toast-over-Modal /
  FeedbackModal / SettingsModal /
  ThemeToggle / ThemeSelector / LanguageSwitch

  采用分类（DemoSection）+ 可折叠示例卡片（DemoCard，含效果与可复制源码）。
-->
<script lang='ts'>
  import type { ToastProps } from '@h-ai/ui'
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { messageBox, toast } from '@h-ai/ui'

  const toastPositions = $derived<{ value: NonNullable<ToastProps['position']>, label: string }[]>([
    { value: 'bottom-right', label: m.gallery_toast_bottom_right() },
    { value: 'top-right', label: m.gallery_toast_top_right() },
    { value: 'bottom-center', label: m.gallery_toast_bottom_center() },
    { value: 'top-center', label: m.gallery_toast_top_center() },
    { value: 'bottom-left', label: m.gallery_toast_bottom_left() },
    { value: 'top-left', label: m.gallery_toast_top_left() },
  ])

  function showToastQueue() {
    for (let index = 1; index <= 3; index++)
      toast.info(m.gallery_toast_queue_item({ index }), 1000)
  }

  // === 覆盖层状态 ===
  let modalOpen = $state(false)
  let modalSizeOpen = $state(false)
  let modalSize = $state<'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full'>('md')
  let drawerOpen = $state(false)
  let drawerLeftOpen = $state(false)
  let confirmOpen = $state(false)
  let confirmDeleteOpen = $state(false)
  let feedbackOpen = $state(false)
  let settingsOpen = $state(false)
  let toastModalOpen = $state(false)

  // === 设置场景状态 ===
  let themeColor = $state('#4f46e5')
  let settingsActive = $state('appearance')
  const settingsSections = [
    { id: 'appearance', label: m.settings_appearance(), icon: 'icon-[tabler--palette]' },
    { id: 'account', label: m.gallery_demo_account(), icon: 'icon-[tabler--user]' },
    { id: 'notifications', label: m.gallery_demo_notifications(), icon: 'icon-[tabler--bell]' },
  ]

  // === 示例源码 ===
  const codeModal = `<Button variant='primary' onclick={() => open = true}>打开 Modal</Button>

<Modal {open} title='基础对话框' onclose={() => open = false}>
  <p>这是一个基础对话框，支持自定义标题、内容和操作按钮。</p>
  {#snippet footer()}
    <Button onclick={() => open = false}>取消</Button>
    <Button variant='primary' onclick={() => open = false}>确认</Button>
  {/snippet}
</Modal>`

  const codeModalSize = `<Modal {open} title='尺寸: {size}' {size} onclose={() => open = false}>
  <p>支持 sm / md / lg / xl / 2xl / 3xl / 4xl / full 八种尺寸。</p>
</Modal>`

  const codeDrawer = `<Button onclick={() => open = true}>右侧抽屉</Button>

<Drawer {open} position='right' title='右侧抽屉' onclose={() => open = false}>
  <Input placeholder='姓名' />
  <Button variant='primary' onclick={() => open = false}>保存</Button>
</Drawer>`

  const codeConfirm = `<Button variant='error' onclick={() => open = true}>危险操作确认</Button>

<Confirm
  {open}
  title='确认删除'
  message='确定要永久删除此项目吗？此操作不可恢复。'
  variant='error'
  onconfirm={async () => { toast.success('已永久删除'); open = false }}
  oncancel={() => open = false}
/>`

  const codeToast = `<Button variant='info' onclick={() => toast.info('这是一条信息通知')}>信息</Button>
<Button variant='success' onclick={() => toast.success('操作成功完成！')}>成功</Button>
<Button variant='warning' onclick={() => toast.warning('请注意检查配置项')}>警告</Button>
<Button variant='error' onclick={() => toast.error('操作失败，请稍后重试')}>错误</Button>

<!-- 自定义持续时间（毫秒） -->
<Button onclick={() => toast.info('1 秒后消失', 1000)}>1 秒</Button>`

  const codeToastModal = `<!-- ToastContainer 使用 Popover API 进入 top-layer，
     可稳定叠加在 Modal（原生 dialog）之上，不被遮挡。 -->
<Modal {open} title='在弹窗中触发 Toast' onclose={() => open = false}>
  <Button variant='success' onclick={() => toast.success('Toast 显示在弹窗之上！')}>
    触发成功 Toast
  </Button>
</Modal>`

  const codeFeedbackSettings = `<Button onclick={() => feedbackOpen = true}>意见反馈</Button>
<Button onclick={() => settingsOpen = true}>系统设置</Button>

<FeedbackModal bind:open={feedbackOpen} onsubmit={async () => toast.success('反馈已提交')} />
<SettingsModal open={settingsOpen} onclose={() => settingsOpen = false} />`

  const codeTheme = `<ThemeToggle />
<LanguageSwitch />
<ThemeSelector showPreview grouped />
<ThemeSelector showPreview={false} />`

  const codeMessage = `// m 为应用翻译函数；根布局只挂载一次 <ToastContainer />。
toast.success(m.common_success()) // 默认右下角，3 秒后消失
toast.add({ message: m.common_success(), position: 'bottom-center' })
// 连续触发会进入同一队列，每条在展示后单独计时。
toast.info(m.common_success(), 1000)`

  const codeMessageBox = `import { messageBox } from '@h-ai/ui'

const ok = await messageBox.confirm({
  title: '确认操作',
  message: '确定要继续吗？',
  confirmText: '确定',
})

await messageBox.alert('这是一条提示信息')

<!-- 应用根部需挂载一次 <MessageBoxContainer /> -->`

  const codeThemeColorPicker = `<ThemeColorPicker value={themeColor} onchange={c => (themeColor = c)} />`

  const codeSettingsLayout = `<SettingsLayout
  title='设置'
  description='管理你的账户与偏好'
  sections={[{ id: 'appearance', label: '外观', icon: 'icon-[tabler--palette]' }]}
  active={active}
  onselect={id => (active = id)}
>
  {#if active === 'appearance'}<AppearanceSection />{/if}
</SettingsLayout>`
</script>

<div class='space-y-10'>
  <DemoSection
    title={m.gallery_demo_overlay()}
    subtitle='Modal / Drawer / Confirm / Toast'
    iconClass='icon-[tabler--app-window]'
    tone='primary'
  >
    <DemoCard title={m.gallery_demo_modal_dialog()} description={m.gallery_demo_dialog_with_a_title_content_and_footer_actions()} code={codeModal}>
      <div class='space-y-4'>
        <Button variant='primary' onclick={() => modalOpen = true}>{m.gallery_demo_open_dialog()}</Button>
      </div>

      <Modal open={modalOpen} title={m.gallery_demo_basic_dialog()} onclose={() => modalOpen = false}>
        <div class='space-y-4'>
          <p class='text-base-content/70'>{m.gallery_demo_this_basic_dialog_supports_a_custom_title_content()}</p>
          <p class='text-base-content/70'>{m.gallery_demo_select_the_backdrop_or_close_button_to_dismiss()}</p>
          <div class='space-y-2'>
            <Input placeholder={m.gallery_demo_example_input()} />
            <Textarea placeholder={m.gallery_demo_example_text_area()} rows={3} />
          </div>
        </div>
        {#snippet footer()}
          <div class='flex justify-end gap-2'>
            <Button onclick={() => modalOpen = false}>{m.action_cancel()}</Button>
            <Button
              variant='primary'
              onclick={() => {
                toast.success(m.gallery_demo_confirmed())
                modalOpen = false
              }}
            >
              {m.action_confirm()}
            </Button>
          </div>
        {/snippet}
      </Modal>
    </DemoCard>

    <DemoCard title={m.gallery_demo_modal_sizes()} description='sm / md / lg / xl / 2xl / 3xl / 4xl / full' code={codeModalSize}>
      <div class='flex flex-wrap gap-2'>
        {#each ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'] as size (size)}
          <Button
            variant='secondary'
            outline
            onclick={() => {
              modalSize = size as typeof modalSize
              modalSizeOpen = true
            }}
          >
            {size}
          </Button>
        {/each}
      </div>

      <Modal open={modalSizeOpen} title='{m.gallery_demo_size_2()} {modalSize}' size={modalSize} onclose={() => modalSizeOpen = false}>
        <p class='text-base-content/70'>{m.gallery_demo_current_dialog_size()} <strong>{modalSize}</strong>{m.gallery_demo_available_sizes_sm_md_lg_xl_2xl_3xl()}</p>
        {#snippet footer()}
          <div class='flex justify-end'>
            <Button variant='primary' onclick={() => modalSizeOpen = false}>{m.action_close()}</Button>
          </div>
        {/snippet}
      </Modal>
    </DemoCard>

    <DemoCard title={m.gallery_demo_drawer()} description={m.gallery_demo_left_or_right_slide_out_panels_for_forms()} code={codeDrawer}>
      <div class='flex flex-wrap gap-3'>
        <Button variant='secondary' onclick={() => drawerOpen = true}>{m.gallery_demo_right_drawer()}</Button>
        <Button variant='secondary' outline onclick={() => drawerLeftOpen = true}>{m.gallery_demo_left_drawer()}</Button>
      </div>

      <Drawer open={drawerOpen} position='right' title={m.gallery_demo_right_drawer()} onclose={() => drawerOpen = false}>
        <div class='space-y-4'>
          <p class='text-base-content/70'>{m.gallery_demo_use_the_drawer_for_forms_details_or_actions()}</p>
          <Input placeholder={m.gallery_form_name()} />
          <Input placeholder={m.iam_users_form_email()} />
          <Textarea placeholder={m.gallery_demo_notes()} rows={3} />
          <div class='flex gap-2'>
            <Button
              variant='primary'
              onclick={() => {
                toast.success(m.gallery_demo_saved())
                drawerOpen = false
              }}
            >
              {m.action_save()}
            </Button>
            <Button onclick={() => drawerOpen = false}>{m.action_cancel()}</Button>
          </div>
        </div>
      </Drawer>

      <Drawer open={drawerLeftOpen} position='left' title={m.gallery_demo_left_navigation()} onclose={() => drawerLeftOpen = false}>
        <nav class='space-y-2'>
          {#each [m.dashboard_title(), m.iam_users_title(), m.gallery_demo_content_management(), m.settings_title(), m.gallery_demo_activity_log()] as item (item)}
            <button
              class='w-full text-left px-4 py-2 rounded-lg hover:bg-base-200 transition-colors text-sm'
              onclick={() => {
                toast.info(item)
                drawerLeftOpen = false
              }}
            >
              {item}
            </button>
          {/each}
        </nav>
      </Drawer>
    </DemoCard>

    <DemoCard title={m.gallery_demo_confirm_dialog()} description={m.gallery_demo_standard_and_destructive_action_confirmations()} code={codeConfirm}>
      <div class='flex flex-wrap gap-3'>
        <Button variant='warning' onclick={() => confirmOpen = true}>{m.gallery_demo_standard_confirmation()}</Button>
        <Button variant='error' onclick={() => confirmDeleteOpen = true}>{m.gallery_demo_confirm_destructive_action()}</Button>
      </div>

      <Confirm
        open={confirmOpen}
        title={m.gallery_demo_confirm_action()}
        message={m.gallery_demo_continue_with_this_action_it_cannot_be_undone()}
        confirmText={m.gallery_demo_ok()}
        cancelText={m.action_cancel()}
        variant='warning'
        onconfirm={async () => {
          toast.success(m.gallery_demo_action_confirmed())
          confirmOpen = false
        }}
        oncancel={() => confirmOpen = false}
      />

      <Confirm
        open={confirmDeleteOpen}
        title={m.gallery_demo_confirm_deletion()}
        message={m.gallery_demo_permanently_delete_this_project_and_all_related_data()}
        confirmText={m.gallery_demo_delete_permanently()}
        cancelText={m.action_cancel()}
        variant='error'
        onconfirm={async () => {
          toast.success(m.gallery_demo_permanently_deleted())
          confirmDeleteOpen = false
        }}
        oncancel={() => confirmDeleteOpen = false}
      />
    </DemoCard>

    <DemoCard title={m.gallery_demo_toast_notifications()} description={m.gallery_demo_info_success_warning_and_error_with_configurable_duration()} code={codeToast}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_basic_notification()}</p>
          <div class='flex flex-wrap gap-3'>
            <Button variant='info' data-testid='toast-type-info' onclick={() => toast.info(m.gallery_toast_type_info())}>{m.gallery_toast_type_info()}</Button>
            <Button variant='success' data-testid='toast-type-success' onclick={() => toast.success(m.gallery_toast_type_success())}>{m.gallery_toast_type_success()}</Button>
            <Button variant='warning' data-testid='toast-type-warning' onclick={() => toast.warning(m.gallery_toast_type_warning())}>{m.gallery_toast_type_warning()}</Button>
            <Button variant='error' data-testid='toast-type-error' onclick={() => toast.error(m.gallery_toast_type_error())}>{m.gallery_toast_type_error()}</Button>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_custom_duration()}</p>
          <div class='flex flex-wrap gap-3'>
            <Button variant='primary' outline onclick={() => toast.info(m.gallery_demo_dismiss_after_1_second(), 1000)}>{m.gallery_demo_1_second()}</Button>
            <Button variant='primary' outline onclick={() => toast.info(m.gallery_demo_dismiss_after_3_seconds(), 3000)}>{m.gallery_demo_3_seconds()}</Button>
            <Button variant='primary' outline onclick={() => toast.info(m.gallery_demo_dismiss_after_10_seconds(), 10000)}>{m.gallery_demo_10_seconds()}</Button>
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard
      title={m.gallery_demo_toast_above_a_dialog()}
      description={m.gallery_demo_toastcontainer_uses_the_popover_top_layer_to_remain()}
      code={codeToastModal}
    >
      <div class='space-y-3'>
        <p class='text-sm text-base-content/60'>{m.gallery_demo_open_a_dialog_and_trigger_a_toast_inside()}</p>
        <Button variant='primary' onclick={() => toastModalOpen = true}>{m.gallery_demo_open_dialog_and_test_toast()}</Button>
      </div>

      <Modal open={toastModalOpen} title={m.gallery_demo_trigger_toast_in_dialog()} onclose={() => toastModalOpen = false}>
        <div class='space-y-4'>
          <p class='text-base-content/70'>{m.gallery_demo_use_the_buttons_below_to_display_a_toast()}</p>
          <div class='flex flex-wrap gap-3'>
            <Button variant='success' onclick={() => toast.success(m.gallery_demo_toast_is_visible_above_the_dialog())}>{m.gallery_demo_success_toast()}</Button>
            <Button variant='info' onclick={() => toast.info(m.gallery_demo_info_toast_is_also_visible_above_the_dialog())}>{m.gallery_demo_info_toast()}</Button>
            <Button variant='error' onclick={() => toast.error(m.gallery_demo_error_toast_appears_above_the_dialog())}>{m.gallery_demo_error_toast()}</Button>
          </div>
        </div>
        {#snippet footer()}
          <div class='flex justify-end'>
            <Button onclick={() => toastModalOpen = false}>{m.action_close()}</Button>
          </div>
        {/snippet}
      </Modal>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_toast_messages_and_imperative_dialogs()}
    subtitle='toast / messageBox'
    iconClass='icon-[tabler--bell-ringing]'
    tone='secondary'
  >
    <DemoCard title={m.gallery_toast_positions_title()} description={m.gallery_toast_positions_description()} code={codeMessage}>
      <div class='flex flex-wrap gap-3'>
        {#each toastPositions as position (position.value)}
          <Button outline data-testid={`toast-position-${position.value}`} onclick={() => toast.add({ message: position.label, position: position.value })}>{position.label}</Button>
        {/each}
        <Button variant='primary' data-testid='toast-queue' onclick={showToastQueue}>{m.gallery_toast_queue()}</Button>
        <Button variant='ghost' onclick={() => toast.clear()}>{m.gallery_toast_clear()}</Button>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_messagebox_imperative_dialogs()} description={m.gallery_demo_confirmation_and_prompt_dialogs_with_promise_results()} code={codeMessageBox}>
      <div class='flex flex-wrap gap-3'>
        <Button
          variant='primary'
          onclick={async () => {
            const ok = await messageBox.confirm({ title: m.gallery_demo_confirm_action(), message: m.gallery_demo_continue(), confirmText: m.gallery_demo_ok() })
            toast[ok ? 'success' : 'info'](ok ? m.gallery_demo_confirmed() : m.gallery_demo_canceled())
          }}
        >
          {m.gallery_demo_confirm_dialog()}
        </Button>
        <Button
          variant='error'
          onclick={async () => {
            const ok = await messageBox.confirm({ title: m.gallery_demo_delete_confirmation(), message: m.gallery_demo_delete_this_item_this_cannot_be_undone(), confirmText: m.modules_vecdb_op_delete(), confirmVariant: 'error' })
            if (ok)
              toast.success(m.gallery_demo_deleted())
          }}
        >
          {m.gallery_demo_destructive_action_dialog()}
        </Button>
        <Button
          variant='secondary'
          outline
          onclick={async () => {
            await messageBox.alert(m.gallery_demo_this_message_dialog_has_only_an_ok_button())
          }}
        >
          {m.gallery_demo_alert_dialog()}
        </Button>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_workflow_dialogs()}
    subtitle='FeedbackModal / SettingsModal'
    iconClass='icon-[tabler--message-2]'
    tone='info'
  >
    <DemoCard title='FeedbackModal / SettingsModal' description={m.gallery_demo_ready_to_use_feedback_and_settings_dialogs()} code={codeFeedbackSettings}>
      <div class='flex flex-wrap gap-3'>
        <Button variant='primary' outline onclick={() => feedbackOpen = true}>{m.gallery_demo_feedback()}</Button>
        <Button variant='secondary' outline onclick={() => settingsOpen = true}>{m.settings_title()}</Button>
      </div>

      <FeedbackModal
        bind:open={feedbackOpen}
        onsubmit={async () => {
          toast.success(m.gallery_demo_feedback_submitted_thank_you_for_your_suggestion())
        }}
      />
      <SettingsModal open={settingsOpen} onclose={() => settingsOpen = false} />
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_theme_and_language()}
    subtitle='ThemeToggle / ThemeSelector / LanguageSwitch'
    iconClass='icon-[tabler--sun]'
    tone='warning'
  >
    <DemoCard title='ThemeToggle / ThemeSelector / LanguageSwitch' description={m.gallery_demo_appearance_theme_and_language_controls()} code={codeTheme}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_themetoggle_light_and_dark()}</p>
          <ThemeToggle />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_languageswitch()}</p>
          <LanguageSwitch />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_themeselector()}</p>
          <ThemeSelector showPreview grouped />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_themeselector_no_preview()}</p>
          <ThemeSelector showPreview={false} />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_themecolorpicker()} description={m.gallery_demo_theme_presets_and_native_color_picker()} code={codeThemeColorPicker}>
      <div class='space-y-3'>
        <ThemeColorPicker value={themeColor} onchange={c => (themeColor = c)} />
        <p class='text-xs text-base-content/50'>{m.gallery_demo_current_color()}<span class='font-mono'>{themeColor}</span></p>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_application_settings_layout()}
    subtitle='SettingsLayout'
    iconClass='icon-[tabler--adjustments]'
    tone='info'
  >
    <DemoCard title='SettingsLayout' description={m.gallery_demo_settings_with_a_title_section_navigation_and_content()} code={codeSettingsLayout}>
      <SettingsLayout
        title={m.gallery_demo_settings()}
        description={m.gallery_demo_manage_your_account_and_preferences()}
        sections={settingsSections}
        active={settingsActive}
        onselect={id => (settingsActive = id)}
      >
        <div class='rounded-xl border border-base-300 bg-base-200/30 p-5'>
          <p class='text-sm font-medium mb-1'>{m.gallery_demo_current_section()}{settingsSections.find(s => s.id === settingsActive)?.label}</p>
          <p class='text-sm text-base-content/60'>{m.gallery_demo_render_section_content_here_use_the_left_navigation()}</p>
        </div>
      </SettingsLayout>
    </DemoCard>
  </DemoSection>
</div>
