<!--
  覆盖层 / 主题（Overlays）展示
  Modal / Drawer / Confirm / Toast /
  FeedbackModal / SettingsModal /
  ThemeToggle / ThemeSelector / LanguageSwitch
-->
<script lang="ts">
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
</script>

<div class="space-y-10">
  <!-- ====================================================================== -->
  <!-- 覆盖层                                                                 -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">覆盖层</h2>
        <p class="text-sm text-base-content/60">Modal / Drawer / Confirm / Toast</p>
      </div>
    </div>

  <!-- ==================== Modal ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Modal 对话框</h3>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium mb-2">基础对话框</p>
        <Button variant="primary" onclick={() => modalOpen = true}>打开 Modal</Button>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">不同尺寸</p>
        <div class="flex flex-wrap gap-2">
          {#each ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'] as size}
            <Button variant="secondary" outline onclick={() => { modalSize = size as typeof modalSize; modalSizeOpen = true }}>
              {size}
            </Button>
          {/each}
        </div>
      </div>
    </div>

    <Modal open={modalOpen} title="基础对话框" onclose={() => modalOpen = false}>
      <div class="space-y-4">
        <p class="text-base-content/70">这是一个基础对话框，支持自定义标题、内容和操作按钮。</p>
        <p class="text-base-content/70">点击遮罩层或关闭按钮可关闭。</p>
        <div class="space-y-2">
          <Input placeholder="示例输入框" />
          <Textarea placeholder="示例文本域" rows={3} />
        </div>
      </div>
      {#snippet footer()}
        <div class="flex justify-end gap-2">
          <Button onclick={() => modalOpen = false}>取消</Button>
          <Button variant="primary" onclick={() => { toast.success('已确认'); modalOpen = false }}>确认</Button>
        </div>
      {/snippet}
    </Modal>

    <Modal open={modalSizeOpen} title="尺寸: {modalSize}" size={modalSize} onclose={() => modalSizeOpen = false}>
      <p class="text-base-content/70">当前对话框尺寸为 <strong>{modalSize}</strong>，共支持 sm / md / lg / xl / 2xl / 3xl / 4xl / full 八种尺寸。</p>
      {#snippet footer()}
        <div class="flex justify-end">
          <Button variant="primary" onclick={() => modalSizeOpen = false}>关闭</Button>
        </div>
      {/snippet}
    </Modal>
  </Card>

  <!-- ==================== Drawer ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Drawer 抽屉</h3>
    <div class="flex flex-wrap gap-3">
      <Button variant="secondary" onclick={() => drawerOpen = true}>右侧抽屉</Button>
      <Button variant="secondary" outline onclick={() => drawerLeftOpen = true}>左侧抽屉</Button>
    </div>

    <Drawer open={drawerOpen} position="right" title="右侧抽屉" onclose={() => drawerOpen = false}>
      <div class="space-y-4">
        <p class="text-base-content/70">抽屉内容区域，适合放置表单、详细信息或操作面板。</p>
        <Input placeholder="姓名" />
        <Input placeholder="邮箱" />
        <Textarea placeholder="备注" rows={3} />
        <div class="flex gap-2">
          <Button variant="primary" onclick={() => { toast.success('已保存'); drawerOpen = false }}>保存</Button>
          <Button onclick={() => drawerOpen = false}>取消</Button>
        </div>
      </div>
    </Drawer>

    <Drawer open={drawerLeftOpen} position="left" title="左侧导航" onclose={() => drawerLeftOpen = false}>
      <nav class="space-y-2">
        {#each ['仪表盘', '用户管理', '内容管理', '系统设置', '操作日志'] as item}
          <button
            class="w-full text-left px-4 py-2 rounded-lg hover:bg-base-200 transition-colors text-sm"
            onclick={() => { toast.info(item); drawerLeftOpen = false }}
          >
            {item}
          </button>
        {/each}
      </nav>
    </Drawer>
  </Card>

  <!-- ==================== Confirm ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Confirm 确认框</h3>
    <div class="flex flex-wrap gap-3">
      <Button variant="warning" onclick={() => confirmOpen = true}>常规确认</Button>
      <Button variant="error" onclick={() => confirmDeleteOpen = true}>危险操作确认</Button>
    </div>

    <Confirm
      open={confirmOpen}
      title="确认操作"
      message="您确定要执行此操作吗？操作完成后将无法撤销。"
      confirmText="确定"
      cancelText="取消"
      variant="warning"
      onconfirm={async () => { toast.success('操作已确认'); confirmOpen = false }}
      oncancel={() => confirmOpen = false}
    />

    <Confirm
      open={confirmDeleteOpen}
      title="确认删除"
      message="确定要永久删除此项目吗？所有关联数据将一并删除，此操作不可恢复。"
      confirmText="永久删除"
      cancelText="取消"
      variant="error"
      onconfirm={async () => { toast.error('已永久删除'); confirmDeleteOpen = false }}
      oncancel={() => confirmDeleteOpen = false}
    />
  </Card>

  <!-- ==================== Toast ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Toast 通知</h3>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium mb-2">基础通知</p>
        <div class="flex flex-wrap gap-3">
          <Button variant="info" onclick={() => toast.info('这是一条信息通知')}>信息</Button>
          <Button variant="success" onclick={() => toast.success('操作成功完成！')}>成功</Button>
          <Button variant="warning" onclick={() => toast.warning('请注意检查配置项')}>警告</Button>
          <Button variant="error" onclick={() => toast.error('操作失败，请稍后重试')}>错误</Button>
        </div>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">自定义持续时间</p>
        <div class="flex flex-wrap gap-3">
          <Button variant="primary" outline onclick={() => toast.info('1 秒后消失', 1000)}>1 秒</Button>
          <Button variant="primary" outline onclick={() => toast.info('3 秒后消失', 3000)}>3 秒</Button>
          <Button variant="primary" outline onclick={() => toast.info('10 秒后消失', 10000)}>10 秒</Button>
        </div>
      </div>
    </div>
  </Card>
  </section>

  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- 场景对话框                                                              -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-info/10 text-info">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">场景对话框</h2>
        <p class="text-sm text-base-content/60">FeedbackModal / SettingsModal</p>
      </div>
    </div>

  <!-- ==================== FeedbackModal / SettingsModal ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">FeedbackModal / SettingsModal</h3>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium mb-2">场景对话框</p>
        <div class="flex flex-wrap gap-3">
          <Button variant="primary" outline onclick={() => feedbackOpen = true}>意见反馈</Button>
          <Button variant="secondary" outline onclick={() => settingsOpen = true}>系统设置</Button>
        </div>
      </div>
    </div>

    <FeedbackModal bind:open={feedbackOpen} onsubmit={async () => { toast.success('反馈已提交，感谢您的建议！') }} />
    <SettingsModal open={settingsOpen} onclose={() => settingsOpen = false} />
  </Card>
  </section>

  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- 主题与语言                                                              -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-warning/10 text-warning">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">主题与语言</h2>
        <p class="text-sm text-base-content/60">ThemeToggle / ThemeSelector / LanguageSwitch</p>
      </div>
    </div>

  <!-- ==================== ThemeToggle / ThemeSelector ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">ThemeToggle / ThemeSelector / LanguageSwitch</h3>
    <div class="space-y-6">
      <div>
        <p class="text-sm font-medium mb-2">ThemeToggle 明暗切换</p>
        <ThemeToggle />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">LanguageSwitch 语言切换</p>
        <LanguageSwitch />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">ThemeSelector 主题选择器</p>
        <ThemeSelector showPreview grouped />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">ThemeSelector（无预览）</p>
        <ThemeSelector showPreview={false} />
      </div>
    </div>
  </Card>
  </section>
</div>
