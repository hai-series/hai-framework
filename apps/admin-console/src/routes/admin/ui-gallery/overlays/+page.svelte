<!--
  覆盖层 / 主题（Overlays）展示
  Modal / Drawer / Confirm / Toast / Toast-over-Modal /
  FeedbackModal / SettingsModal /
  ThemeToggle / ThemeSelector / LanguageSwitch

  采用分类（DemoSection）+ 可折叠示例卡片（DemoCard，含效果与可复制源码）。
-->
<script lang='ts'>
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import { toast } from '@h-ai/ui'

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
  onconfirm={async () => { toast.error('已永久删除'); open = false }}
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
</script>

<div class='space-y-10'>
  <DemoSection
    title='覆盖层'
    subtitle='Modal / Drawer / Confirm / Toast'
    iconClass='icon-[tabler--app-window]'
    tone='primary'
  >
    <DemoCard title='Modal 对话框' description='基础对话框，支持标题、内容、底部操作' code={codeModal}>
      <div class='space-y-4'>
        <Button variant='primary' onclick={() => modalOpen = true}>打开 Modal</Button>
      </div>

      <Modal open={modalOpen} title='基础对话框' onclose={() => modalOpen = false}>
        <div class='space-y-4'>
          <p class='text-base-content/70'>这是一个基础对话框，支持自定义标题、内容和操作按钮。</p>
          <p class='text-base-content/70'>点击遮罩层或关闭按钮可关闭。</p>
          <div class='space-y-2'>
            <Input placeholder='示例输入框' />
            <Textarea placeholder='示例文本域' rows={3} />
          </div>
        </div>
        {#snippet footer()}
          <div class='flex justify-end gap-2'>
            <Button onclick={() => modalOpen = false}>取消</Button>
            <Button
              variant='primary'
              onclick={() => {
                toast.success('已确认')
                modalOpen = false
              }}
            >
              确认
            </Button>
          </div>
        {/snippet}
      </Modal>
    </DemoCard>

    <DemoCard title='Modal 尺寸' description='sm / md / lg / xl / 2xl / 3xl / 4xl / full' code={codeModalSize}>
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

      <Modal open={modalSizeOpen} title='尺寸: {modalSize}' size={modalSize} onclose={() => modalSizeOpen = false}>
        <p class='text-base-content/70'>当前对话框尺寸为 <strong>{modalSize}</strong>，共支持 sm / md / lg / xl / 2xl / 3xl / 4xl / full 八种尺寸。</p>
        {#snippet footer()}
          <div class='flex justify-end'>
            <Button variant='primary' onclick={() => modalSizeOpen = false}>关闭</Button>
          </div>
        {/snippet}
      </Modal>
    </DemoCard>

    <DemoCard title='Drawer 抽屉' description='左/右侧滑出面板，适合表单与导航' code={codeDrawer}>
      <div class='flex flex-wrap gap-3'>
        <Button variant='secondary' onclick={() => drawerOpen = true}>右侧抽屉</Button>
        <Button variant='secondary' outline onclick={() => drawerLeftOpen = true}>左侧抽屉</Button>
      </div>

      <Drawer open={drawerOpen} position='right' title='右侧抽屉' onclose={() => drawerOpen = false}>
        <div class='space-y-4'>
          <p class='text-base-content/70'>抽屉内容区域，适合放置表单、详细信息或操作面板。</p>
          <Input placeholder='姓名' />
          <Input placeholder='邮箱' />
          <Textarea placeholder='备注' rows={3} />
          <div class='flex gap-2'>
            <Button
              variant='primary'
              onclick={() => {
                toast.success('已保存')
                drawerOpen = false
              }}
            >
              保存
            </Button>
            <Button onclick={() => drawerOpen = false}>取消</Button>
          </div>
        </div>
      </Drawer>

      <Drawer open={drawerLeftOpen} position='left' title='左侧导航' onclose={() => drawerLeftOpen = false}>
        <nav class='space-y-2'>
          {#each ['仪表盘', '用户管理', '内容管理', '系统设置', '操作日志'] as item (item)}
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

    <DemoCard title='Confirm 确认框' description='常规确认与危险操作确认' code={codeConfirm}>
      <div class='flex flex-wrap gap-3'>
        <Button variant='warning' onclick={() => confirmOpen = true}>常规确认</Button>
        <Button variant='error' onclick={() => confirmDeleteOpen = true}>危险操作确认</Button>
      </div>

      <Confirm
        open={confirmOpen}
        title='确认操作'
        message='您确定要执行此操作吗？操作完成后将无法撤销。'
        confirmText='确定'
        cancelText='取消'
        variant='warning'
        onconfirm={async () => {
          toast.success('操作已确认')
          confirmOpen = false
        }}
        oncancel={() => confirmOpen = false}
      />

      <Confirm
        open={confirmDeleteOpen}
        title='确认删除'
        message='确定要永久删除此项目吗？所有关联数据将一并删除，此操作不可恢复。'
        confirmText='永久删除'
        cancelText='取消'
        variant='error'
        onconfirm={async () => {
          toast.error('已永久删除')
          confirmDeleteOpen = false
        }}
        oncancel={() => confirmDeleteOpen = false}
      />
    </DemoCard>

    <DemoCard title='Toast 通知' description='信息/成功/警告/错误，支持自定义持续时间' code={codeToast}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>基础通知</p>
          <div class='flex flex-wrap gap-3'>
            <Button variant='info' onclick={() => toast.info('这是一条信息通知')}>信息</Button>
            <Button variant='success' onclick={() => toast.success('操作成功完成！')}>成功</Button>
            <Button variant='warning' onclick={() => toast.warning('请注意检查配置项')}>警告</Button>
            <Button variant='error' onclick={() => toast.error('操作失败，请稍后重试')}>错误</Button>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>自定义持续时间</p>
          <div class='flex flex-wrap gap-3'>
            <Button variant='primary' outline onclick={() => toast.info('1 秒后消失', 1000)}>1 秒</Button>
            <Button variant='primary' outline onclick={() => toast.info('3 秒后消失', 3000)}>3 秒</Button>
            <Button variant='primary' outline onclick={() => toast.info('10 秒后消失', 10000)}>10 秒</Button>
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard
      title='Toast 叠加在弹窗之上'
      description='ToastContainer 使用 Popover top-layer，弹窗打开时仍可见'
      code={codeToastModal}
    >
      <div class='space-y-3'>
        <p class='text-sm text-base-content/60'>先打开弹窗，再在弹窗内触发 Toast，可验证 Toast 不会被弹窗遮挡。</p>
        <Button variant='primary' onclick={() => toastModalOpen = true}>打开弹窗并测试 Toast</Button>
      </div>

      <Modal open={toastModalOpen} title='在弹窗中触发 Toast' onclose={() => toastModalOpen = false}>
        <div class='space-y-4'>
          <p class='text-base-content/70'>点击下方按钮，Toast 应显示在本弹窗之上，而不会被遮挡。</p>
          <div class='flex flex-wrap gap-3'>
            <Button variant='success' onclick={() => toast.success('Toast 显示在弹窗之上！')}>成功 Toast</Button>
            <Button variant='info' onclick={() => toast.info('信息 Toast 也不会被遮挡')}>信息 Toast</Button>
            <Button variant='error' onclick={() => toast.error('错误 Toast 同样置顶')}>错误 Toast</Button>
          </div>
        </div>
        {#snippet footer()}
          <div class='flex justify-end'>
            <Button onclick={() => toastModalOpen = false}>关闭</Button>
          </div>
        {/snippet}
      </Modal>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='场景对话框'
    subtitle='FeedbackModal / SettingsModal'
    iconClass='icon-[tabler--message-2]'
    tone='info'
  >
    <DemoCard title='FeedbackModal / SettingsModal' description='开箱即用的反馈与设置场景弹窗' code={codeFeedbackSettings}>
      <div class='flex flex-wrap gap-3'>
        <Button variant='primary' outline onclick={() => feedbackOpen = true}>意见反馈</Button>
        <Button variant='secondary' outline onclick={() => settingsOpen = true}>系统设置</Button>
      </div>

      <FeedbackModal
        bind:open={feedbackOpen}
        onsubmit={async () => {
          toast.success('反馈已提交，感谢您的建议！')
        }}
      />
      <SettingsModal open={settingsOpen} onclose={() => settingsOpen = false} />
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='主题与语言'
    subtitle='ThemeToggle / ThemeSelector / LanguageSwitch'
    iconClass='icon-[tabler--sun]'
    tone='warning'
  >
    <DemoCard title='ThemeToggle / ThemeSelector / LanguageSwitch' description='明暗切换、主题选择与语言切换' code={codeTheme}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>ThemeToggle 明暗切换</p>
          <ThemeToggle />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>LanguageSwitch 语言切换</p>
          <LanguageSwitch />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>ThemeSelector 主题选择器</p>
          <ThemeSelector showPreview grouped />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>ThemeSelector（无预览）</p>
          <ThemeSelector showPreview={false} />
        </div>
      </div>
    </DemoCard>
  </DemoSection>
</div>
