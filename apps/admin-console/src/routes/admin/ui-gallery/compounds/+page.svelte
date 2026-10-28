<!--
  组合组件（Compounds）展示 - 复杂 UI 模式与移动端应用组件
  Breadcrumb / Tabs / Pagination / Steps / DataTable / Accordion / Timeline /
  Alert / Empty / Result / Skeleton / Tooltip / Popover / Dropdown /
  AppBar / BottomNav / SafeArea / ActionSheet / PullRefresh / InfiniteScroll / SwipeCell /
  Form / FormField / Combobox / Calendar / DatePicker / TagInput /
  Card / PageHeader / ToastContainer
-->
<script lang='ts'>
  import type { FormLabelPosition } from '@h-ai/ui'
  import type { DateValue } from '@internationalized/date'
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import InteractionPatterns from '$lib/components/gallery/InteractionPatterns.svelte'
  import * as m from '$lib/paraglide/messages'
  import { ActionSheet, AppBar, BottomNav, InfiniteScroll, PullRefresh, SafeArea, SwipeCell, toast } from '@h-ai/ui'
  import { CalendarDate } from '@internationalized/date'

  // === 状态 ===
  let galleryFilterSearch = $state('')
  let galleryFilterValues = $state<Record<string, unknown>>({})
  const galleryFilterFields = $derived([
    { id: 'role', label: m.gallery_filter_role(), type: 'text' },
    { id: 'department', label: m.gallery_filter_department(), type: 'text' },
    { id: 'enabled', label: m.gallery_filter_status(), type: 'boolean' },
    { id: 'created', label: m.gallery_filter_date(), type: 'date-range' },
  ])
  const codeFilterBar = '<CrudFilterBar filterFields={filterFields} bind:searchValue bind:filterValues />'

  let comboboxVal = $state('')
  let showComboboxError = $state(false)
  let showDatePickerError = $state(false)
  let comboboxMultiVal = $state<string[]>(['fe'])
  let calendarVal = $state<DateValue>(new CalendarDate(2026, 2, 26))
  let datePickerVal = $state<DateValue>(new CalendarDate(2026, 2, 26))
  let paginationPage = $state(1)
  let paginationPage2 = $state(3)
  let stepsIndex = $state(1)
  let subTab = $state('info')
  let tagInputVal = $state<string[]>(['Svelte', 'TypeScript'])
  let formColumns = $state<1 | 2>(2)
  let formLabelPosition = $state<FormLabelPosition>('top')
  let formName = $state('')
  let formEmail = $state('')
  let accordionVal = $state<string | string[]>()
  let actionSheetOpen = $state(false)
  let bottomNavActive = $state('home')
  let refreshCount = $state(0)
  let mobileFeedHasMore = $state(true)
  let mobileFeedItems = $state([
    { id: 'm1', title: m.gallery_demo_order_issue_alerts(), desc: m.gallery_demo_3_orders_need_manual_review() },
    { id: 'm2', title: m.gallery_demo_restock_recommendations(), desc: m.gallery_demo_a_popular_sku_is_below_its_safety_stock() },
    { id: 'm3', title: m.gallery_demo_support_conversation_summary(), desc: m.gallery_demo_ai_has_summarized_today_s_common_questions() },
  ])

  // === 示例数据 ===
  const breadcrumbItems = [
    { label: m.nav_home(), href: '/' },
    { label: m.gallery_demo_manage(), href: '/admin' },
    { label: m.gallery_title() },
  ]

  const tableData = [
    { id: 1, name: m.gallery_demo_zhang_san(), role: m.gallery_form_admin(), status: m.gallery_demo_active() },
    { id: 2, name: m.gallery_demo_li_si(), role: m.action_edit(), status: m.gallery_demo_active() },
    { id: 3, name: m.gallery_demo_wang_wu(), role: m.common_guest(), status: m.gallery_demo_inactive() },
  ]

  const timelineItems = [
    { id: '1', title: m.gallery_demo_create_project(), description: m.gallery_demo_project_and_environment_setup_complete(), time: '2026-01-01', color: 'primary' as const, completed: true },
    { id: '2', title: m.gallery_demo_core_development(), description: m.gallery_demo_complete_core_modules_and_unit_tests(), time: '2026-02-15', color: 'info' as const, completed: true },
    { id: '3', title: m.gallery_demo_integration_testing(), description: m.gallery_demo_run_end_to_end_tests_and_optimize_performance(), time: '2026-03-20', color: 'warning' as const },
    { id: '4', title: m.gallery_demo_release(), description: m.gallery_demo_release_and_publish_documentation(), time: '2026-04-01', color: 'success' as const },
  ]

  const stepsItems = [
    { title: m.gallery_demo_enter_information(), description: m.gallery_demo_enter_basic_information() },
    { title: m.gallery_demo_authentication(), description: m.gallery_demo_email_verification() },
    { title: m.gallery_demo_set_password(), description: m.gallery_demo_create_a_strong_password() },
    { title: m.gallery_demo_complete_registration() },
  ]

  const accordionItems = [
    { id: 'q1', title: m.gallery_demo_how_do_i_create_an_account(), content: m.gallery_demo_select_register_at_the_top_right_then_enter() },
    { id: 'q2', title: m.gallery_demo_how_do_i_reset_my_password(), content: m.gallery_demo_select_forgot_password_on_the_login_page_enter() },
    { id: 'q3', title: m.gallery_demo_which_browsers_are_supported(), content: m.gallery_demo_use_a_current_browser_confirm_compatibility_against_your() },
    { id: 'q4', title: m.gallery_demo_how_do_i_contact_support(), content: m.gallery_demo_for_this_example_contact_support_example_com_on() },
  ]

  const dropdownItems = [
    { label: m.action_edit(), key: 'edit' },
    { label: m.gallery_demo_copy(), key: 'copy' },
    { label: m.gallery_demo_move(), key: 'move' },
    { divider: true, key: 'divider-1', label: '' },
    { label: m.modules_vecdb_op_delete(), key: 'delete' },
  ]

  const comboboxOpts = [
    { value: 'svelte', label: 'Svelte', description: m.gallery_demo_compile_time_framework() },
    { value: 'react', label: 'React', description: m.gallery_demo_by_meta() },
    { value: 'vue', label: 'Vue', description: m.gallery_demo_progressive_framework() },
    { value: 'angular', label: 'Angular', description: m.gallery_demo_by_google() },
    { value: 'solid', label: 'SolidJS', description: m.gallery_demo_fine_grained_reactivity() },
    { value: 'qwik', label: 'Qwik', description: m.gallery_demo_resumable_framework() },
  ]

  const multiOpts = [
    { value: 'fe', label: m.gallery_demo_frontend_developer() },
    { value: 'be', label: m.gallery_demo_backend_developer() },
    { value: 'devops', label: 'DevOps' },
    { value: 'design', label: m.gallery_demo_design() },
    { value: 'pm', label: m.gallery_demo_product_management() },
    { value: 'qa', label: m.gallery_demo_quality_assurance() },
  ]

  const alignedControlSizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const

  const actionSheetItems = [
    { id: 'share', label: m.gallery_demo_share_report() },
    { id: 'archive', label: m.gallery_demo_archive_notification() },
    { id: 'delete', label: m.gallery_demo_delete_record(), destructive: true },
  ]

  const bottomNavItems = [
    { id: 'home', label: m.nav_home(), iconClass: 'icon-[tabler--home]' },
    { id: 'tasks', label: m.gallery_demo_tasks(), iconClass: 'icon-[tabler--checklist]', badge: 3 },
    { id: 'profile', label: m.gallery_demo_my_account(), iconClass: 'icon-[tabler--user]' },
  ]

  const swipeActions = [
    { id: 'done', label: m.gallery_demo_complete(), variant: 'primary' as const },
    { id: 'delete', label: m.modules_vecdb_op_delete(), variant: 'error' as const },
  ]

  async function refreshMobileDemo() {
    refreshCount += 1
    mobileFeedItems = [
      { id: `refresh-${refreshCount}`, title: m.gallery_demo_refreshed(), desc: m.gallery_demo_refresh_count({ value: refreshCount + 1 }) },
      ...mobileFeedItems.slice(0, 4),
    ]
    toast.success(m.gallery_demo_mobile_list_refreshed())
  }

  async function loadMoreMobileItems() {
    if (!mobileFeedHasMore)
      return

    const nextIndex = mobileFeedItems.length + 1
    mobileFeedItems = [
      ...mobileFeedItems,
      { id: `m${nextIndex}`, title: m.gallery_demo_more_item({ value: nextIndex }), desc: m.gallery_demo_items_are_added_automatically_when_you_reach_the() },
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
<Alert variant='success'>服务运行正常</Alert>
<Button onclick={() => toast.warning(m.gallery_demo_storage_is_90_full_remove_unneeded_files_to())}>...</Button>
<Button onclick={() => toast.error(m.gallery_demo_the_connection_timed_out_check_your_network_and())}>...</Button>
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

<Dropdown items={dropdownItems} triggerClass='btn no-animation' onselect={(k) => toast.info(k)}>
  操作菜单 ▾
</Dropdown>`

  const codeForm = `<Form columns={2} labelPosition='left' labelWidth='6rem' onsubmit={save}>
  <FormField label={m.name()} required>
    <Input name='name' bind:value required />
  </FormField>
  <FormField label={m.email()}>
    <Input name='email' type='email' bind:value />
  </FormField>
  <!-- 多行文本自动占两列；colSpan={1 | 2} 可覆盖 -->
  <FormField label={m.notes()}><Textarea name='notes' /></FormField>
  <Button type='submit'>{m.save()}</Button>
</Form>`

  const codeCombobox = `<Combobox options={comboboxOpts} bind:value placeholder='搜索框架...' />
<Button onclick={() => showError = !showError}>切换校验提示</Button>
<Combobox options={comboboxOpts} placeholder='...' error={showError ? '请选择一个框架' : undefined} />
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
<Button onclick={() => showError = !showError}>切换校验提示</Button>
<DatePicker error={showError ? '请选择有效日期' : undefined} />
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
    title={m.gallery_demo_navigation_and_workflows()}
    subtitle='Breadcrumb / Tabs / Pagination / Steps'
    iconClass='icon-[tabler--chevron-right]'
    tone='primary'
  >
    <DemoCard title={m.gallery_demo_breadcrumb()} description={m.gallery_demo_default_and_custom_separators()} code={codeBreadcrumb}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_default_separator()}</p>
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_custom_separator()}</p>
          <Breadcrumb items={breadcrumbItems} separator='›' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_long_path()}</p>
          <Breadcrumb items={[
            { label: m.nav_home(), href: '/' },
            { label: m.gallery_demo_system_management(), href: '/admin' },
            { label: m.iam_users_title(), href: '/admin/users' },
            { label: m.gallery_demo_user_details(), href: '/admin/users/1' },
            { label: m.action_edit() },
          ]} />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_tabs()} description={m.gallery_demo_line_card_pills_styles()} code={codeTabs}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_line_style_line()}</p>
          <Tabs
            items={[
              { key: 'info', label: m.gallery_demo_basic_information() },
              { key: 'security', label: m.gallery_demo_security_settings() },
              { key: 'notify', label: m.gallery_demo_notification_preferences() },
            ]}
            bind:active={subTab}
            type='line'
          />
          <p class='mt-2 p-3 bg-base-200 rounded-lg text-sm'>{m.gallery_demo_current()} {subTab}</p>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_card_style_card()}</p>
          <Tabs
            items={[
              { key: 'all', label: m.audit_all() },
              { key: 'active', label: m.gallery_demo_in_progress() },
              { key: 'done', label: m.gallery_demo_completed() },
            ]}
            active='all'
            type='card'
          />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_pill_style_pills()}</p>
          <Tabs
            items={[
              { key: 'day', label: m.gallery_demo_days() },
              { key: 'week', label: m.gallery_demo_weeks() },
              { key: 'month', label: m.gallery_demo_months() },
              { key: 'year', label: m.gallery_demo_years() },
            ]}
            active='month'
            type='pills'
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_pagination_steps()} description={m.gallery_demo_pagination_and_steps()} code={codePaginationSteps}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_pagination_page()} {paginationPage} {m.gallery_demo_of_5()}</p>
          <Pagination total={50} bind:page={paginationPage} pageSize={10} onchange={(p: number) => paginationPage = p} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_pagination_with_page_jump_and_page_size()}</p>
          <Pagination total={200} bind:page={paginationPage2} pageSize={20} showJumper size='sm' onchange={(p: number) => paginationPage2 = p} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_horizontal_steps_current()} {stepsIndex + 1} {m.gallery_demo_step()}</p>
          <Steps items={stepsItems} current={stepsIndex} clickable onchange={(i: number) => stepsIndex = i} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_vertical_steps()}</p>
          <Steps items={stepsItems} current={2} direction='vertical' size='sm' />
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_mobile_application_mode()}
    subtitle='AppBar / BottomNav / SafeArea / ActionSheet / PullRefresh / InfiniteScroll / SwipeCell'
    iconClass='icon-[tabler--device-mobile]'
    tone='primary'
  >
    <DemoCard title={m.gallery_demo_mobile_layout_and_gestures()} description={m.gallery_demo_mobile_shell_preview_navigation_safe_areas_pull_to()} code={codeMobile}>
      <div class='grid grid-cols-1 xl:grid-cols-[24rem_1fr] gap-6 items-start'>
        <div class='mx-auto w-full max-w-sm rounded-4xl border border-base-300 bg-base-200 p-2 shadow-sm'>
          <div class='relative overflow-hidden rounded-3xl bg-base-100 min-h-136'>
            <SafeArea position='top'>
              <AppBar title={m.gallery_demo_mobile_workspace()} fixed={false} safeArea={false}>
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
                <Alert variant='info'>{m.gallery_demo_pull_down_on_a_touch_device_or_trackpad()}</Alert>
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
            <h3 class='text-lg font-semibold mb-2'>{m.gallery_demo_mobile_navigation_and_safe_areas()}</h3>
            <p class='text-sm text-base-content/60'>{m.gallery_demo_appbar_and_bottomnav_provide_top_and_bottom_navigation()}</p>
          </div>
          <div class='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            <Card bordered>
              <h4 class='font-semibold mb-3'>{m.gallery_demo_actionsheet_bottom_actions()}</h4>
              <p class='text-sm text-base-content/60 mb-4'>{m.gallery_demo_use_for_mobile_actions_sharing_and_entry_points()}</p>
              <Button variant='primary' onclick={() => actionSheetOpen = true}>{m.gallery_demo_open_action_sheet()}</Button>
            </Card>
            <Card bordered>
              <h4 class='font-semibold mb-3'>{m.gallery_demo_infinitescroll()}</h4>
              <InfiniteScroll
                class='h-52 rounded-xl border border-base-200 bg-base-100 px-3'
                hasMore={mobileFeedHasMore}
                loadingText={m.gallery_demo_load_more()}
                noMoreText={m.gallery_demo_no_more_items()}
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
      title={m.gallery_demo_choose_an_action()}
      cancelText={m.action_cancel()}
      items={actionSheetItems}
      onselect={(id: string) => toast.info(m.gallery_demo_selected_value({ value: id }))}
      onclose={() => actionSheetOpen = false}
    />
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_data_display()}
    subtitle='DataTable / Accordion / Timeline / Alert / Empty / Result / Skeleton'
    iconClass='icon-[tabler--table]'
    tone='info'
  >
    <DemoCard title={m.gallery_demo_datatable()} description={m.gallery_demo_row_actions_empty_states_and_loading()} code={codeDataTable}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_with_row_actions()}</p>
          <DataTable
            data={tableData}
            columns={[
              { key: 'name', label: m.gallery_form_name() },
              { key: 'role', label: m.gallery_filter_role() },
              { key: 'status', label: m.iam_users_form_status() },
            ]}
            keyField='id'
          >
            {#snippet actions(item: typeof tableData[0])}
              <Button size='xs' variant='ghost' onclick={() => toast.info(m.gallery_demo_edit_value({ value: item.name }))}>{m.action_edit()}</Button>
              <Button size='xs' variant='error' onclick={() => toast.info(m.gallery_demo_delete_value({ value: item.name }))}>{m.modules_vecdb_op_delete()}</Button>
            {/snippet}
          </DataTable>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_empty_state()}</p>
          <DataTable
            data={[]}
            columns={[
              { key: 'name', label: m.gallery_form_name() },
              { key: 'role', label: m.gallery_filter_role() },
            ]}
            keyField='id'
          />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_loading()}</p>
          <DataTable
            data={[]}
            columns={[
              { key: 'name', label: m.gallery_form_name() },
              { key: 'role', label: m.gallery_filter_role() },
            ]}
            keyField='id'
            loading
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_accordion()} description={m.gallery_demo_bordered_shadow_joined_with_multiple_selection()} code={codeAccordion}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_bordered_style()}</p>
          <Accordion items={accordionItems} variant='bordered' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_shadow_style_shadow()}</p>
          <Accordion items={accordionItems.slice(0, 2)} variant='shadow' />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_joined_style_with_multiple_selection()}</p>
          <Accordion items={accordionItems} variant='joined' multiple bind:value={accordionVal} icon='plus' />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_timeline()} description={m.gallery_demo_default_and_compact_modes()} code={codeTimeline}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_default_vertical()}</p>
          <Timeline items={timelineItems} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_compact_mode()}</p>
          <Timeline items={timelineItems} compact />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_alert()} description={m.gallery_demo_info_success_warning_error_and_titled_alerts()} code={codeAlert}>
      <div class='space-y-3'>
        <Alert variant='info'>{m.gallery_demo_scheduled_maintenance_starts_tonight_at_22_00_and()}</Alert>
        <Alert variant='success'>{m.gallery_alert_service_healthy()}</Alert>
        <Button variant='outline' onclick={() => toast.warning(m.gallery_demo_storage_is_90_full_remove_unneeded_files_to())}>{m.gallery_demo_storage_is_90_full_remove_unneeded_files_to()}</Button>
        <Button variant='outline' onclick={() => toast.error(m.gallery_demo_the_connection_timed_out_check_your_network_and())}>{m.gallery_demo_the_connection_timed_out_check_your_network_and()}</Button>
        <Alert variant='info' title={m.gallery_demo_alert_with_title()}>{m.gallery_demo_this_alert_has_a_title_shown_in_bold()}</Alert>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_empty_result()} description={m.gallery_demo_empty_states_and_result_pages()} code={codeEmptyResult}>
      <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        <Empty title={m.common_no_data()} description={m.gallery_demo_no_items_to_display()} icon='inbox' />
        <Empty title={m.gallery_demo_no_results_found()} description={m.gallery_demo_try_different_search_criteria()} icon='search' />
        <Empty title={m.gallery_demo_no_files()} description={m.gallery_demo_drop_files_here_to_upload()} icon='file' size='sm' />
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6 mt-6'>
        <Result status='success' title={m.gallery_demo_submitted()} description={m.gallery_demo_application_submitted_you_will_receive_a_decision_within()} />
        <Result status='error' title={m.iam_roles_operation_failed()} description={m.gallery_demo_you_do_not_have_permission_contact_your_administrator()} />
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6 mt-4'>
        <Result status='warning' title={m.gallery_demo_attention_needed()} description={m.gallery_demo_some_data_is_out_of_date_check_for()} />
        <Result status='info' title={m.gallery_demo_processing()} description={m.gallery_demo_your_request_is_queued_please_wait()} />
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_skeleton()} description={m.gallery_demo_skeletons_for_cards_forms_text_and_thumbnails()} code={codeSkeleton}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_card_skeleton()}</p>
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
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_loading_form()}</p>
          <div class='space-y-3'>
            <Skeleton variant='input' />
            <Skeleton variant='input' />
            <Skeleton variant='button' width='120px' />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_multiline_text()}</p>
          <Skeleton variant='text' count={4} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_thumbnail()}</p>
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
    title={m.gallery_demo_overlays_and_interactions()}
    subtitle='Tooltip / Popover / Dropdown'
    iconClass='icon-[tabler--message-circle]'
    tone='warning'
  >
    <DemoCard title='Tooltip / Popover / Dropdown' description={m.gallery_demo_tooltips_popovers_and_dropdown_menus()} code={codeOverlayMenus}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_tooltip_positions()}</p>
          <div class='flex flex-wrap items-center gap-4'>
            <Tooltip content={m.gallery_demo_top_tooltip()} position='top'>
              <Button variant='primary' outline>{m.gallery_demo_top()}</Button>
            </Tooltip>
            <Tooltip content={m.gallery_demo_bottom_tooltip()} position='bottom'>
              <Button variant='primary' outline>{m.gallery_demo_bottom()}</Button>
            </Tooltip>
            <Tooltip content={m.gallery_demo_left_tooltip()} position='left'>
              <Button variant='primary' outline>{m.gallery_demo_left()}</Button>
            </Tooltip>
            <Tooltip content={m.gallery_demo_right_tooltip()} position='right'>
              <Button variant='primary' outline>{m.gallery_demo_right()}</Button>
            </Tooltip>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Popover</p>
          <div class='flex flex-wrap items-center gap-4'>
            <Popover position='bottom' trigger='click'>
              {#snippet triggerContent()}
                <Button variant='secondary' outline>{m.gallery_demo_open_popover()}</Button>
              {/snippet}
              <div class='p-3 text-sm space-y-2'>
                <p class='font-medium'>{m.gallery_demo_popover_panel()}</p>
                <p class='text-base-content/70'>{m.gallery_demo_supports_custom_content_such_as_forms_and_information()}</p>
              </div>
            </Popover>
            <Popover position='right' trigger='hover'>
              {#snippet triggerContent()}
                <Button variant='info' outline>{m.gallery_demo_hover_popover()}</Button>
              {/snippet}
              <div class='p-3 text-sm'>
                <p>{m.gallery_demo_opens_on_hover()}</p>
              </div>
            </Popover>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_dropdown_menu()}</p>
          <div class='flex flex-wrap items-center gap-4'>
            <Dropdown items={dropdownItems} triggerClass='btn no-animation' onselect={(k: string) => toast.info(m.gallery_demo_selected_value({ value: k }))}>
              {m.gallery_demo_actions()}
            </Dropdown>
            <Dropdown items={dropdownItems} triggerClass='btn btn-secondary no-animation' position='right' onselect={(k: string) => toast.info(m.gallery_demo_selected_value({ value: k }))}>
              {m.gallery_demo_open_right()}
            </Dropdown>
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_form_components()}
    subtitle='Form / Combobox / TagInput / Calendar / DatePicker'
    iconClass='icon-[tabler--forms]'
    tone='success'
  >
    <DemoCard title={m.gallery_form_title()} description={m.gallery_form_description()} code={codeForm}>
      <div class='mb-5 flex flex-wrap gap-2'>
        <Button size='sm' variant={formColumns === 1 ? 'primary' : 'outline'} onclick={() => formColumns = 1} data-testid='form-columns-1'>{m.gallery_form_single()}</Button>
        <Button size='sm' variant={formColumns === 2 ? 'primary' : 'outline'} onclick={() => formColumns = 2} data-testid='form-columns-2'>{m.gallery_form_double()}</Button>
        <Button size='sm' variant={formLabelPosition === 'top' ? 'primary' : 'outline'} onclick={() => formLabelPosition = 'top'} data-testid='form-label-top'>{m.gallery_form_label_top()}</Button>
        <Button size='sm' variant={formLabelPosition === 'left' ? 'primary' : 'outline'} onclick={() => formLabelPosition = 'left'} data-testid='form-label-left'>{m.gallery_form_label_left()}</Button>
      </div>
      <Form columns={formColumns} labelPosition={formLabelPosition} labelWidth='6rem' onsubmit={() => { toast.success(m.gallery_form_saved()) }} data-testid='form-layout-demo'>
        <FormField label={m.gallery_form_name()} required data-testid='form-name-field'>
          <Input name='name' bind:value={formName} required />
        </FormField>
        <FormField label={m.iam_users_col_email()} data-testid='form-email-field'>
          <Input name='email' type='email' bind:value={formEmail} />
        </FormField>
        <FormField label={m.iam_users_col_roles()}>
          <Select name='role' options={[
            { value: 'admin', label: m.gallery_form_admin() },
            { value: 'user', label: m.gallery_form_user() },
          ]} />
        </FormField>
        <FormField label={m.gallery_form_short_notes()} colSpan={1} data-testid='form-short-notes-field'>
          <Textarea name='shortNotes' rows={2} />
        </FormField>
        <FormField label={m.gallery_form_notes()} data-testid='form-notes-field'>
          <Textarea name='notes' rows={3} />
        </FormField>
        <FormField label={m.gallery_form_full_row()} colSpan={2} data-testid='form-full-row-field'>
          <Input name='summary' />
        </FormField>
        <div class='flex gap-2'>
          <Button variant='primary' type='submit' data-testid='form-save'>{m.gallery_form_save()}</Button>
          <Button type='reset'>{m.gallery_form_reset()}</Button>
        </div>
      </Form>
    </DemoCard>

    <DemoCard title={m.gallery_demo_combobox_searchable_select_bits_ui()} description={m.gallery_demo_single_selection_multiple_selection_and_errors()} code={codeCombobox}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_single_selection_current()} {comboboxVal || m.gallery_demo_not_selected()}）</p>
          <Combobox options={comboboxOpts} bind:value={comboboxVal} placeholder={m.gallery_demo_search_frameworks()} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_radio_error_state()}</p>
          <Button size='sm' class='mb-2' data-testid='combobox-error-demo' onclick={() => showComboboxError = !showComboboxError}>{showComboboxError ? m.gallery_demo_clear_validation_feedback() : m.gallery_demo_show_validation_feedback()}</Button>
          <Combobox options={comboboxOpts} placeholder={m.gallery_demo_search_frameworks()} error={showComboboxError ? m.gallery_demo_select_a_framework_2() : undefined} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_disabled_radio()}</p>
          <Combobox options={comboboxOpts} value='svelte' disabled />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_radio_with_label()}</p>
          <Combobox options={comboboxOpts} placeholder={m.gallery_demo_search()} label={m.home_tech_stack_title()} />
        </div>
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6 mt-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_multiple_selection_selected()} {comboboxMultiVal.length} {m.gallery_demo_items()}</p>
          <Combobox options={multiOpts} bind:value={comboboxMultiVal} multiple placeholder={m.gallery_demo_search_skills()} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_multiple_selection_with_tags()}</p>
          <Combobox options={multiOpts} value={[]} multiple placeholder={m.gallery_demo_select_3()} label={m.gallery_demo_skill_tags()} />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_aligned_input_sizes()} description={m.gallery_demo_input_select_combobox_datepicker_and_taginput_share_height()} code={codeControlAlignment}>
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
            <Input data-testid='aligned-input-{controlSize}' size={controlSize} placeholder={m.gallery_demo_text()} />
            <Select data-testid='aligned-select-{controlSize}' size={controlSize} options={comboboxOpts} placeholder={m.gallery_demo_select_2()} />
            <Combobox data-testid='aligned-combobox-{controlSize}' size={controlSize} options={comboboxOpts} placeholder={m.modules_vecdb_op_search()} />
            <DatePicker data-testid='aligned-datepicker-{controlSize}' size={controlSize} />
            <TagInput data-testid='aligned-taginput-{controlSize}' size={controlSize} tags={[]} placeholder={m.gallery_demo_tags()} />
          {/each}
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_taginput()} description={m.gallery_demo_basic_maximum_count_duplicates_and_disabled()} code={codeTagInput}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_basic_usage_current()} {tagInputVal.length} {m.gallery_demo_selected()}</p>
          <TagInput bind:tags={tagInputVal} placeholder={m.gallery_demo_type_and_press_enter_to_add()} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_up_to_5_tags()}</p>
          <TagInput tags={[m.gallery_demo_tag_a(), m.gallery_demo_tag_b()]} maxTags={5} placeholder={m.gallery_demo_up_to_5()} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_allow_duplicates()}</p>
          <TagInput tags={[]} allowDuplicates placeholder={m.gallery_demo_duplicates_allowed()} />
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_crypto_disabled()}</p>
          <TagInput tags={[m.gallery_demo_read_only_a(), m.gallery_demo_read_only_b()]} disabled />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_calendar_datepicker_bits_ui()} description={m.gallery_demo_calendar_and_date_picker()} code={codeCalendar}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_standalone_calendar()}</p>
          <Calendar bind:value={calendarVal} weekStartsOn={1} />
          <p class='text-xs text-base-content/50 mt-2'>{m.gallery_demo_selected_2()} {calendarVal?.toString() ?? m.gallery_demo_none_2()}</p>
        </div>
        <div class='space-y-4'>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_date_picker()}</p>
            <DatePicker bind:value={datePickerVal} />
            <p class='text-xs text-base-content/50 mt-2'>{m.gallery_demo_selected_2()} {datePickerVal?.toString() ?? m.gallery_demo_none_2()}</p>
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_error_state()}</p>
            <Button size='sm' class='mb-2' data-testid='datepicker-error-demo' onclick={() => showDatePickerError = !showDatePickerError}>{showDatePickerError ? m.gallery_demo_clear_validation_feedback() : m.gallery_demo_show_validation_feedback()}</Button>
            <DatePicker error={showDatePickerError ? m.gallery_demo_select_a_valid_date() : undefined} />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_crypto_disabled()}</p>
            <DatePicker disabled />
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_layout_components()}
    subtitle='Card / PageHeader / FilterBar'
    iconClass='icon-[tabler--layout-grid]'
    tone='secondary'
  >
    <DemoCard title={m.gallery_filter_title()} description={m.gallery_filter_description()} code={codeFilterBar}>
      <CrudFilterBar filterFields={galleryFilterFields} searchPlaceholder={m.gallery_filter_placeholder()} bind:searchValue={galleryFilterSearch} bind:filterValues={galleryFilterValues} data-testid='gallery-collapsible-filters' />
    </DemoCard>

    <DemoCard title={m.gallery_demo_card()} description={m.gallery_demo_borders_shadows_padding_and_header_footer_slots()} code={codeCardLayout}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card title={m.gallery_demo_default_card()}>
          <p class='text-sm text-base-content/70'>{m.gallery_demo_this_is_the_default_card_style()}</p>
        </Card>
        <Card title={m.gallery_demo_with_border()} bordered>
          <p class='text-sm text-base-content/70'>{m.gallery_demo_the_bordered_property_adds_a_border()}</p>
        </Card>
        <Card title={m.gallery_demo_large_shadow()} shadow='lg'>
          <p class='text-sm text-base-content/70'>{m.gallery_demo_shadow_lg_adds_a_larger_shadow()}</p>
        </Card>
      </div>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4'>
        <Card padding='lg' bordered>
          {#snippet header()}
            <div class='flex items-center justify-between'>
              <h4 class='font-semibold'>{m.gallery_demo_custom_header()}</h4>
              <Badge variant='success'>{m.gallery_demo_online()}</Badge>
            </div>
          {/snippet}
          <p class='text-sm text-base-content/70'>{m.gallery_demo_use_the_header_and_footer_slots_to_customize()}</p>
          {#snippet footer()}
            <div class='flex justify-end gap-2'>
              <Button size='sm'>{m.action_cancel()}</Button>
              <Button size='sm' variant='primary'>{m.action_confirm()}</Button>
            </div>
          {/snippet}
        </Card>
        <Card padding='none' bordered>
          <div class='p-4'>
            <h4 class='font-semibold mb-2'>{m.gallery_demo_no_padding()}</h4>
            <p class='text-sm text-base-content/70'>{m.gallery_demo_use_padding_none_for_a_custom_layout()}</p>
          </div>
          <div class='bg-base-200 p-4'>
            <p class='text-xs text-base-content/50'>{m.gallery_demo_footer_area()}</p>
          </div>
        </Card>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_pageheader()} description={m.gallery_demo_title_description_and_actions()} code={codePageHeader}>
      <div class='space-y-4'>
        <div class='bg-base-200/50 rounded-lg p-4'>
          <PageHeader title={m.iam_users_title()} description={m.gallery_demo_manage_all_user_accounts()}>
            {#snippet actions()}
              <Button variant='primary' size='sm'>{m.gallery_demo_create_user()}</Button>
            {/snippet}
          </PageHeader>
        </div>
        <div class='bg-base-200/50 rounded-lg p-4'>
          <PageHeader title={m.gallery_demo_data_analysis()} description={m.gallery_demo_view_system_activity_and_reports()} />
        </div>
      </div>
    </DemoCard>
  </DemoSection>
  <InteractionPatterns />
</div>
