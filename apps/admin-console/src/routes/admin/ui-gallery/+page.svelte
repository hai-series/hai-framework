<!--
  UI 组件库展示页面 - 全部 @h-ai/ui 组件综合展示
-->
<script lang="ts">
  import {
    Accordion,
    Alert,
    Avatar,
    AvatarUpload,
    Badge,
    BareButton,
    BareInput,
    Breadcrumb,
    Button,
    Card,
    ChangePasswordForm,
    Checkbox,
    Confirm,
    DataTable,
    Drawer,
    Dropdown,
    Empty,
    EncryptedInput,
    FeedbackModal,
    FileList,
    FileUpload,
    ForgotPasswordForm,
    Form,
    FormField,
    HashDisplay,
    IconButton,
    ImageUpload,
    Input,
    LanguageSwitch,
    LoginForm,
    Modal,
    MultiSelect,
    PageHeader,
    Pagination,
    PasswordInput,
    Popover,
    Progress,
    Radio,
    Range,
    Rating,
    RegisterForm,
    ResetPasswordForm,
    Result,
    ScoreBar,
    Select,
    SettingsModal,
    SeverityBadge,
    SignatureDisplay,
    Skeleton,
    Spinner,
    Steps,
    Switch,
    Table,
    Tabs,
    Tag,
    TagInput,
    Textarea,
    ThemeSelector,
    ThemeToggle,
    Timeline,
    ToastContainer,
    ToggleCheckbox,
    ToggleInput,
    ToggleRadio,
    Tooltip,
    UserProfile,
    toast,
  } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages'

  // === 顶层标签状态 ===
  let activeTab = $state('primitives')
  const mainTabs = $derived([
    { key: 'primitives', label: m.gallery_tab_primitives() },
    { key: 'compounds', label: m.gallery_tab_compounds() },
    { key: 'scenes', label: m.gallery_tab_scenes() },
    { key: 'overlays', label: m.gallery_tab_overlays() },
  ])

  // === 原子组件状态 ===
  let inputVal = $state('')
  let textareaVal = $state('')
  let selectVal = $state('')
  let checkboxVal = $state(false)
  let switchVal = $state(true)
  let radioVal = $state('vue')
  let rangeVal = $state(50)
  let ratingVal = $state(3)
  let toggleCheck = $state(false)
  let toggleInput = $state(false)
  let toggleRadio = $state(false)

  // === 组合组件状态 ===
  let paginationPage = $state(1)
  let stepsIndex = $state(1)
  let subTab = $state('info')
  let tagInputVal = $state<string[]>(['Svelte', 'TypeScript'])
  let multiSelectVal = $state<string[]>(['fe'])
  let formName = $state('')
  let formEmail = $state('')

  // === 覆盖层状态 ===
  let modalOpen = $state(false)
  let drawerOpen = $state(false)
  let confirmOpen = $state(false)
  let feedbackOpen = $state(false)
  let settingsOpen = $state(false)

  // === 场景组件状态 ===
  let pwdVal = $state('')
  let encVal = $state('')

  // === 示例数据 ===
  const selectOpts = [
    { value: 'svelte', label: 'Svelte' },
    { value: 'vue', label: 'Vue' },
    { value: 'react', label: 'React' },
  ]

  const tableColumns = [
    { key: 'name', title: '姓名', width: '120px' },
    { key: 'role', title: '角色' },
    { key: 'status', title: '状态', align: 'center' as const },
  ]
  const tableData = [
    { id: 1, name: '张三', role: '管理员', status: '活跃' },
    { id: 2, name: '李四', role: '编辑', status: '活跃' },
    { id: 3, name: '王五', role: '访客', status: '停用' },
  ]

  const timelineItems = [
    { id: '1', title: '创建项目', description: '初始化完成', time: '01-01', color: 'primary' as const, completed: true },
    { id: '2', title: '开发阶段', description: '核心功能开发', time: '02-15', color: 'info' as const, completed: true },
    { id: '3', title: '测试阶段', description: '集成测试中', time: '03-20', color: 'warning' as const },
  ]

  const stepsItems = [
    { title: '填写信息', description: '基本资料' },
    { title: '身份验证', description: '邮箱确认' },
    { title: '完成注册' },
  ]

  const accordionItems = [
    { id: 'q1', title: '如何创建账户？', content: '点击注册按钮，填写必要信息即可创建账户。' },
    { id: 'q2', title: '如何重置密码？', content: '在登录页点击"忘记密码"，按提示操作。' },
    { id: 'q3', title: '如何联系客服？', content: '发送邮件至 support@example.com。' },
  ]

  const breadcrumbItems = [
    { label: '首页', href: '/' },
    { label: '管理', href: '/admin' },
    { label: 'UI 组件库' },
  ]

  const dropdownItems = [
    { label: '编辑', key: 'edit' },
    { label: '复制', key: 'copy' },
    { divider: true, key: 'divider-1', label: '' },
    { label: '删除', key: 'delete' },
  ]

  const multiOpts = [
    { value: 'fe', label: '前端开发' },
    { value: 'be', label: '后端开发' },
    { value: 'devops', label: 'DevOps' },
    { value: 'design', label: '设计' },
  ]

  const demoFiles = [
    { id: '1', name: '设计稿.png', size: 2048000, type: 'image/png', url: '#' },
    { id: '2', name: '需求文档.pdf', size: 512000, type: 'application/pdf', url: '#' },
    { id: '3', name: '数据报表.xlsx', size: 1024000, type: 'application/vnd.ms-excel', url: '#' },
  ]

  const demoUser = {
    id: '1',
    username: 'zhangsan',
    email: 'zhangsan@example.com',
    nickname: '张三',
    phone: '13800138000',
    avatar: '',
    bio: '全栈开发工程师',
  }
