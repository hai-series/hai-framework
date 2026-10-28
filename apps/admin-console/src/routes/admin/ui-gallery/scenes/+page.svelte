<!--
  场景组件（Scenes）展示
  AI: MarkdownRenderer / AiDocumentEditor / AiTableEditor
  IAM: LoginForm / RegisterForm / ForgotPasswordForm / ResetPasswordForm /
       ChangePasswordForm / PasswordInput / UserProfile
  Storage: FileUpload / FileList / ImageUpload / AvatarUpload
  Crypto: EncryptedInput / HashDisplay / SignatureDisplay
-->
<script lang='ts'>
  import { resolve } from '$app/paths'
  import markdownEn from '$lib/components/gallery/content/markdown.en-US.md?raw'
  import markdownJa from '$lib/components/gallery/content/markdown.ja-JP.md?raw'
  import markdownZh from '$lib/components/gallery/content/markdown.zh-CN.md?raw'
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { getLocale } from '$lib/paraglide/runtime.js'
  // FileList 与 DOM 全局类型同名，必须显式导入
  import { AiDocumentEditor, AiTableEditor, ErrorPage, FileList, MarkdownRenderer, toast } from '@h-ai/ui'

  const adminUsersPath = resolve('/admin/iam/users', {})
  const adminRolesPath = resolve('/admin/iam/roles', {})
  const adminPermissionsPath = resolve('/admin/iam/permissions', {})

  // === 状态 ===
  let pwdVal = $state('')
  let encVal = $state('')
  let showPasswordError = $state(false)
  let showUnconfiguredEncryption = $state(false)

  // 错误页预设演示
  const errorPresets = ['401', '403', '404', '500', '503'] as const
  let errorStatus = $state<(typeof errorPresets)[number]>('404')

  // === Markdown 示例内容 ===
  const markdownByLocale = { 'zh-CN': markdownZh, 'en-US': markdownEn, 'ja-JP': markdownJa }
  const demoMarkdown = $derived(markdownByLocale[getLocale() as keyof typeof markdownByLocale] ?? markdownZh)

  // === 简短 AI 对话示例 ===
  const aiResponseMarkdown = $derived(`${m.gallery_demo_ai_response_intro()}\n\n${[
    '```typescript',
    'import { createServer } from \'node:http\'',
    '',
    'const server = createServer((_request, response) => {',
    '  response.writeHead(200, { \'Content-Type\': \'application/json\' })',
    '  response.end(JSON.stringify({ message: \'Hello, World!\' }))',
    '})',
    'server.listen(3000)',
    '```',
  ].join('\n')}`)

  const aiDocumentContent = [
    m.gallery_demo_order_analysis_proposal(),
    '',
    m.gallery_demo_goals(),
    '',
    m.gallery_demo_summarize_order_exceptions(),
    m.gallery_demo_suggest_actionable_next_steps(),
    '',
    '```typescript',
    'const score = order.risk * 0.7 + order.delay * 0.3',
    '```',
    '',
    m.gallery_demo_select_text_to_connect_rewriting_annotation_or_other(),
  ].join('\n')

  // === 含 Mermaid 图表的文档示例 ===
  const aiMermaidDocumentContent = [
    m.gallery_demo_order_fulfillment_workflow(),
    '',
    m.gallery_demo_workflow_overview(),
    '',
    m.gallery_demo_this_flowchart_shows_the_key_steps_from_order(),
    '',
    '```mermaid',
    'flowchart TD',
    `  ` + `A[${m.gallery_demo_place_order()}] --> B{${m.gallery_demo_check_stock()}}` + ``,
    `  ${m.gallery_demo_b_available_c_reserve_stock()}`,
    `  ${m.gallery_demo_b_insufficient_d_request_restock()}`,
    `  ${m.gallery_demo_c_e_create_fulfillment_order()}`,
    `  ${m.gallery_demo_e_f_pick_items()}`,
    `  ${m.gallery_demo_f_g_ship_order()}`,
    `  ${m.gallery_demo_g_h_confirm_receipt()}`,
    '```',
    '',
    m.gallery_demo_service_interaction_sequence(),
    '',
    m.gallery_demo_core_services_are_called_in_the_following_order(),
    '',
    '```mermaid',
    'sequenceDiagram',
    `  ${m.gallery_demo_participant_u_as_user()}`,
    `  ${m.gallery_demo_participant_o_as_order_service()}`,
    `  ${m.gallery_demo_participant_i_as_inventory_service()}`,
    `  ${m.gallery_demo_participant_p_as_payment_service()}`,
    `  ${m.gallery_demo_u_o_submit_order()}`,
    `  ${m.gallery_demo_o_i_check_and_reserve_stock()}`,
    `  ${m.gallery_demo_i_o_stock_reserved()}`,
    `  ${m.gallery_demo_o_p_start_payment()}`,
    `  ${m.gallery_demo_p_o_payment_complete()}`,
    `  ${m.gallery_demo_o_u_return_order_result()}`,
    '```',
    '',
    m.gallery_demo_mermaid_code_blocks_render_as_diagrams_in_reading(),
  ].join('\n')

  // === Mermaid 代码产物示例（code 模式，支持代码/预览切换） ===
  const aiMermaidCodeContent = [
    'stateDiagram-v2',
    `  ${m.gallery_demo_awaitingpayment()}`,
    `  ${m.gallery_demo_awaitingpayment_paid_payment_received()}`,
    `  ${m.gallery_demo_awaitingpayment_cancelled_timeout_or_cancellation()}`,
    `  ${m.gallery_demo_paid_fulfilling_warehouse_accepts()}`,
    `  ${m.gallery_demo_fulfilling_completed_confirm_receipt()}`,
    `  ${m.gallery_demo_completed_2()}`,
    `  ${m.gallery_demo_canceled_2()}`,
  ].join('\n')

  const htmlTagMarkdownDemo = [
    m.gallery_demo_html_tag_settings(),
    '',
    m.gallery_demo_by_default_raw_html_is_displayed_as_plain(),
    '',
    m.gallery_demo_b_bold_emphasis_b(),
    m.gallery_demo_i_italic_emphasis_i(),
    m.gallery_demo_u_underlined_text_u(),
    m.gallery_demo_mark_highlighted_text_mark(),
    '',
    m.gallery_demo_with_allowhtmltags_enabled_the_tags_above_are_rendered(),
  ].join('\n')

  const aiHtmlTagDocumentContent = [
    m.gallery_demo_document_display_settings(),
    '',
    m.gallery_demo_this_example_demonstrates_fontsize_and_allowhtmltags(),
    '',
    m.gallery_demo_supported_inline_html(),
    '',
    m.gallery_demo_when_enabled_b_bold_b_i_emphasis_i(),
    '',
    m.gallery_demo_unsafe_or_unsupported_tags_are_still_sanitized(),
  ].join('\n')

  // === 示例数据 ===
  const demoUser = {
    id: '1',
    username: 'zhangsan',
    email: 'zhangsan@example.com',
    nickname: m.gallery_demo_zhang_san(),
    phone: '13800138000',
    avatar: '',
    bio: m.gallery_demo_full_stack_developer_working_with_typescript_and_svelte(),
  }

  const demoFiles = [
    { id: '1', name: m.gallery_demo_design_v3_png(), size: 2048000, type: 'image/png', url: '#' },
    { id: '2', name: m.gallery_demo_requirements_pdf(), size: 512000, type: 'application/pdf', url: '#' },
    { id: '3', name: m.gallery_demo_data_report_xlsx(), size: 1024000, type: 'application/vnd.ms-excel', url: '#' },
    { id: '4', name: m.gallery_demo_meeting_notes_docx(), size: 256000, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', url: '#' },
  ]

  // === 示例源码 ===
  const codeMarkdownChat = `<MarkdownRenderer content={aiResponseMarkdown} />`

  const codeMarkdownFull = `<MarkdownRenderer content={markdown} />
<!-- 支持标题/列表/任务列表/引用/代码高亮/表格/图片等 GFM 全量语法 -->`

  const codeMarkdownPresentation = `<MarkdownRenderer
  content={htmlTagMarkdownDemo}
  fontSize='1.125rem'
  allowHtmlTags
/>`

  const codeAiDocEditor = `<AiDocumentEditor
  title='AI 生成方案文档'
  content={aiDocumentContent}
  showToolbar
  showOutline
  showCopyButton
/>`

  const codeAiDocPresentation = `<AiDocumentEditor
  title='文档展示设置'
  content={aiHtmlTagDocumentContent}
  fontSize={18}
  allowHtmlTags
  showToolbar
  showOutline={false}
/>`

  const codeAiTableEditor = `<AiTableEditor
  title='AI 销售摘要'
  editable={false}
  tableData={{ table_columns: [...], table_rows: [...] }}
/>`

  const codeMermaidDoc = `<!-- document 模式：阅读态自动把 mermaid 代码块渲染为图表 -->
<AiDocumentEditor
  title='订单履约流程设计'
  content={aiMermaidDocumentContent}
  sourceKind='document'
  showToolbar
  showOutline
/>`

  const codeMermaidCode = `<!-- code 模式：切换“代码 / 预览”查看图表渲染结果 -->
<AiDocumentEditor
  title='订单状态机'
  content={aiMermaidCodeContent}
  sourceKind='code'
  codeLanguage='mermaid'
  showCodePreviewToggle
/>`

  const codeCrud = `<!-- CRUD 场景组件已在 IAM 用户/角色/权限页真实接入，
     基于 @h-ai/kit/client 的 SvelteKit 导航适配器完成 URL 同步与刷新 -->
<a href='/admin/iam/users'>查看用户 CRUD</a>`

  const codeErrorPage = `<ErrorPage status='404' showBack showHome />
<!-- 内置 401 / 403 / 404 / 500 / 503 预设 -->`

  const codeLoginForm = `<LoginForm
  showTitle
  showForgotPassword
  showRegisterLink
  onsubmit={async (data) => { /* 登录逻辑 */ }}
/>`

  const codeRegisterForm = `<RegisterForm
  showTitle
  showLoginLink
  showPasswordStrength
  onsubmit={async (data) => { /* 注册逻辑 */ }}
/>`

  const codePasswordMgmt = `<ForgotPasswordForm showTitle showDescription showBackLink onsubmit={...} />
<ResetPasswordForm showTitle showCode showPasswordStrength onsubmit={...} />
<ChangePasswordForm requireOldPassword showPasswordStrength onsubmit={...} />`

  const codePasswordInput = `<PasswordInput bind:value showToggle showStrength placeholder='请输入密码' />
<PasswordInput placeholder='仅密码可见性切换' showToggle />
<Button onclick={() => showError = !showError}>切换校验提示</Button>
<PasswordInput value='short' error={showError ? '密码长度不足 8 位' : undefined} showToggle />`

  const codeUserProfile = `<UserProfile user={demoUser} editable onsubmit={async () => { /* 保存资料 */ }} />`

  const codeFileUpload = `<FileUpload accept='image/*,.pdf,.doc,.docx' maxFiles={5} multiple dragDrop autoUpload={false} />
<FileUpload accept='image/*' maxFiles={1} dragDrop autoUpload={false} />`

  const codeFileList = `<FileList
  files={demoFiles}
  showPreview showDownload showDelete showSize
  layout='list'
  ondownload={f => toast.info(f.name)}
  ondelete={f => toast.warning(f.name)}
/>
<FileList files={demoFiles} layout='grid' />`

  const codeImageAvatar = `<ImageUpload accept='image/*' width='180px' height='180px' />
<ImageUpload accept='image/*' width='280px' height='158px' aspectRatio='16:9' />
<AvatarUpload size='lg' fallback='张' />`

  const codeEncryptedInput = `<EncryptedInput bind:value algorithm='SM4' placeholder='输入敏感数据' />
<EncryptedInput algorithm='SM4' disabled placeholder='不可编辑的加密输入' />`

  const codeHashDisplay = `<HashDisplay value='e3b0c44298fc...' algorithm='SM3' label='文件哈希' copyable truncate />
<HashDisplay value='a1b2c3d4e5f6...' algorithm='SM3' label='SM3 摘要' copyable />`

  const codeSignatureDisplay = `<SignatureDisplay signature='MEUCIQ...' algorithm='SM2' verified={true} copyable />
<SignatureDisplay signature='MEQCIB...' algorithm='SM2' verified={false} copyable />
<SignatureDisplay signature='...' algorithm='SM2' copyable />`
</script>

<div class='space-y-10'>
  <DemoSection
    title={m.gallery_demo_ai_components()}
    subtitle='MarkdownRenderer / AiDocumentEditor / AiTableEditor'
    iconClass='icon-[tabler--sparkles]'
    tone='primary'
  >
    <DemoCard title={m.gallery_demo_markdownrenderer_ai_response()} description={m.gallery_demo_markdown_rendering_for_ai_responses()} code={codeMarkdownChat}>
      <div class='bg-base-200/30 rounded-xl p-6'>
        <div class='flex gap-3'>
          <div class='shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content text-sm font-bold'>AI</div>
          <div class='flex-1 min-w-0'>
            <MarkdownRenderer content={aiResponseMarkdown} />
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_markdownrenderer_full_example()} description={m.gallery_demo_gfm_headings_lists_tasks_quotes_code_tables_and()} code={codeMarkdownFull} open={false}>
      <MarkdownRenderer content={demoMarkdown} />
    </DemoCard>

    <DemoCard title={m.gallery_demo_markdownrenderer_text_size_and_html_tags()} description={m.gallery_demo_use_fontsize_to_change_text_size_and_allowhtmltags()} code={codeMarkdownPresentation}>
      <div class='grid grid-cols-1 xl:grid-cols-2 gap-4'>
        <div class='rounded-xl border border-base-300 bg-base-200/30 p-4' data-testid='markdown-html-off-demo'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>{m.gallery_demo_default_safe_mode_fontsize_14_allowhtmltags_false()}</p>
          <MarkdownRenderer content={htmlTagMarkdownDemo} fontSize={14} />
        </div>
        <div class='rounded-xl border border-base-300 bg-base-200/30 p-4' data-testid='markdown-html-on-demo'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>{m.gallery_demo_html_enabled_fontsize_18_allowhtmltags_true()}</p>
          <MarkdownRenderer content={htmlTagMarkdownDemo} fontSize={18} allowHtmlTags />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='AiDocumentEditor' description={m.gallery_demo_ai_document_preview_contents_code_blocks_and_download()} code={codeAiDocEditor}>
      <div class='h-104 min-h-0'>
        <AiDocumentEditor
          title={m.gallery_demo_ai_generated_proposal()}
          content={aiDocumentContent}
          showToolbar
          showOutline
          showCopyButton
          class='h-full'
        />
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_aidocumenteditor_text_size_and_html_tags()} description={m.gallery_demo_document_mode_also_supports_fontsize_and_allowhtmltags_for()} code={codeAiDocPresentation}>
      <div class='grid grid-cols-1 xl:grid-cols-2 gap-4'>
        <div class='h-104 min-h-0' data-testid='ai-document-html-off-demo'>
          <AiDocumentEditor
            title={m.gallery_demo_default_safe_mode()}
            content={aiHtmlTagDocumentContent}
            fontSize={14}
            showToolbar
            showOutline={false}
            showCopyButton
            class='h-full'
          />
        </div>
        <div class='h-104 min-h-0' data-testid='ai-document-html-on-demo'>
          <AiDocumentEditor
            title={m.gallery_demo_enable_safe_html_tags()}
            content={aiHtmlTagDocumentContent}
            fontSize={18}
            allowHtmlTags
            showToolbar
            showOutline={false}
            showCopyButton
            class='h-full'
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='AiTableEditor' description={m.gallery_demo_ai_table_preview_cell_editing_copy_and_csv()} code={codeAiTableEditor}>
      <div class='h-104 min-h-0'>
        <AiTableEditor
          title={m.gallery_demo_ai_sales_summary()}
          statusText={m.gallery_demo_sample_data()}
          metaText='table/v1'
          saveState={m.gallery_demo_read_only_preview()}
          editable={false}
          tableData={{
            table_columns: [
              { key: 'metric', label: m.gallery_demo_metric(), type: 'text' },
              { key: 'value', label: m.gallery_demo_value(), type: 'number' },
              { key: 'trend', label: m.gallery_demo_trends(), type: 'tag' },
            ],
            table_rows: [
              { row_id: 'r1', metric: m.gallery_demo_new_customers(), value: 128, trend: m.gallery_demo_increase() },
              { row_id: 'r2', metric: m.gallery_demo_completed_orders(), value: 42, trend: m.gallery_demo_stable() },
              { row_id: 'r3', metric: m.gallery_demo_refund_rate(), value: 1.8, trend: m.gallery_demo_decrease() },
            ],
          }}
        />
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_aidocumenteditor_mermaid_document()} description={m.gallery_demo_mermaid_code_blocks_render_as_diagrams_in_reading_2()} code={codeMermaidDoc}>
      <div class='h-104 min-h-0' data-testid='mermaid-document-demo'>
        <AiDocumentEditor
          title={m.gallery_demo_order_fulfillment_workflow_2()}
          content={aiMermaidDocumentContent}
          sourceKind='document'
          showToolbar
          showOutline
          showCopyButton
          class='h-full'
        />
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_aidocumenteditor_mermaid_code()} description={m.gallery_demo_switch_between_code_and_preview_to_inspect_the()} code={codeMermaidCode}>
      <div class='h-104 min-h-0' data-testid='mermaid-code-demo'>
        <AiDocumentEditor
          title={m.gallery_demo_order_state_transitions()}
          content={aiMermaidCodeContent}
          sourceKind='code'
          codeLanguage='mermaid'
          showCodePreviewToggle
          showCopyButton
          showOutline={false}
          codePreviewHint={m.gallery_demo_switch_to_another_chart()}
          class='h-full'
        />
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_crud_pages()}
    subtitle='CrudPage / CrudFilterBar / CrudEditPanel / CrudDetailPanel / CrudDeleteConfirm'
    iconClass='icon-[tabler--list-details]'
    tone='info'
  >
    <DemoCard title={m.gallery_demo_crud_components()} description={m.gallery_demo_used_in_the_iam_user_role_and_permission()} code={codeCrud}>
      <div class='grid grid-cols-1 lg:grid-cols-3 gap-4'>
        <Alert variant='info' class='lg:col-span-2'>
          {m.gallery_demo_iam_user_role_and_permission_pages_use_these()}
        </Alert>
        <div class='flex flex-col gap-2'>
          <a class='btn btn-primary no-animation font-medium' href={adminUsersPath}>{m.gallery_demo_view_user_management()}</a>
          <a class='btn btn-secondary btn-outline no-animation font-medium' href={adminRolesPath}>{m.gallery_demo_view_role_management()}</a>
          <a class='btn btn-info btn-outline no-animation font-medium' href={adminPermissionsPath}>{m.gallery_demo_view_permission_management()}</a>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_error_page()}
    subtitle={m.gallery_demo_errorpage_401_403_404_500_503_presets()}
    iconClass='icon-[tabler--alert-triangle]'
    tone='error'
  >
    <DemoCard title='ErrorPage' description={m.gallery_demo_select_a_status_code_to_preview_its_error()} code={codeErrorPage}>
      <div class='flex flex-wrap gap-2 border-b border-base-content/8 pb-4 mb-4'>
        {#each errorPresets as preset (preset)}
          <button
            type='button'
            class='btn btn-sm no-animation {errorStatus === preset ? 'btn-primary' : 'btn-ghost'}'
            onclick={() => (errorStatus = preset)}
          >
            {preset}
          </button>
        {/each}
      </div>
      <div class='bg-base-200/30 rounded-xl overflow-hidden'>
        <ErrorPage status={errorStatus} showBack={false} showHome={false} />
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_iam_authentication()}
    subtitle={m.gallery_demo_loginform_registerform_password_management_passwordinput_userprofile()}
    iconClass='icon-[tabler--shield-lock]'
    tone='primary'
  >
    <DemoCard title='LoginForm' description={m.gallery_demo_login_form()} code={codeLoginForm}>
      <div class='flex justify-center'>
        <div class='w-full max-w-sm'>
          <LoginForm
            showTitle
            showForgotPassword
            showRegisterLink
            onsubmit={async (data) => { toast.success(m.gallery_demo_login_value({ value: data.username })) }}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='RegisterForm' description={m.gallery_demo_registration_form()} code={codeRegisterForm}>
      <div class='flex justify-center'>
        <div class='w-full max-w-sm'>
          <RegisterForm
            showTitle
            showLoginLink
            showPasswordStrength
            onsubmit={async (data) => { toast.success(m.gallery_demo_register_value({ value: data.username ?? data.email ?? '' })) }}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_password_management()} description='ForgotPasswordForm / ResetPasswordForm / ChangePasswordForm' code={codePasswordMgmt}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-6'>
        <div class='p-4 rounded-xl bg-base-200/50 border border-base-300'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>ForgotPasswordForm</p>
          <ForgotPasswordForm
            showTitle
            showDescription
            showBackLink
            onsubmit={async () => { toast.info(m.gallery_demo_reset_email_sent()) }}
          />
        </div>
        <div class='p-4 rounded-xl bg-base-200/50 border border-base-300'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>ResetPasswordForm</p>
          <ResetPasswordForm
            showTitle
            showDescription
            showCode
            showPasswordStrength
            onsubmit={async () => { toast.success(m.gallery_demo_password_reset()) }}
          />
        </div>
        <div class='p-4 rounded-xl bg-base-200/50 border border-base-300'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>ChangePasswordForm</p>
          <ChangePasswordForm
            requireOldPassword
            showPasswordStrength
            onsubmit={async () => { toast.success(m.gallery_demo_password_changed()) }}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='PasswordInput' description={m.gallery_demo_password_input_component()} code={codePasswordInput}>
      <div class='space-y-5'>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_demo_with_strength_indicator()}</p>
          <PasswordInput bind:value={pwdVal} showToggle showStrength placeholder={m.gallery_demo_enter_a_password()} />
          <p class='text-xs text-base-content/40 mt-2'>{m.gallery_demo_entered()} {pwdVal.length} {m.gallery_demo_characters_2()}</p>
        </div>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_demo_basic_mode()}</p>
          <PasswordInput placeholder={m.gallery_demo_password_visibility_toggle_only()} showToggle />
        </div>
        <div class='grid grid-cols-2 gap-3'>
          <div class='p-4 rounded-lg bg-base-200/30'>
            <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_crypto_disabled()}</p>
            <PasswordInput value='disabled' disabled />
          </div>
          <div class='p-4 rounded-lg bg-base-200/30'>
            <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_demo_error_state()}</p>
            <Button size='sm' class='mb-2' data-testid='password-error-demo' onclick={() => showPasswordError = !showPasswordError}>{showPasswordError ? m.gallery_demo_clear_validation_feedback() : m.gallery_demo_show_validation_feedback()}</Button>
            <PasswordInput value='short' error={showPasswordError ? m.gallery_demo_use_at_least_8_characters_for_the_password() : undefined} showToggle />
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title='UserProfile' description={m.gallery_demo_edit_user_profile()} code={codeUserProfile}>
      <UserProfile
        user={demoUser}
        editable
        onsubmit={async () => { toast.success(m.gallery_demo_profile_updated()) }}
      />
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_storage_files()}
    subtitle='FileUpload / FileList / ImageUpload / AvatarUpload'
    iconClass='icon-[tabler--folder]'
    tone='success'
  >
    <DemoCard title='FileUpload' description={m.gallery_demo_multiple_file_drop_zone_single_file_upload()} code={codeFileUpload}>
      <div class='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <div>
          <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_demo_drag_and_drop_multiple_files()}</p>
          <FileUpload
            accept='image/*,.pdf,.doc,.docx'
            maxFiles={5}
            multiple
            dragDrop
            autoUpload={false}
          />
        </div>
        <div>
          <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_demo_single_file_upload()}</p>
          <FileUpload
            accept='image/*'
            maxFiles={1}
            dragDrop
            autoUpload={false}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='FileList' description={m.gallery_demo_file_display_and_actions_list_grid_and_loading()} code={codeFileList}>
      <div class='space-y-6'>
        <div>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>{m.gallery_demo_list_layout()}</p>
          <FileList
            files={demoFiles}
            showPreview
            showDownload
            showDelete
            showSize
            layout='list'
            ondownload={f => toast.info(m.gallery_demo_download_value({ value: f.name }))}
            ondelete={f => toast.warning(m.gallery_demo_delete_value({ value: f.name }))}
          />
        </div>
        <div class='divider my-2'></div>
        <div>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>{m.gallery_demo_grid_layout()}</p>
          <FileList
            files={demoFiles.slice(0, 3)}
            showPreview
            showDownload
            showDelete
            layout='grid'
            ondownload={f => toast.info(m.gallery_demo_download_value({ value: f.name }))}
            ondelete={f => toast.warning(m.gallery_demo_delete_value({ value: f.name }))}
          />
        </div>
        <div class='divider my-2'></div>
        <div>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>{m.gallery_demo_loading_state()}</p>
          <FileList files={[]} loading layout='list' />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='ImageUpload / AvatarUpload' description={m.gallery_demo_image_and_avatar_upload()} code={codeImageAvatar}>
      <div class='grid grid-cols-2 lg:grid-cols-4 gap-6'>
        <div class='flex flex-col items-center gap-3'>
          <ImageUpload accept='image/*' width='180px' height='180px' />
          <p class='text-xs text-base-content/50'>{m.gallery_demo_square_image()}</p>
        </div>
        <div class='flex flex-col items-center gap-3'>
          <ImageUpload accept='image/*' width='280px' height='158px' aspectRatio='16:9' />
          <p class='text-xs text-base-content/50'>{m.gallery_demo_16_9_aspect_ratio()}</p>
        </div>
        <div class='flex flex-col items-center gap-3'>
          <AvatarUpload size='lg' fallback={m.gallery_demo_z()} />
          <p class='text-xs text-base-content/50'>{m.gallery_demo_avatar_large()}</p>
        </div>
        <div class='flex flex-col items-center gap-3'>
          <AvatarUpload size='md' fallback={m.gallery_demo_l()} />
          <p class='text-xs text-base-content/50'>{m.gallery_demo_avatar_medium()}</p>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_crypto_section()}
    subtitle='EncryptedInput / HashDisplay / SignatureDisplay'
    iconClass='icon-[tabler--lock]'
    tone='error'
  >
    <DemoCard title='EncryptedInput' description={m.gallery_crypto_input()} code={codeEncryptedInput}>
      <Button data-testid='encryption-unconfigured-demo' onclick={() => showUnconfiguredEncryption = !showUnconfiguredEncryption}>{m.gallery_demo_show_unconfigured_encryption()}</Button>
      {#if showUnconfiguredEncryption}
        <div class='space-y-4 mt-4'>
          <div class='p-4 rounded-lg bg-base-200/30'>
            <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_crypto_sm4()}</p>
            <EncryptedInput bind:value={encVal} algorithm='SM4' placeholder={m.gallery_crypto_sensitive()} />
          </div>
          <div class='p-4 rounded-lg bg-base-200/30'>
            <p class='text-xs font-medium text-base-content/50 mb-2'>{m.gallery_crypto_disabled()}</p>
            <EncryptedInput placeholder={m.gallery_crypto_readonly()} algorithm='SM4' disabled />
          </div>
        </div>
      {/if}
    </DemoCard>

    <DemoCard title='HashDisplay' description={m.gallery_crypto_hash()} code={codeHashDisplay}>
      <div class='space-y-4'>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <HashDisplay value='e3b0c44298fc1c149afbf4c8996fb924' algorithm='SM3' label={m.gallery_crypto_file()} copyable truncate />
        </div>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <HashDisplay value='a1b2c3d4e5f60718293a4b5c6d7e8f90' algorithm='SM3' label={m.gallery_crypto_digest()} copyable />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='SignatureDisplay' description={m.gallery_crypto_signature()} code={codeSignatureDisplay}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <div class='p-4 rounded-xl border-2 border-success/20 bg-success/5'>
          <p class='text-xs font-semibold text-success mb-3'>{m.gallery_crypto_valid()}</p>
          <SignatureDisplay
            signature='MEUCIQDf4b2e8c7a3f1d5e9b0a2c4d6f8e0a1b3c5d7f9e1a3b5c7d9f1a3=='
            algorithm='SM2'
            verified={true}
            copyable
          />
        </div>
        <div class='p-4 rounded-xl border-2 border-error/20 bg-error/5'>
          <p class='text-xs font-semibold text-error mb-3'>{m.gallery_crypto_invalid()}</p>
          <SignatureDisplay
            signature='MEQCIB2d4f6a8c0e2a4b6c8d0f2a4b6c8d0e2a4b6c8d0f2a4b6c8d0e=='
            algorithm='SM2'
            verified={false}
            copyable
          />
        </div>
        <div class='p-4 rounded-xl border-2 border-base-300 bg-base-200/30'>
          <p class='text-xs font-semibold text-base-content/50 mb-3'>{m.gallery_crypto_unchecked()}</p>
          <SignatureDisplay
            signature={m.gallery_crypto_sample()}
            algorithm='SM2'
            copyable
          />
        </div>
      </div>
    </DemoCard>
  </DemoSection>
</div>
