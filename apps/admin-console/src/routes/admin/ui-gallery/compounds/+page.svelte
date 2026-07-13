<!--
  组合组件（Compounds）展示 - 复杂 UI 模式与移动端应用组件
  Breadcrumb / Tabs / Pagination / Steps / DataTable / Accordion / Timeline /
  Alert / Empty / Result / Skeleton / Tooltip / Popover / Dropdown /
  AppBar / BottomNav / SafeArea / ActionSheet / PullRefresh / InfiniteScroll / SwipeCell /
  Form / FormField / Combobox / Calendar / DatePicker / TagInput /
  Card / PageHeader / ToastContainer
-->
<script lang='ts'>
  import type { DateValue } from '@internationalized/date'
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import { ActionSheet, AppBar, BottomNav, InfiniteScroll, PullRefresh, SafeArea, SwipeCell, toast } from '@h-ai/ui'
  import { CalendarDate } from '@internationalized/date'

  // === 状态 ===
  let comboboxVal = $state('')
  let comboboxMultiVal = $state<string[]>(['fe'])
  let calendarVal = $state<DateValue>(new CalendarDate(2026, 2, 26))
  let datePickerVal = $state<DateValue>(new CalendarDate(2026, 2, 26))
  let paginationPage = $state(1)
  let paginationPage2 = $state(3)
  let stepsIndex = $state(1)
  let subTab = $state('info')
  let tagInputVal = $state<string[]>(['Svelte', 'TypeScript'])
  let formName = $state('')
  let formEmail = $state('')
  let accordionVal = $state<string | string[]>()
  let actionSheetOpen = $state(false)
  let bottomNavActive = $state('home')
  let refreshCount = $state(0)
  let mobileFeedHasMore = $state(true)
  let mobileFeedItems = $state([
    { id: 'm1', title: '订单异常提醒', desc: '3 笔订单需要人工复核' },
    { id: 'm2', title: '库存补货建议', desc: '热销 SKU 库存低于安全水位' },
    { id: 'm3', title: '客服会话摘要', desc: 'AI 已生成本日高频问题' },
  ])

  // === 示例数据 ===
  const breadcrumbItems = [
    { label: '首页', href: '/' },
    { label: '管理', href: '/admin' },
    { label: 'UI 组件库' },
  ]

  const tableData = [
    { id: 1, name: '张三', role: '管理员', status: '活跃' },
    { id: 2, name: '李四', role: '编辑', status: '活跃' },
    { id: 3, name: '王五', role: '访客', status: '停用' },
  ]

  const timelineItems = [
    { id: '1', title: '创建项目', description: '项目初始化、环境配置完成', time: '2026-01-01', color: 'primary' as const, completed: true },
    { id: '2', title: '核心开发', description: '完成核心模块开发与单测', time: '2026-02-15', color: 'info' as const, completed: true },
    { id: '3', title: '集成测试', description: '进行端到端测试与性能优化', time: '2026-03-20', color: 'warning' as const },
    { id: '4', title: '正式发布', description: '版本发布与文档上线', time: '2026-04-01', color: 'success' as const },
  ]

  const stepsItems = [
    { title: '填写信息', description: '输入基本资料' },
    { title: '身份验证', description: '邮箱确认' },
    { title: '设置密码', description: '创建安全密码' },
    { title: '完成注册' },
  ]

  const accordionItems = [
    { id: 'q1', title: '如何创建账户？', content: '点击页面右上角的"注册"按钮，填写用户名、邮箱和密码即可创建账户。' },
    { id: 'q2', title: '如何重置密码？', content: '在登录页面点击"忘记密码"链接，输入注册邮箱后按照邮件提示操作即可重置密码。' },
    { id: 'q3', title: '支持哪些浏览器？', content: '支持 Chrome 90+、Firefox 88+、Safari 14+、Edge 90+ 等现代浏览器。' },
    { id: 'q4', title: '如何联系客服？', content: '发送邮件至 support@example.com，或在工作日 9:00-18:00 拨打热线 400-000-0000。' },
  ]

  const dropdownItems = [
    { label: '编辑', key: 'edit' },
    { label: '复制', key: 'copy' },
    { label: '移动', key: 'move' },
    { divider: true, key: 'divider-1', label: '' },
    { label: '删除', key: 'delete' },
  ]

  const comboboxOpts = [
    { value: 'svelte', label: 'Svelte', description: '编译时框架' },
    { value: 'react', label: 'React', description: 'Meta 出品' },
    { value: 'vue', label: 'Vue', description: '渐进式框架' },
    { value: 'angular', label: 'Angular', description: 'Google 出品' },
    { value: 'solid', label: 'SolidJS', description: '细粒度响应式' },
    { value: 'qwik', label: 'Qwik', description: '可恢复性框架' },
  ]

  const multiOpts = [
    { value: 'fe', label: '前端开发' },
    { value: 'be', label: '后端开发' },
    { value: 'devops', label: 'DevOps' },
    { value: 'design', label: '设计' },
    { value: 'pm', label: '产品管理' },
    { value: 'qa', label: '质量保障' },
  ]

  const alignedControlSizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const

  const actionSheetItems = [
    { id: 'share', label: '分享报表' },
    { id: 'archive', label: '归档通知' },
    { id: 'delete', label: '删除记录', destructive: true },
  ]

  const bottomNavItems = [
    { id: 'home', label: '首页', iconClass: 'icon-[tabler--home]' },
    { id: 'tasks', label: '任务', iconClass: 'icon-[tabler--checklist]', badge: 3 },
    { id: 'profile', label: '我的', iconClass: 'icon-[tabler--user]' },
  ]

  const swipeActions = [
    { id: 'done', label: '完成', variant: 'primary' as const },
    { id: 'delete', label: '删除', variant: 'error' as const },
  ]

  async function refreshMobileDemo() {
    refreshCount += 1
    mobileFeedItems = [
      { id: `refresh-${refreshCount}`, title: '刷新成功', desc: `第 ${refreshCount + 1} 次拉取移动端数据` },
      ...mobileFeedItems.slice(0, 4),
    ]
    toast.success('移动列表已刷新')
  }

  async function loadMoreMobileItems() {
    if (!mobileFeedHasMore)
      return

    const nextIndex = mobileFeedItems.length + 1
    mobileFeedItems = [
      ...mobileFeedItems,
      { id: `m${nextIndex}`, title: `更多移动事项 ${nextIndex}`, desc: '滚动到底部后自动追加的列表项' },
    ]
    mobileFeedHasMore = mobileFeedItems.length < 6
  }

  // === 示例源码 ===
  const codeBreadcrumb = `<Breadcrumb items={breadcrumbItems} />
<Breadcrumb items={breadcrumbItems} separator='›' />`

  const codeTabs = `<Tabs items={items} bind:active={subTab} type='line' />
<Tabs items={items} active='all' type='card' />
<Tabs items={items} active='month' type='pills' />`

  const codePaginationSteps = `<Pagination total={50} bind:page pageSize={10} onchange={(p) => page = p} />
<Pagination total={200} bind:page pageSize={20} showJumper size='sm' />

<Steps items={stepsItems} current={index} clickable onchange={(i) => index = i} />
<Steps items={stepsItems} current={2} direction='vertical' size='sm' />`

  const codeMobile = `<!-- 移动端结构组件，常配合手机外壳预览 -->
<SafeArea position='top'>
  <AppBar title='移动工作台' fixed={false} safeArea={false} />
</SafeArea>

<PullRefresh onrefresh={refreshMobileDemo}>
  <SwipeCell actions={swipeActions} onaction={(id) => toast.info(id)}>...</SwipeCell>
</PullRefresh>

<BottomNav items={bottomNavItems} active={active} onchange={(id) => active = id} />

<ActionSheet open={open} title='选择操作' items={items} onselect={...} onclose={...} />
<InfiniteScroll hasMore={hasMore} onloadmore={loadMore}>...</InfiniteScroll>`

  const codeDataTable = `<DataTable data={tableData} columns={columns} keyField='id'>
  {#snippet actions(item)}
    <Button size='xs' variant='ghost'>编辑</Button>
    <Button size='xs' variant='error'>删除</Button>
  {/snippet}
</DataTable>

<DataTable data={[]} columns={columns} keyField='id' />        <!-- 空状态 -->
<DataTable data={[]} columns={columns} keyField='id' loading /> <!-- 加载中 -->`

  const codeAccordion = `<Accordion items={accordionItems} variant='bordered' />
<Accordion items={accordionItems} variant='shadow' />
<Accordion items={accordionItems} variant='joined' multiple bind:value icon='plus' />`

  const codeTimeline = `<Timeline items={timelineItems} />
<Timeline items={timelineItems} compact />`

  const codeAlert = `<Alert variant='info'>信息提示</Alert>
<Alert variant='success'>操作成功</Alert>
<Alert variant='warning' dismissible>可关闭警告</Alert>
<Alert variant='error'>错误提示</Alert>
<Alert variant='info' title='带标题的提示'>带标题正文</Alert>`

  const codeEmptyResult = `<Empty title='暂无数据' description='当前列表为空' icon='inbox' />

<Result status='success' title='提交成功' description='...' />
<Result status='error' title='操作失败' description='...' />`

  const codeSkeleton = `<Skeleton variant='avatar' />
<Skeleton variant='title' width='60%' />
<Skeleton variant='text' count={4} />
<Skeleton variant='input' />
<Skeleton variant='button' width='120px' />`

  const codeOverlayMenus = `<Tooltip content='顶部提示' position='top'>
  <Button variant='primary' outline>上</Button>
</Tooltip>

<Popover position='bottom' trigger='click'>
  {#snippet triggerContent()}<Button>点击弹出</Button>{/snippet}
  <div class='p-3'>弹出内容</div>
</Popover>

<Dropdown items={dropdownItems} onselect={(k) => toast.info(k)}>
  <Button>操作菜单 ▾</Button>
</Dropdown>`

  const codeForm = `<Form onsubmit={async () => { ... }}>
  <FormField label='姓名' required>
    <Input bind:value placeholder='请输入姓名' />
  </FormField>
  <FormField label='邮箱' error={emailError}>
    <Input bind:value placeholder='请输入邮箱' />
  </FormField>
  <Button variant='primary' type='submit'>提交</Button>
</Form>`

  const codeCombobox = `<Combobox options={comboboxOpts} bind:value placeholder='搜索框架...' />
<Combobox options={comboboxOpts} placeholder='...' error='请选择一个框架' />
<Combobox options={multiOpts} bind:value multiple placeholder='搜索技能...' />`

  const codeControlAlignment = `<Input size='sm' placeholder='Input' />
<Select size='sm' options={options} placeholder='Select' />
<Combobox size='sm' options={options} placeholder='Combobox' />
<DatePicker size='sm' />
<TagInput size='sm' tags={[]} placeholder='TagInput' />`

  const codeTagInput = `<TagInput bind:tags placeholder='输入后回车添加' />
<TagInput tags={['标签A', '标签B']} maxTags={5} />
<TagInput tags={[]} allowDuplicates placeholder='可重复输入' />`

  const codeCalendar = `<Calendar bind:value weekStartsOn={1} />

<DatePicker bind:value />
<DatePicker error='请选择有效日期' />
<DatePicker disabled />`

  const codeCardLayout = `<Card title='默认卡片'>内容</Card>
<Card title='带边框' bordered>内容</Card>
<Card title='大阴影' shadow='lg'>内容</Card>

<Card padding='lg' bordered>
  {#snippet header()}...{/snippet}
  内容
  {#snippet footer()}...{/snippet}
</Card>`

  const codePageHeader = `<PageHeader title='用户管理' description='管理系统中的所有用户账号'>
  {#snippet actions()}
    <Button variant='primary' size='sm'>新建用户</Button>
  {/snippet}
</PageHeader>`
</script>