</script>

<svelte:head>
  <title>{m.gallery_title()} - hai Admin</title>
</svelte:head>

<ToastContainer />

<div class="space-y-6">
  <PageHeader title={m.gallery_title()} description={m.gallery_desc()} />

  <Tabs items={mainTabs} bind:active={activeTab} type="card" />

  <!-- ==================== 原子组件 ==================== -->
  {#if activeTab === 'primitives'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-4">Button 按钮</h3>
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="primary" onclick={() => toast.success('主要按钮点击')}>主要</Button>
          <Button variant="secondary">次要</Button>
          <Button variant="accent">强调</Button>
          <Button variant="info">信息</Button>
          <Button variant="success">成功</Button>
          <Button variant="warning">警告</Button>
          <Button variant="error">错误</Button>
        </div>
        <div class="flex flex-wrap items-center gap-3 mt-3">
          <Button variant="primary" outline>轮廓</Button>
          <Button variant="primary" size="xs">超小</Button>
          <Button variant="primary" size="sm">小号</Button>
          <Button variant="primary" size="lg">大号</Button>
          <Button variant="primary" loading>加载中</Button>
          <Button variant="primary" disabled>禁用</Button>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">BareButton / IconButton</h3>
        <div class="flex items-center gap-4">
          <BareButton onclick={() => toast.info('裸按钮点击')}>
            <span class="text-primary underline cursor-pointer">裸按钮（无样式）</span>
          </BareButton>
          <IconButton variant="primary" tooltip="设置" onclick={() => toast.info('图标按钮')}>
            {#snippet icon()}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33
                  1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06
                  a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
                  A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0
                  9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33
                  l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4
                  h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            {/snippet}
          </IconButton>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Input / BareInput / Textarea</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-medium mb-1 block" for="g-input">标准输入框</label>
            <Input id="g-input" bind:value={inputVal} placeholder="请输入内容" />
            <p class="text-xs text-base-content/50 mt-1">当前值: {inputVal}</p>
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block" for="g-bare">裸输入框</label>
            <BareInput id="g-bare" placeholder="无边框输入" />
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block" for="g-err">错误状态</label>
            <Input id="g-err" value="错误内容" error="请输入有效内容" />
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block" for="g-dis">禁用状态</label>
            <Input id="g-dis" value="禁用" disabled />
          </div>
        </div>
        <div class="mt-4">
          <label class="text-sm font-medium mb-1 block" for="g-ta">多行文本</label>
          <Textarea bind:value={textareaVal} placeholder="请输入多行内容..." rows={3} />
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Select / Checkbox / Switch / Radio</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label class="text-sm font-medium mb-1 block" for="g-sel">下拉选择</label>
            <Select id="g-sel" bind:value={selectVal} options={selectOpts} placeholder="请选择框架" />
          </div>
          <fieldset>
            <legend class="text-sm font-medium mb-3">复选框</legend>
            <Checkbox bind:checked={checkboxVal} label="同意协议" />
          </fieldset>
          <fieldset>
            <legend class="text-sm font-medium mb-3">开关</legend>
            <Switch bind:checked={switchVal} label="启用通知" />
          </fieldset>
          <fieldset>
            <legend class="text-sm font-medium mb-3">单选</legend>
            <Radio value={radioVal} options={selectOpts} direction="vertical" onchange={(v: string) => radioVal = v} />
          </fieldset>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Toggle 系列</h3>
        <div class="flex flex-wrap items-center gap-8">
          <label class="flex items-center gap-2 cursor-pointer">
            <ToggleCheckbox bind:checked={toggleCheck} />
            <span class="text-sm">ToggleCheckbox: {toggleCheck ? '开' : '关'}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <ToggleInput bind:checked={toggleInput} />
            <span class="text-sm">ToggleInput: {toggleInput ? '开' : '关'}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <ToggleRadio bind:checked={toggleRadio} />
            <span class="text-sm">ToggleRadio: {toggleRadio ? '开' : '关'}</span>
          </label>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Range / Rating</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p class="text-sm font-medium mb-2">滑块: {rangeVal}</p>
            <Range bind:value={rangeVal} min={0} max={100} step={10} variant="primary" />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">评分: {ratingVal}</p>
            <Rating bind:value={ratingVal} max={5} size="lg" half clearable />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Badge / Avatar / Tag</h3>
        <div class="space-y-4">
          <div>
            <p class="text-sm font-medium mb-2">徽章</p>
            <div class="flex flex-wrap gap-2">
              <Badge>默认</Badge>
              <Badge variant="primary">主要</Badge>
              <Badge variant="secondary">次要</Badge>
              <Badge variant="success">成功</Badge>
              <Badge variant="warning">警告</Badge>
              <Badge variant="error">错误</Badge>
              <Badge variant="info">信息</Badge>
              <Badge variant="primary" outline>轮廓</Badge>
              <Badge variant="primary" size="lg">大号</Badge>
            </div>
          </div>
          <div>
            <p class="text-sm font-medium mb-2">头像</p>
            <div class="flex items-center gap-3">
              <Avatar name="张三" size="sm" />
              <Avatar name="李四" size="md" />
              <Avatar name="王五" size="lg" />
            </div>
          </div>
          <div>
            <p class="text-sm font-medium mb-2">标签</p>
            <div class="flex flex-wrap gap-2">
              <Tag>默认</Tag>
              <Tag variant="primary">前端</Tag>
              <Tag variant="success">已发布</Tag>
              <Tag variant="warning">待审核</Tag>
              <Tag variant="error">已过期</Tag>
              <Tag closable onclose={() => toast.info('标签已关闭')}>可关闭</Tag>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Spinner / Progress</h3>
        <div class="flex items-center gap-6 mb-4">
          <Spinner size="sm" />
          <Spinner size="md" variant="primary" />
          <Spinner size="lg" variant="secondary" />
        </div>
        <div class="space-y-3">
          <Progress value={40} max={100} variant="primary" size="md" showLabel />
          <Progress value={70} max={100} variant="success" size="md" showLabel />
          <Progress value={90} max={100} variant="warning" size="md" showLabel />
        </div>
      </Card>
    </div>

  <!-- ==================== 组合组件 ==================== -->
  {:else if activeTab === 'compounds'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-4">Breadcrumb 面包屑</h3>
        <Breadcrumb items={breadcrumbItems} />
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Tabs 标签页</h3>
        <Tabs
          items={[
            { key: 'info', label: '基本信息' },
            { key: 'security', label: '安全设置' },
            { key: 'notify', label: '通知偏好' },
          ]}
          bind:active={subTab}
        />
        <p class="mt-3 p-3 bg-base-200 rounded-lg text-sm">当前标签: {subTab}</p>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Pagination / Steps</h3>
        <div class="space-y-6">
          <div>
            <p class="text-sm font-medium mb-2">分页（当前第 {paginationPage} 页）</p>
            <Pagination total={50} bind:page={paginationPage} pageSize={10} onchange={(p: number) => paginationPage = p} />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">步骤条</p>
            <Steps items={stepsItems} current={stepsIndex} clickable onchange={(i: number) => stepsIndex = i} />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Table 基础表格</h3>
        <Table columns={tableColumns} data={tableData} striped hoverable />
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">DataTable 数据表格</h3>
        <DataTable
          data={tableData}
          columns={[
            { key: 'name', label: '姓名' },
            { key: 'role', label: '角色' },
            { key: 'status', label: '状态' },
          ]}
          keyField="id"
        >
          {#snippet actions(item: typeof tableData[0])}
            <Button size="xs" variant="ghost" onclick={() => toast.info(`编辑: ${item.name}`)}>编辑</Button>
          {/snippet}
        </DataTable>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Accordion 手风琴</h3>
        <Accordion items={accordionItems} variant="bordered" />
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Timeline 时间线</h3>
        <Timeline items={timelineItems} />
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">ScoreBar / SeverityBadge</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-3">
            <p class="text-sm font-medium">评分条</p>
            <ScoreBar value={85} max={100} showLabel />
            <ScoreBar value={60} max={100} size="lg" showLabel />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">严重性徽章</p>
            <div class="flex flex-wrap gap-2">
              <SeverityBadge type="critical" />
              <SeverityBadge type="high" />
              <SeverityBadge type="medium" />
              <SeverityBadge type="low" />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Alert 警告</h3>
        <div class="space-y-3">
          <Alert variant="info">信息提示：系统将于今晚进行维护。</Alert>
          <Alert variant="success">操作成功！数据已保存。</Alert>
          <Alert variant="warning" dismissible>警告：存储空间即将用完。</Alert>
          <Alert variant="error">错误：网络连接失败，请重试。</Alert>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Empty / Result</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Empty title="暂无数据" description="当前列表为空，请添加新内容" />
          <Result status="success" title="提交成功" description="您的申请已成功提交" />
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Skeleton 骨架屏</h3>
        <div class="flex items-start gap-4">
          <Skeleton variant="circle" width="48px" height="48px" />
          <div class="flex-1 space-y-2">
            <Skeleton variant="text" width="60%" height="20px" />
            <Skeleton variant="text" width="100%" height="16px" />
            <Skeleton variant="rect" width="100%" height="80px" />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Tooltip / Popover / Dropdown</h3>
        <div class="flex flex-wrap items-start gap-4">
          <Tooltip content="这是一个提示" position="top">
            <Button variant="primary" outline>悬停提示</Button>
          </Tooltip>
          <Popover position="bottom" trigger="click">
            {#snippet triggerContent()}
              <Button variant="secondary" outline>点击弹出</Button>
            {/snippet}
            <div class="p-2 text-sm">这是弹出层内容，支持任意元素。</div>
          </Popover>
          <Dropdown items={dropdownItems} onselect={(k: string) => toast.info(`选择: ${k}`)}>
            <Button>下拉菜单 ▾</Button>
          </Dropdown>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Form / FormField</h3>
        <Form onsubmit={async () => { toast.success('表单已提交') }}>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="姓名" required>
              <Input bind:value={formName} placeholder="请输入姓名" />
            </FormField>
            <FormField label="邮箱" error={formEmail && !formEmail.includes('@') ? '邮箱格式不正确' : ''}>
              <Input bind:value={formEmail} placeholder="请输入邮箱" />
            </FormField>
          </div>
          <div class="mt-4">
            <Button variant="primary">提交</Button>
          </div>
        </Form>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">TagInput / MultiSelect</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p class="text-sm font-medium mb-2">标签输入</p>
            <TagInput bind:tags={tagInputVal} placeholder="输入后回车添加" />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">多选</p>
            <MultiSelect options={multiOpts} bind:selected={multiSelectVal} placeholder="选择技能" />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">PageHeader 页面头部</h3>
        <div class="bg-base-200/50 rounded-lg p-4">
          <PageHeader title="用户管理" description="管理系统中的所有用户账号">
            {#snippet actions()}
              <Button variant="primary" size="sm">新建用户</Button>
            {/snippet}
          </PageHeader>
        </div>
      </Card>
    </div>

  <!-- ==================== 场景组件 ==================== -->
  {:else if activeTab === 'scenes'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-4">IAM - 登录 / 注册</h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="max-w-sm">
            <LoginForm
              showTitle
              showRememberMe
              showForgotPassword
              onsubmit={async (data) => { toast.success(`登录: ${data.username}`) }}
            />
          </div>
          <div class="max-w-sm">
            <RegisterForm
              showTitle
              onsubmit={async (data) => { toast.success(`注册: ${data.username ?? data.email ?? ''}`) }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">IAM - 密码相关</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="max-w-xs">
            <ForgotPasswordForm showTitle onsubmit={async () => { toast.info('重置邮件已发送') }} />
          </div>
          <div class="max-w-xs">
            <ResetPasswordForm showTitle onsubmit={async () => { toast.success('密码已重置') }} />
          </div>
          <div class="max-w-xs">
            <ChangePasswordForm requireOldPassword onsubmit={async () => { toast.success('密码已修改') }} />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">PasswordInput / UserProfile</h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p class="text-sm font-medium mb-2">密码输入框（含强度指示）</p>
            <PasswordInput bind:value={pwdVal} showToggle showStrength placeholder="请输入密码" />
          </div>
          <div>
            <UserProfile user={demoUser} editable onsubmit={async () => { toast.success('资料已更新') }} />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Storage - 文件管理</h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p class="text-sm font-medium mb-2">文件上传</p>
            <FileUpload accept="image/*,.pdf" maxFiles={3} multiple dragDrop autoUpload={false} />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">文件列表</p>
            <FileList files={demoFiles} showPreview showDownload showDelete layout="list" />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">ImageUpload / AvatarUpload</h3>
        <div class="flex flex-wrap items-start gap-8">
          <div>
            <p class="text-sm font-medium mb-2">图片上传</p>
            <ImageUpload accept="image/*" width={200} height={200} />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">头像上传</p>
            <AvatarUpload size={100} fallback="张" />
          </div>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Crypto 加密组件</h3>
        <div class="space-y-4">
          <div>
            <p class="text-sm font-medium mb-2">加密输入框</p>
            <EncryptedInput bind:value={encVal} algorithm="AES-256" placeholder="输入敏感数据" />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">哈希展示</p>
            <HashDisplay value="e3b0c44298fc1c149afbf4c8996fb924" algorithm="SHA256" label="文件哈希" copyable truncate />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">签名展示</p>
            <SignatureDisplay signature="MEUCIQDf4b2e...base64...==" algorithm="ECDSA" verified={true} copyable />
          </div>
        </div>
      </Card>
    </div>

  <!-- ==================== 覆盖/主题 ==================== -->
  {:else if activeTab === 'overlays'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-4">Modal / Drawer / Confirm</h3>
        <div class="flex flex-wrap gap-3">
          <Button variant="primary" onclick={() => modalOpen = true}>打开 Modal</Button>
          <Button variant="secondary" onclick={() => drawerOpen = true}>打开 Drawer</Button>
          <Button variant="warning" onclick={() => confirmOpen = true}>打开 Confirm</Button>
        </div>

        <Modal open={modalOpen} title="对话框标题" onclose={() => modalOpen = false}>
          <p class="text-base-content/70">这是一个模态对话框，支持自定义内容。</p>
          <div class="mt-4 flex justify-end gap-2">
            <Button onclick={() => modalOpen = false}>取消</Button>
            <Button variant="primary" onclick={() => { toast.success('已确认'); modalOpen = false }}>确认</Button>
          </div>
        </Modal>

        <Drawer open={drawerOpen} position="right" title="侧边抽屉" onclose={() => drawerOpen = false}>
          <div class="space-y-4">
            <p class="text-base-content/70">抽屉内容区域，适合放置表单或详细信息。</p>
            <Input placeholder="示例输入" />
            <Button variant="primary" onclick={() => { toast.success('已保存'); drawerOpen = false }}>保存</Button>
          </div>
        </Drawer>

        <Confirm
          open={confirmOpen}
          title="确认删除"
          message="确定要删除此项目吗？此操作不可撤销。"
          confirmText="删除"
          cancelText="取消"
          variant="error"
          onconfirm={() => { toast.error('已删除'); confirmOpen = false }}
          oncancel={() => confirmOpen = false}
        />
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Toast 通知</h3>
        <div class="flex flex-wrap gap-3">
          <Button variant="info" onclick={() => toast.info('这是一条信息通知')}>信息</Button>
          <Button variant="success" onclick={() => toast.success('操作成功完成！')}>成功</Button>
          <Button variant="warning" onclick={() => toast.warning('请注意检查配置')}>警告</Button>
          <Button variant="error" onclick={() => toast.error('操作失败，请重试')}>错误</Button>
        </div>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">FeedbackModal / SettingsModal</h3>
        <div class="flex flex-wrap gap-3">
          <Button variant="primary" outline onclick={() => feedbackOpen = true}>打开反馈</Button>
          <Button variant="secondary" outline onclick={() => settingsOpen = true}>打开设置</Button>
        </div>
        <FeedbackModal bind:open={feedbackOpen} onsubmit={async () => { toast.success('反馈已提交') }} />
        <SettingsModal open={settingsOpen} onclose={() => settingsOpen = false} />
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">ThemeToggle / ThemeSelector / LanguageSwitch</h3>
        <div class="flex flex-wrap items-center gap-6">
          <div>
            <p class="text-sm font-medium mb-2">主题切换</p>
            <ThemeToggle />
          </div>
          <div>
            <p class="text-sm font-medium mb-2">语言切换</p>
            <LanguageSwitch />
          </div>
        </div>
        <div class="mt-4">
          <p class="text-sm font-medium mb-2">主题选择器</p>
          <ThemeSelector />
        </div>
      </Card>
    </div>
  {/if}
</div>
