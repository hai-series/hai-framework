<!--
  组合组件（Compounds）展示 - 26 个复杂 UI 模式
  Breadcrumb / Tabs / Pagination / Steps / DataTable / Accordion / Timeline /
  Alert / Empty / Result / Skeleton / Tooltip / Popover / Dropdown /
  Form / FormField / Combobox / Calendar / DatePicker / TagInput /
  Card / PageHeader / ToastContainer
-->
<script lang="ts">
  import { CalendarDate } from '@internationalized/date'
  import type { DateValue } from '@internationalized/date'
  import { toast } from '@h-ai/ui'

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
</script>

<div class="space-y-10">
  <!-- ====================================================================== -->
  <!-- 导航与流程                                                              -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">导航与流程</h2>
        <p class="text-sm text-base-content/60">Breadcrumb / Tabs / Pagination / Steps</p>
      </div>
    </div>

  <!-- ==================== Breadcrumb ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Breadcrumb 面包屑</h3>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium mb-2">默认分隔符</p>
        <Breadcrumb items={breadcrumbItems} />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">自定义分隔符</p>
        <Breadcrumb items={breadcrumbItems} separator="›" />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">长路径</p>
        <Breadcrumb items={[
          { label: '首页', href: '/' },
          { label: '系统管理', href: '/admin' },
          { label: '用户管理', href: '/admin/users' },
          { label: '用户详情', href: '/admin/users/1' },
          { label: '编辑' },
        ]} />
      </div>
    </div>
  </Card>

  <!-- ==================== Tabs ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Tabs 标签页</h3>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium mb-2">线条样式（line）</p>
        <Tabs
          items={[
            { key: 'info', label: '基本信息' },
            { key: 'security', label: '安全设置' },
            { key: 'notify', label: '通知偏好' },
          ]}
          bind:active={subTab}
          type="line"
        />
        <p class="mt-2 p-3 bg-base-200 rounded-lg text-sm">当前: {subTab}</p>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">卡片样式（card）</p>
        <Tabs
          items={[
            { key: 'all', label: '全部' },
            { key: 'active', label: '进行中' },
            { key: 'done', label: '已完成' },
          ]}
          active="all"
          type="card"
        />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">药丸样式（pills）</p>
        <Tabs
          items={[
            { key: 'day', label: '日' },
            { key: 'week', label: '周' },
            { key: 'month', label: '月' },
            { key: 'year', label: '年' },
          ]}
          active="month"
          type="pills"
        />
      </div>
    </div>
  </Card>

  <!-- ==================== Pagination / Steps ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Pagination 分页 / Steps 步骤条</h3>
    <div class="space-y-6">
      <div>
        <p class="text-sm font-medium mb-2">分页（第 {paginationPage} 页，共 5 页）</p>
        <Pagination total={50} bind:page={paginationPage} pageSize={10} onchange={(p: number) => paginationPage = p} />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">分页 - 显示跳转 + 自定义大小</p>
        <Pagination total={200} bind:page={paginationPage2} pageSize={20} showJumper size="sm" onchange={(p: number) => paginationPage2 = p} />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">步骤条（水平）- 当前第 {stepsIndex + 1} 步</p>
        <Steps items={stepsItems} current={stepsIndex} clickable onchange={(i: number) => stepsIndex = i} />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">步骤条（垂直）</p>
        <Steps items={stepsItems} current={2} direction="vertical" size="sm" />
      </div>
    </div>
  </Card>
  </section>

  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- 数据展示                                                                -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-info/10 text-info">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">数据展示</h2>
        <p class="text-sm text-base-content/60">DataTable / Accordion / Timeline / Alert / Empty / Result / Skeleton</p>
      </div>
    </div>

  <!-- ==================== DataTable ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">DataTable 数据表格</h3>
    <div class="space-y-6">
      <div>
        <p class="text-sm font-medium mb-2">带操作列</p>
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
            <Button size="xs" variant="error" onclick={() => toast.error(`删除: ${item.name}`)}>删除</Button>
          {/snippet}
        </DataTable>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">无数据状态</p>
        <DataTable
          data={[]}
          columns={[
            { key: 'name', label: '姓名' },
            { key: 'role', label: '角色' },
          ]}
          keyField="id"
        />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">加载中</p>
        <DataTable
          data={[]}
          columns={[
            { key: 'name', label: '姓名' },
            { key: 'role', label: '角色' },
          ]}
          keyField="id"
          loading
        />
      </div>
    </div>
  </Card>

  <!-- ==================== Accordion ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Accordion 手风琴</h3>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium mb-2">边框样式（bordered）</p>
        <Accordion items={accordionItems} variant="bordered" />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">阴影样式（shadow）</p>
        <Accordion items={accordionItems.slice(0, 2)} variant="shadow" />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">连接样式（joined）+ 多选</p>
        <Accordion items={accordionItems} variant="joined" multiple bind:value={accordionVal} icon="plus" />
      </div>
    </div>
  </Card>

  <!-- ==================== Timeline ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Timeline 时间线</h3>
    <div class="space-y-6">
      <div>
        <p class="text-sm font-medium mb-2">默认（垂直）</p>
        <Timeline items={timelineItems} />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">紧凑模式</p>
        <Timeline items={timelineItems} compact />
      </div>
    </div>
  </Card>

  <!-- ==================== Alert ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Alert 警告提示</h3>
    <div class="space-y-3">
      <Alert variant="info">信息提示：系统将于今晚 22:00 进行例行维护，预计持续 2 小时。</Alert>
      <Alert variant="success">操作成功！数据已保存至数据库。</Alert>
      <Alert variant="warning" dismissible>警告：存储空间已使用 90%，请及时清理。</Alert>
      <Alert variant="error">错误：网络连接超时，请检查网络设置后重试。</Alert>
      <Alert variant="info" title="带标题的提示">这是一条带有标题的信息提示，标题会以粗体显示。</Alert>
    </div>
  </Card>

  <!-- ==================== Empty / Result ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Empty 空状态 / Result 结果页</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Empty title="暂无数据" description="当前列表为空" icon="inbox" />
      <Empty title="未找到结果" description="尝试修改搜索条件" icon="search" />
      <Empty title="无文件" description="拖拽文件到此处上传" icon="file" size="sm" />
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <Result status="success" title="提交成功" description="您的申请已成功提交，审核结果将在 3 个工作日内通知。" />
      <Result status="error" title="操作失败" description="权限不足，请联系管理员处理。" />
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
      <Result status="warning" title="需要注意" description="部分数据已过期，请检查更新。" />
      <Result status="info" title="处理中" description="您的请求正在排队处理，请稍候。" />
    </div>
  </Card>

  <!-- ==================== Skeleton ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Skeleton 骨架屏</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <p class="text-sm font-medium mb-2">卡片加载态</p>
        <div class="flex items-start gap-4">
          <Skeleton variant="avatar" />
          <div class="flex-1 space-y-2">
            <Skeleton variant="title" width="60%" />
            <Skeleton variant="text" />
            <Skeleton variant="text" width="80%" />
          </div>
        </div>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">表单加载态</p>
        <div class="space-y-3">
          <Skeleton variant="input" />
          <Skeleton variant="input" />
          <Skeleton variant="button" width="120px" />
        </div>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">多行文本</p>
        <Skeleton variant="text" count={4} />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">缩略图</p>
        <div class="flex gap-3">
          <Skeleton variant="thumbnail" />
          <Skeleton variant="thumbnail" />
          <Skeleton variant="thumbnail" />
        </div>
      </div>
    </div>
  </Card>
  </section>

  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- 浮层与交互                                                              -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-warning/10 text-warning">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">浮层与交互</h2>
        <p class="text-sm text-base-content/60">Tooltip / Popover / Dropdown</p>
      </div>
    </div>

  <!-- ==================== Tooltip / Popover / Dropdown ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Tooltip / Popover / Dropdown</h3>
    <div class="space-y-6">
      <div>
        <p class="text-sm font-medium mb-2">Tooltip 位置</p>
        <div class="flex flex-wrap items-center gap-4">
          <Tooltip content="顶部提示" position="top">
            <Button variant="primary" outline>上</Button>
          </Tooltip>
          <Tooltip content="底部提示" position="bottom">
            <Button variant="primary" outline>下</Button>
          </Tooltip>
          <Tooltip content="左侧提示" position="left">
            <Button variant="primary" outline>左</Button>
          </Tooltip>
          <Tooltip content="右侧提示" position="right">
            <Button variant="primary" outline>右</Button>
          </Tooltip>
        </div>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">Popover</p>
        <div class="flex flex-wrap items-center gap-4">
          <Popover position="bottom" trigger="click">
            {#snippet triggerContent()}
              <Button variant="secondary" outline>点击弹出</Button>
            {/snippet}
            <div class="p-3 text-sm space-y-2">
              <p class="font-medium">弹出面板</p>
              <p class="text-base-content/70">支持任意内容，适合放置表单、信息卡片等。</p>
            </div>
          </Popover>
          <Popover position="right" trigger="hover">
            {#snippet triggerContent()}
              <Button variant="info" outline>悬停弹出</Button>
            {/snippet}
            <div class="p-3 text-sm">
              <p>鼠标悬停时自动弹出</p>
            </div>
          </Popover>
        </div>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">Dropdown 下拉菜单</p>
        <div class="flex flex-wrap items-center gap-4">
          <Dropdown items={dropdownItems} onselect={(k: string) => toast.info(`选择: ${k}`)}>
            <Button>操作菜单 ▾</Button>
          </Dropdown>
          <Dropdown items={dropdownItems} position="right" onselect={(k: string) => toast.info(`选择: ${k}`)}>
            <Button variant="secondary">右侧展开 ▸</Button>
          </Dropdown>
        </div>
      </div>
    </div>
  </Card>
  </section>

  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- 表单组件                                                                -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-success/10 text-success">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">表单组件</h2>
        <p class="text-sm text-base-content/60">Form / Combobox / TagInput / Calendar / DatePicker</p>
      </div>
    </div>

  <!-- ==================== Form / FormField ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Form / FormField 表单</h3>
    <Form onsubmit={async () => { toast.success(`提交: ${formName}, ${formEmail}`) }}>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="姓名" required>
          <Input bind:value={formName} placeholder="请输入姓名" />
        </FormField>
        <FormField label="邮箱" error={formEmail && !formEmail.includes('@') ? '邮箱格式不正确' : ''}>
          <Input bind:value={formEmail} placeholder="请输入邮箱" />
        </FormField>
        <FormField label="角色" hint="选择用户在系统中的角色">
          <Select options={[
            { value: 'admin', label: '管理员' },
            { value: 'editor', label: '编辑' },
            { value: 'viewer', label: '访客' },
          ]} placeholder="请选择角色" />
        </FormField>
        <FormField label="备注">
          <Textarea placeholder="可选备注信息" rows={2} />
        </FormField>
      </div>
      <div class="mt-4 flex gap-2">
        <Button variant="primary" type="submit">提交</Button>
        <Button type="reset">重置</Button>
      </div>
    </Form>
  </Card>

  <!-- ==================== Combobox ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Combobox 可搜索选择（Bits UI）</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <p class="text-sm font-medium mb-2">单选（当前: {comboboxVal || '未选择'}）</p>
        <Combobox options={comboboxOpts} bind:value={comboboxVal} placeholder="搜索框架..." />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">单选 - 错误状态</p>
        <Combobox options={comboboxOpts} placeholder="搜索框架..." error="请选择一个框架" />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">单选 - 禁用</p>
        <Combobox options={comboboxOpts} value="svelte" disabled />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">单选 - 带标签</p>
        <Combobox options={comboboxOpts} placeholder="搜索..." label="技术栈" />
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <div>
        <p class="text-sm font-medium mb-2">多选（已选: {comboboxMultiVal.length} 项）</p>
        <Combobox options={multiOpts} bind:value={comboboxMultiVal} multiple placeholder="搜索技能..." />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">多选 - 带标签</p>
        <Combobox options={multiOpts} value={[]} multiple placeholder="选择..." label="技能标签" />
      </div>
    </div>
  </Card>

  <!-- ==================== TagInput ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">TagInput 标签输入</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <p class="text-sm font-medium mb-2">基础用法（当前 {tagInputVal.length} 个）</p>
        <TagInput bind:tags={tagInputVal} placeholder="输入后回车添加" />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">最多 5 个标签</p>
        <TagInput tags={['标签A', '标签B']} maxTags={5} placeholder="最多 5 个" />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">允许重复</p>
        <TagInput tags={[]} allowDuplicates placeholder="可重复输入" />
      </div>
      <div>
        <p class="text-sm font-medium mb-2">禁用状态</p>
        <TagInput tags={['只读A', '只读B']} disabled />
      </div>
    </div>
  </Card>

  <!-- ==================== Calendar / DatePicker ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Calendar 日历 / DatePicker 日期选择（Bits UI）</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <p class="text-sm font-medium mb-2">独立日历</p>
        <Calendar bind:value={calendarVal} weekStartsOn={1} />
        <p class="text-xs text-base-content/50 mt-2">选中: {calendarVal?.toString() ?? '无'}</p>
      </div>
      <div class="space-y-4">
        <div>
          <p class="text-sm font-medium mb-2">日期选择器</p>
          <DatePicker bind:value={datePickerVal} />
          <p class="text-xs text-base-content/50 mt-2">选中: {datePickerVal?.toString() ?? '无'}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-2">错误状态</p>
          <DatePicker error="请选择有效日期" />
        </div>
        <div>
          <p class="text-sm font-medium mb-2">禁用状态</p>
          <DatePicker disabled />
        </div>
      </div>
    </div>
  </Card>
  </section>

  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- 布局组件                                                                -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-secondary/10 text-secondary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">布局组件</h2>
        <p class="text-sm text-base-content/60">Card / PageHeader</p>
      </div>
    </div>

  <!-- ==================== Card ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">Card 卡片</h3>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card title="默认卡片">
        <p class="text-sm text-base-content/70">这是默认样式的卡片内容。</p>
      </Card>
      <Card title="带边框" bordered>
        <p class="text-sm text-base-content/70">bordered 属性添加边框。</p>
      </Card>
      <Card title="大阴影" shadow="lg">
        <p class="text-sm text-base-content/70">shadow="lg" 更大的阴影。</p>
      </Card>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <Card padding="lg" bordered>
        {#snippet header()}
          <div class="flex items-center justify-between">
            <h4 class="font-semibold">自定义 Header</h4>
            <Badge variant="success">在线</Badge>
          </div>
        {/snippet}
        <p class="text-sm text-base-content/70">使用 header / footer 插槽自定义卡片的头部和底部。</p>
        {#snippet footer()}
          <div class="flex justify-end gap-2">
            <Button size="sm">取消</Button>
            <Button size="sm" variant="primary">确认</Button>
          </div>
        {/snippet}
      </Card>
      <Card padding="none" bordered>
        <div class="p-4">
          <h4 class="font-semibold mb-2">无内边距</h4>
          <p class="text-sm text-base-content/70">padding="none" 适合需要自定义布局的场景。</p>
        </div>
        <div class="bg-base-200 p-4">
          <p class="text-xs text-base-content/50">底部区域</p>
        </div>
      </Card>
    </div>
  </Card>

  <!-- ==================== PageHeader ==================== -->
  <Card bordered>
    <h3 class="text-lg font-semibold mb-4">PageHeader 页面头部</h3>
    <div class="space-y-4">
      <div class="bg-base-200/50 rounded-lg p-4">
        <PageHeader title="用户管理" description="管理系统中的所有用户账号">
          {#snippet actions()}
            <Button variant="primary" size="sm">新建用户</Button>
          {/snippet}
        </PageHeader>
      </div>
      <div class="bg-base-200/50 rounded-lg p-4">
        <PageHeader title="数据分析" description="查看系统运行数据与统计报表" />
      </div>
    </div>
  </Card>
  </section>
</div>