<div class='space-y-10'>
  <DemoSection
    title='导航与流程'
    subtitle='Breadcrumb / Tabs / Pagination / Steps'
    iconClass='icon-[tabler--chevron-right]'
    tone='primary'
  >
    <DemoCard title='Breadcrumb 面包屑' description='默认与自定义分隔符' code={codeBreadcrumb}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>默认分隔符</p>
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>自定义分隔符</p>
          <Breadcrumb items={breadcrumbItems} separator='›' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>长路径</p>
          <Breadcrumb items={[
            { label: '首页', href: '/' },
            { label: '系统管理', href: '/admin' },
            { label: '用户管理', href: '/admin/users' },
            { label: '用户详情', href: '/admin/users/1' },
            { label: '编辑' },
          ]} />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Tabs 标签页' description='line / card / pills 三种样式' code={codeTabs}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>线条样式（line）</p>
          <Tabs
            items={[
              { key: 'info', label: '基本信息' },
              { key: 'security', label: '安全设置' },
              { key: 'notify', label: '通知偏好' },
            ]}
            bind:active={subTab}
            type='line'
          />
          <p class='mt-2 p-3 bg-base-200 rounded-lg text-sm'>当前: {subTab}</p>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>卡片样式（card）</p>
          <Tabs
            items={[
              { key: 'all', label: '全部' },
              { key: 'active', label: '进行中' },
              { key: 'done', label: '已完成' },
            ]}
            active='all'
            type='card'
          />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>药丸样式（pills）</p>
          <Tabs
            items={[
              { key: 'day', label: '日' },
              { key: 'week', label: '周' },
              { key: 'month', label: '月' },
              { key: 'year', label: '年' },
            ]}
            active='month'
            type='pills'
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Pagination 分页 / Steps 步骤条' description='分页与步骤条' code={codePaginationSteps}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>分页（第 {paginationPage} 页，共 5 页）</p>
          <Pagination total={50} bind:page={paginationPage} pageSize={10} onchange={(p: number) => paginationPage = p} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>分页 - 显示跳转 + 自定义大小</p>
          <Pagination total={200} bind:page={paginationPage2} pageSize={20} showJumper size='sm' onchange={(p: number) => paginationPage2 = p} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>步骤条（水平）- 当前第 {stepsIndex + 1} 步</p>
          <Steps items={stepsItems} current={stepsIndex} clickable onchange={(i: number) => stepsIndex = i} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>步骤条（垂直）</p>
          <Steps items={stepsItems} current={2} direction='vertical' size='sm' />
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='移动端应用模式'
    subtitle='AppBar / BottomNav / SafeArea / ActionSheet / PullRefresh / InfiniteScroll / SwipeCell'
    iconClass='icon-[tabler--device-mobile]'
    tone='primary'
  >
    <DemoCard title='移动端结构与手势' description='手机外壳预览：导航、安全区、下拉刷新、滑动单元格、上拉加载' code={codeMobile}>
      <div class='grid grid-cols-1 xl:grid-cols-[24rem_1fr] gap-6 items-start'>
        <div class='mx-auto w-full max-w-sm rounded-4xl border border-base-300 bg-base-200 p-2 shadow-sm'>
          <div class='relative overflow-hidden rounded-3xl bg-base-100 min-h-136'>
            <SafeArea position='top'>
              <AppBar title='移动工作台' fixed={false} safeArea={false}>
                {#snippet leading()}
                  <span class='icon-[tabler--menu-2] size-5 text-base-content/60'></span>
                {/snippet}
                {#snippet trailing()}
                  <span class='icon-[tabler--bell] size-5 text-base-content/60'></span>
                {/snippet}
              </AppBar>
            </SafeArea>

            <PullRefresh class='h-108 overflow-y-auto px-4 pb-20' onrefresh={refreshMobileDemo}>
              <div class='space-y-3 py-4'>
                <Alert variant='info'>在真机或触控板环境下下拉可触发 PullRefresh。</Alert>
                {#each mobileFeedItems as item (item.id)}
                  <SwipeCell
                    actions={swipeActions}
                    onaction={(id: string) => toast.info(`${item.title}: ${id}`)}
                    class='rounded-xl border border-base-200 bg-base-100'
                  >
                    <div class='p-4'>
                      <p class='text-sm font-semibold'>{item.title}</p>
                      <p class='text-xs text-base-content/55 mt-1'>{item.desc}</p>
                    </div>
                  </SwipeCell>
                {/each}
              </div>
            </PullRefresh>

            <BottomNav
              items={bottomNavItems}
              active={bottomNavActive}
              safeArea={false}
              onchange={(id: string) => bottomNavActive = id}
              class='absolute! bottom-0! left-0! right-0! z-20! translate-x-0!'
            />
          </div>
        </div>

        <div class='space-y-6'>
          <div>
            <h3 class='text-lg font-semibold mb-2'>移动端导航与安全区</h3>
            <p class='text-sm text-base-content/60'>AppBar 和 BottomNav 负责常见 App 顶部/底部结构，SafeArea 用于适配刘海屏与底部手势区域。</p>
          </div>
          <div class='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            <Card bordered>
              <h4 class='font-semibold mb-3'>ActionSheet 底部操作菜单</h4>
              <p class='text-sm text-base-content/60 mb-4'>适合移动端“更多操作”“分享”“危险操作确认前置”等入口。</p>
              <Button variant='primary' onclick={() => actionSheetOpen = true}>打开 ActionSheet</Button>
            </Card>
            <Card bordered>
              <h4 class='font-semibold mb-3'>InfiniteScroll 上拉加载</h4>
              <InfiniteScroll
                class='h-52 rounded-xl border border-base-200 bg-base-100 px-3'
                hasMore={mobileFeedHasMore}
                loadingText='加载更多...'
                noMoreText='没有更多数据'
                onloadmore={loadMoreMobileItems}
              >
                <div class='space-y-2 py-3'>
                  {#each mobileFeedItems as item (item.id)}
                    <div class='rounded-lg bg-base-200/60 px-3 py-2'>
                      <p class='text-sm font-medium'>{item.title}</p>
                      <p class='text-xs text-base-content/50'>{item.desc}</p>
                    </div>
                  {/each}
                </div>
              </InfiniteScroll>
            </Card>
          </div>
        </div>
      </div>
    </DemoCard>

    <ActionSheet
      open={actionSheetOpen}
      title='选择操作'
      cancelText='取消'
      items={actionSheetItems}
      onselect={(id: string) => toast.info(`选择: ${id}`)}
      onclose={() => actionSheetOpen = false}
    />
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='数据展示'
    subtitle='DataTable / Accordion / Timeline / Alert / Empty / Result / Skeleton'
    iconClass='icon-[tabler--table]'
    tone='info'
  >
    <DemoCard title='DataTable 数据表格' description='操作列、空状态、加载态' code={codeDataTable}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>带操作列</p>
          <DataTable
            data={tableData}
            columns={[
              { key: 'name', label: '姓名' },
              { key: 'role', label: '角色' },
              { key: 'status', label: '状态' },
            ]}
            keyField='id'
          >
            {#snippet actions(item: typeof tableData[0])}
              <Button size='xs' variant='ghost' onclick={() => toast.info(`编辑: ${item.name}`)}>编辑</Button>
              <Button size='xs' variant='error' onclick={() => toast.error(`删除: ${item.name}`)}>删除</Button>
            {/snippet}
          </DataTable>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>无数据状态</p>
          <DataTable
            data={[]}
            columns={[
              { key: 'name', label: '姓名' },
              { key: 'role', label: '角色' },
            ]}
            keyField='id'
          />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>加载中</p>
          <DataTable
            data={[]}
            columns={[
              { key: 'name', label: '姓名' },
              { key: 'role', label: '角色' },
            ]}
            keyField='id'
            loading
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Accordion 手风琴' description='bordered / shadow / joined 多选' code={codeAccordion}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>边框样式（bordered）</p>
          <Accordion items={accordionItems} variant='bordered' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>阴影样式（shadow）</p>
          <Accordion items={accordionItems.slice(0, 2)} variant='shadow' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>连接样式（joined）+ 多选</p>
          <Accordion items={accordionItems} variant='joined' multiple bind:value={accordionVal} icon='plus' />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Timeline 时间线' description='默认与紧凑模式' code={codeTimeline}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>默认（垂直）</p>
          <Timeline items={timelineItems} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>紧凑模式</p>
          <Timeline items={timelineItems} compact />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Alert 警告提示' description='信息/成功/警告/错误/带标题' code={codeAlert}>
      <div class='space-y-3'>
        <Alert variant='info'>信息提示：系统将于今晚 22:00 进行例行维护，预计持续 2 小时。</Alert>
        <Alert variant='success'>操作成功！数据已保存至数据库。</Alert>
        <Alert variant='warning' dismissible>警告：存储空间已使用 90%，请及时清理。</Alert>
        <Alert variant='error'>错误：网络连接超时，请检查网络设置后重试。</Alert>
        <Alert variant='info' title='带标题的提示'>这是一条带有标题的信息提示，标题会以粗体显示。</Alert>
      </div>
    </DemoCard>

    <DemoCard title='Empty 空状态 / Result 结果页' description='空状态与结果页' code={codeEmptyResult}>
      <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        <Empty title='暂无数据' description='当前列表为空' icon='inbox' />
        <Empty title='未找到结果' description='尝试修改搜索条件' icon='search' />
        <Empty title='无文件' description='拖拽文件到此处上传' icon='file' size='sm' />
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6 mt-6'>
        <Result status='success' title='提交成功' description='您的申请已成功提交，审核结果将在 3 个工作日内通知。' />
        <Result status='error' title='操作失败' description='权限不足，请联系管理员处理。' />
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6 mt-4'>
        <Result status='warning' title='需要注意' description='部分数据已过期，请检查更新。' />
        <Result status='info' title='处理中' description='您的请求正在排队处理，请稍候。' />
      </div>
    </DemoCard>

    <DemoCard title='Skeleton 骨架屏' description='卡片、表单、多行、缩略图加载态' code={codeSkeleton}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>卡片加载态</p>
          <div class='flex items-start gap-4'>
            <Skeleton variant='avatar' />
            <div class='flex-1 space-y-2'>
              <Skeleton variant='title' width='60%' />
              <Skeleton variant='text' />
              <Skeleton variant='text' width='80%' />
            </div>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>表单加载态</p>
          <div class='space-y-3'>
            <Skeleton variant='input' />
            <Skeleton variant='input' />
            <Skeleton variant='button' width='120px' />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>多行文本</p>
          <Skeleton variant='text' count={4} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>缩略图</p>
          <div class='flex gap-3'>
            <Skeleton variant='thumbnail' />
            <Skeleton variant='thumbnail' />
            <Skeleton variant='thumbnail' />
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='浮层与交互'
    subtitle='Tooltip / Popover / Dropdown'
    iconClass='icon-[tabler--message-circle]'
    tone='warning'
  >
    <DemoCard title='Tooltip / Popover / Dropdown' description='提示、弹出层与下拉菜单' code={codeOverlayMenus}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>Tooltip 位置</p>
          <div class='flex flex-wrap items-center gap-4'>
            <Tooltip content='顶部提示' position='top'>
              <Button variant='primary' outline>上</Button>
            </Tooltip>
            <Tooltip content='底部提示' position='bottom'>
              <Button variant='primary' outline>下</Button>
            </Tooltip>
            <Tooltip content='左侧提示' position='left'>
              <Button variant='primary' outline>左</Button>
            </Tooltip>
            <Tooltip content='右侧提示' position='right'>
              <Button variant='primary' outline>右</Button>
            </Tooltip>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Popover</p>
          <div class='flex flex-wrap items-center gap-4'>
            <Popover position='bottom' trigger='click'>
              {#snippet triggerContent()}
                <Button variant='secondary' outline>点击弹出</Button>
              {/snippet}
              <div class='p-3 text-sm space-y-2'>
                <p class='font-medium'>弹出面板</p>
                <p class='text-base-content/70'>支持任意内容，适合放置表单、信息卡片等。</p>
              </div>
            </Popover>
            <Popover position='right' trigger='hover'>
              {#snippet triggerContent()}
                <Button variant='info' outline>悬停弹出</Button>
              {/snippet}
              <div class='p-3 text-sm'>
                <p>鼠标悬停时自动弹出</p>
              </div>
            </Popover>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Dropdown 下拉菜单</p>
          <div class='flex flex-wrap items-center gap-4'>
            <Dropdown items={dropdownItems} onselect={(k: string) => toast.info(`选择: ${k}`)}>
              <Button>操作菜单 ▾</Button>
            </Dropdown>
            <Dropdown items={dropdownItems} position='right' onselect={(k: string) => toast.info(`选择: ${k}`)}>
              <Button variant='secondary'>右侧展开 ▸</Button>
            </Dropdown>
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='表单组件'
    subtitle='Form / Combobox / TagInput / Calendar / DatePicker'
    iconClass='icon-[tabler--forms]'
    tone='success'
  >
    <DemoCard title='Form / FormField 表单' description='表单布局、校验与提交' code={codeForm}>
      <Form onsubmit={async () => { toast.success(`提交: ${formName}, ${formEmail}`) }}>
        <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <FormField label='姓名' required>
            <Input bind:value={formName} placeholder='请输入姓名' />
          </FormField>
          <FormField label='邮箱' error={formEmail && !formEmail.includes('@') ? '邮箱格式不正确' : ''}>
            <Input bind:value={formEmail} placeholder='请输入邮箱' />
          </FormField>
          <FormField label='角色' hint='选择用户在系统中的角色'>
            <Select options={[
              { value: 'admin', label: '管理员' },
              { value: 'editor', label: '编辑' },
              { value: 'viewer', label: '访客' },
            ]} placeholder='请选择角色' />
          </FormField>
          <FormField label='备注'>
            <Textarea placeholder='可选备注信息' rows={2} />
          </FormField>
        </div>
        <div class='mt-4 flex gap-2'>
          <Button variant='primary' type='submit'>提交</Button>
          <Button type='reset'>重置</Button>
        </div>
      </Form>
    </DemoCard>

    <DemoCard title='Combobox 可搜索选择（Bits UI）' description='单选、多选、错误态' code={codeCombobox}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>单选（当前: {comboboxVal || '未选择'}）</p>
          <Combobox options={comboboxOpts} bind:value={comboboxVal} placeholder='搜索框架...' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>单选 - 错误状态</p>
          <Combobox options={comboboxOpts} placeholder='搜索框架...' error='请选择一个框架' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>单选 - 禁用</p>
          <Combobox options={comboboxOpts} value='svelte' disabled />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>单选 - 带标签</p>
          <Combobox options={comboboxOpts} placeholder='搜索...' label='技术栈' />
        </div>
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6 mt-6'>
        <div>
          <p class='text-sm font-medium mb-2'>多选（已选: {comboboxMultiVal.length} 项）</p>
          <Combobox options={multiOpts} bind:value={comboboxMultiVal} multiple placeholder='搜索技能...' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>多选 - 带标签</p>
          <Combobox options={multiOpts} value={[]} multiple placeholder='选择...' label='技能标签' />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='输入类控件尺寸对齐' description='Input / Select / Combobox / DatePicker / TagInput 共享 xs 到 xl 的高度与字号基准' code={codeControlAlignment}>
      <div class='overflow-x-auto'>
        <div class='grid min-w-184 grid-cols-[3rem_repeat(5,minmax(8rem,1fr))] items-center gap-x-3 gap-y-2'>
          <span></span>
          <span class='text-xs font-medium text-base-content/55'>Input</span>
          <span class='text-xs font-medium text-base-content/55'>Select</span>
          <span class='text-xs font-medium text-base-content/55'>Combobox</span>
          <span class='text-xs font-medium text-base-content/55'>DatePicker</span>
          <span class='text-xs font-medium text-base-content/55'>TagInput</span>

          {#each alignedControlSizes as controlSize (controlSize)}
            <span class='text-xs font-semibold uppercase text-base-content/45'>{controlSize}</span>
            <Input data-testid='aligned-input-{controlSize}' size={controlSize} placeholder='文本' />
            <Select data-testid='aligned-select-{controlSize}' size={controlSize} options={comboboxOpts} placeholder='选择' />
            <Combobox data-testid='aligned-combobox-{controlSize}' size={controlSize} options={comboboxOpts} placeholder='搜索' />
            <DatePicker data-testid='aligned-datepicker-{controlSize}' size={controlSize} />
            <TagInput data-testid='aligned-taginput-{controlSize}' size={controlSize} tags={[]} placeholder='标签' />
          {/each}
        </div>
      </div>
    </DemoCard>

    <DemoCard title='TagInput 标签输入' description='基础、上限、允许重复、禁用' code={codeTagInput}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>基础用法（当前 {tagInputVal.length} 个）</p>
          <TagInput bind:tags={tagInputVal} placeholder='输入后回车添加' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>最多 5 个标签</p>
          <TagInput tags={['标签A', '标签B']} maxTags={5} placeholder='最多 5 个' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>允许重复</p>
          <TagInput tags={[]} allowDuplicates placeholder='可重复输入' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>禁用状态</p>
          <TagInput tags={['只读A', '只读B']} disabled />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Calendar 日历 / DatePicker 日期选择（Bits UI）' description='独立日历与日期选择器' code={codeCalendar}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>独立日历</p>
          <Calendar bind:value={calendarVal} weekStartsOn={1} />
          <p class='text-xs text-base-content/50 mt-2'>选中: {calendarVal?.toString() ?? '无'}</p>
        </div>
        <div class='space-y-4'>
          <div>
            <p class='text-sm font-medium mb-2'>日期选择器</p>
            <DatePicker bind:value={datePickerVal} />
            <p class='text-xs text-base-content/50 mt-2'>选中: {datePickerVal?.toString() ?? '无'}</p>
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>错误状态</p>
            <DatePicker error='请选择有效日期' />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>禁用状态</p>
            <DatePicker disabled />
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='布局组件'
    subtitle='Card / PageHeader'
    iconClass='icon-[tabler--layout-grid]'
    tone='secondary'
  >
    <DemoCard title='Card 卡片' description='边框、阴影、内边距、header/footer 插槽' code={codeCardLayout}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card title='默认卡片'>
          <p class='text-sm text-base-content/70'>这是默认样式的卡片内容。</p>
        </Card>
        <Card title='带边框' bordered>
          <p class='text-sm text-base-content/70'>bordered 属性添加边框。</p>
        </Card>
        <Card title='大阴影' shadow='lg'>
          <p class='text-sm text-base-content/70'>shadow="lg" 更大的阴影。</p>
        </Card>
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4'>
        <Card padding='lg' bordered>
          {#snippet header()}
            <div class='flex items-center justify-between'>
              <h4 class='font-semibold'>自定义 Header</h4>
              <Badge variant='success'>在线</Badge>
            </div>
          {/snippet}
          <p class='text-sm text-base-content/70'>使用 header / footer 插槽自定义卡片的头部和底部。</p>
          {#snippet footer()}
            <div class='flex justify-end gap-2'>
              <Button size='sm'>取消</Button>
              <Button size='sm' variant='primary'>确认</Button>
            </div>
          {/snippet}
        </Card>
        <Card padding='none' bordered>
          <div class='p-4'>
            <h4 class='font-semibold mb-2'>无内边距</h4>
            <p class='text-sm text-base-content/70'>padding="none" 适合需要自定义布局的场景。</p>
          </div>
          <div class='bg-base-200 p-4'>
            <p class='text-xs text-base-content/50'>底部区域</p>
          </div>
        </Card>
      </div>
    </DemoCard>

    <DemoCard title='PageHeader 页面头部' description='标题、描述与操作区' code={codePageHeader}>
      <div class='space-y-4'>
        <div class='bg-base-200/50 rounded-lg p-4'>
          <PageHeader title='用户管理' description='管理系统中的所有用户账号'>
            {#snippet actions()}
              <Button variant='primary' size='sm'>新建用户</Button>
            {/snippet}
          </PageHeader>
        </div>
        <div class='bg-base-200/50 rounded-lg p-4'>
          <PageHeader title='数据分析' description='查看系统运行数据与统计报表' />
        </div>
      </div>
    </DemoCard>
  </DemoSection>
</div>
