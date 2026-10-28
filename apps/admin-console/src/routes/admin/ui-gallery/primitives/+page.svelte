<!--
  原子组件（Primitives）展示 - 基础 UI 单元
  Button / IconButton / BareButton / Input / BareInput / Textarea /
  Select / Checkbox / Switch / Radio / Range / Rating /
  Badge / Avatar / Tag / Spinner / Progress / Toggle 系列

  采用分类（DemoSection）+ 可折叠示例卡片（DemoCard，含效果与可复制源码）。
-->
<script lang='ts'>
  // Range 与 DOM 全局类型同名，必须显式导入
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { Range, toast } from '@h-ai/ui'

  // === 表单状态 ===
  let inputVal = $state('')
  let showInputError = $state(false)
  let showSelectError = $state(false)
  let textareaVal = $state('')
  let selectVal = $state('')
  let selectClearVal = $state('')
  let selectFilterVal = $state('')
  let selectBothVal = $state('')
  let checkboxVal = $state(false)
  const checkboxIndeterminate = $state(true)
  let switchVal = $state(true)
  let radioVal = $state('svelte')
  let radioHorizontal = $state('vue')
  let rangeVal = $state(50)
  let ratingVal = $state(3)
  let ratingHalf = $state(2.5)
  let toggleCheck = $state(false)
  let toggleInput = $state(false)
  let toggleRadio = $state(false)

  const selectOpts = [
    { value: 'svelte', label: 'Svelte' },
    { value: 'vue', label: 'Vue' },
    { value: 'react', label: 'React' },
    { value: 'angular', label: 'Angular' },
  ]

  // === 示例源码 ===
  const codeButton = `<Button variant='primary'>primary</Button>
<Button variant='secondary'>secondary</Button>
<Button variant='success'>success</Button>
<Button variant='ghost'>ghost</Button>

<!-- 轮廓 / 尺寸 / 状态 -->
<Button variant='primary' outline>outline</Button>
<Button variant='primary' size='lg'>lg</Button>
<Button variant='primary' loading>加载中</Button>
<Button variant='primary' disabled>禁用</Button>`

  const codeBareIconButton = `<BareButton onclick={() => toast.info('裸按钮点击')}>
  <span class='text-primary underline'>可点击文字</span>
</BareButton>

<IconButton variant='primary' tooltip='设置' label='设置' onclick={...}>
  {#snippet icon()}<svg ... /> {/snippet}
</IconButton>`

  const codeInput = `<Input bind:value placeholder='请输入内容' />
<BareInput placeholder='无边框、无样式' />
<Button onclick={() => showError = !showError}>切换校验提示</Button>
<Input value='无效内容' error={showError ? '请输入有效内容' : undefined} />
<Input value='不可编辑' disabled />
<Input type='password' placeholder='输入密码' />

<Textarea bind:value placeholder='多行内容' rows={3} />
<Textarea placeholder='自动高度' rows={2} autoResize />`

  const codeFormControls = `<Select bind:value options={selectOpts} placeholder='请选择框架' />

<Checkbox bind:checked label='同意用户协议' />
<Checkbox checked indeterminate label='半选状态' />

<Switch bind:checked label='启用通知' />

<Radio value={radioVal} options={selectOpts} direction='vertical' onchange={...} />`

  const codeSelectSize = `<Select options={selectOpts} placeholder='超小' size='xs' />
<Select options={selectOpts} placeholder='小号' size='sm' />
<Select options={selectOpts} placeholder='大号' size='lg' />
<Button onclick={() => showError = !showError}>切换校验提示</Button>
<Select options={selectOpts} placeholder='请选择' error={showError ? '请选择一项' : undefined} />`

  const codeSelectClearFilter = `<Select bind:value options={selectOpts} placeholder='可清空' clearable />
<Select bind:value options={selectOpts} placeholder='可筛选' filterable />
<Select bind:value options={selectOpts} placeholder='可清空+可筛选' clearable filterable />`

  const codeSelectLayout = `<!-- 紧凑筛选行：Select 与 Input 尺寸对齐、可随容器收缩、下拉不被相邻控件遮挡 -->
<div class='flex items-center gap-3'>
  <Input size='sm' placeholder='搜索' class='w-40' />
  <Select size='sm' options={selectOpts} placeholder='框架' />
  <Select size='sm' options={selectOpts} placeholder='状态' />
  <Select size='sm' options={selectOpts} placeholder='来源' />
</div>`

  const codeToggle = `<ToggleCheckbox bind:checked={toggleCheck} />
<ToggleInput bind:checked={toggleInput} />
<ToggleRadio bind:checked={toggleRadio} />

<ToggleCheckbox checked disabled />`

  const codeRangeRating = `<Range bind:value min={0} max={100} step={10} variant='primary' />
<Range value={30} step={25} variant='secondary' showSteps />

<Rating bind:value max={5} size='lg' clearable />
<Rating bind:value max={5} size='lg' half clearable />
<Rating value={4} max={5} readonly />`

  const codeBadgeAvatarTag = `<Badge variant='primary'>primary</Badge>
<Badge variant='primary' outline size='sm'>sm 轮廓</Badge>

<Avatar name='张三' size='md' />
<Avatar name='方形' size='lg' shape='square' />

<Tag variant='success'>成功</Tag>
<Tag closable onclose={() => toast.info('标签关闭')}>可关闭</Tag>`

  const codeSpinnerProgress = `<Spinner size='md' variant='primary' />

<Progress value={50} max={100} variant='info' size='md' showLabel />
<Progress value={60} variant='primary' striped showLabel />
<Progress value={45} variant='secondary' striped animated showLabel />`
</script>

<div class='space-y-10'>
  <DemoSection
    title={m.gallery_demo_buttons_and_actions()}
    subtitle='Button / BareButton / IconButton'
    iconClass='icon-[tabler--click]'
    tone='primary'
  >
    <DemoCard title={m.gallery_demo_button()} description={m.gallery_demo_variants_outlines_sizes_and_states()} code={codeButton}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_variants()}</p>
          <div class='flex flex-wrap items-center gap-3'>
            <Button variant='primary' onclick={() => toast.success('primary')}>primary</Button>
            <Button variant='secondary'>secondary</Button>
            <Button variant='info'>info</Button>
            <Button variant='success'>success</Button>
            <Button variant='warning'>warning</Button>
            <Button variant='error'>error</Button>
            <Button variant='ghost'>ghost</Button>
            <Button variant='link'>link</Button>
            <Button>default</Button>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_outline_style_outline()}</p>
          <div class='flex flex-wrap items-center gap-3'>
            <Button variant='primary' outline>primary</Button>
            <Button variant='secondary' outline>secondary</Button>
            <Button variant='success' outline>success</Button>
            <Button variant='warning' outline>warning</Button>
            <Button variant='error' outline>error</Button>
            <Button variant='info' outline>info</Button>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_size_options()}</p>
          <div class='flex flex-wrap items-end gap-3'>
            <Button variant='primary' size='xs'>{m.gallery_demo_xs_extra_small()}</Button>
            <Button variant='primary' size='sm'>{m.gallery_demo_sm_small()}</Button>
            <Button variant='primary' size='md'>{m.gallery_demo_md_medium_default()}</Button>
            <Button variant='primary' size='lg'>{m.gallery_demo_lg_large()}</Button>
            <Button variant='primary' size='xl'>{m.gallery_demo_xl_extra_large()}</Button>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_additional_states()}</p>
          <div class='flex flex-wrap items-center gap-3'>
            <Button variant='primary' loading>{m.gallery_demo_loading()}</Button>
            <Button variant='primary' disabled>{m.gallery_demo_disabled()}</Button>
            <Button variant='primary' circle>⚙</Button>
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title='BareButton / IconButton' description={m.gallery_demo_unstyled_and_icon_buttons()} code={codeBareIconButton}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_barebutton_unstyled()}</p>
          <div class='flex items-center gap-4'>
            <BareButton onclick={() => toast.info(m.gallery_demo_bare_button_clicked())}>
              <span class='text-primary underline cursor-pointer'>{m.gallery_demo_clickable_text()}</span>
            </BareButton>
            <BareButton disabled>
              <span class='text-base-content/30 cursor-not-allowed'>{m.gallery_crypto_disabled()}</span>
            </BareButton>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_iconbutton_variants()}</p>
          <div class='flex items-center gap-4'>
            <IconButton variant='primary' tooltip={m.gallery_demo_settings()} label={m.gallery_demo_settings()} onclick={() => toast.info(m.gallery_demo_settings())}>
              {#snippet icon()}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
                  <circle cx='12' cy='12' r='3' />
                  <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
                </svg>
              {/snippet}
            </IconButton>
            <IconButton variant='error' tooltip={m.modules_vecdb_op_delete()} label={m.modules_vecdb_op_delete()}>
              {#snippet icon()}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
                  <polyline points='3 6 5 6 21 6' />
                  <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
                </svg>
              {/snippet}
            </IconButton>
            <IconButton variant='info' tooltip={m.audit_info()} label={m.audit_info()}>
              {#snippet icon()}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
                  <circle cx='12' cy='12' r='10' />
                  <line x1='12' y1='16' x2='12' y2='12' />
                  <line x1='12' y1='8' x2='12.01' y2='8' />
                </svg>
              {/snippet}
            </IconButton>
            <IconButton disabled tooltip={m.gallery_demo_disabled()} label={m.gallery_demo_disabled()}>
              {#snippet icon()}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='10' /><line x1='4.93' y1='4.93' x2='19.07' y2='19.07' /></svg>
              {/snippet}
            </IconButton>
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_input_controls()}
    subtitle='Input / BareInput / Textarea / Select / Checkbox / Switch / Radio'
    iconClass='icon-[tabler--forms]'
    tone='info'
  >
    <DemoCard title='Input / BareInput / Textarea' description={m.gallery_demo_input_bare_input_and_text_area()} code={codeInput}>
      <div class='space-y-4'>
        <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-std'>{m.gallery_demo_standard_input()}</label>
            <Input id='g-input-std' bind:value={inputVal} placeholder={m.gallery_demo_enter_text()} />
            <p class='text-xs text-base-content/50 mt-1'>{m.gallery_demo_current_value()} {inputVal || m.gallery_demo_empty()}</p>
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-bare'>{m.gallery_demo_bare_input_bareinput()}</label>
            <BareInput id='g-input-bare' placeholder={m.gallery_demo_no_border_or_styling()} />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-err'>{m.gallery_demo_error_state()}</label>
            <Button size='sm' class='mb-2' data-testid='input-error-demo' onclick={() => showInputError = !showInputError}>{showInputError ? m.gallery_demo_clear_validation_feedback() : m.gallery_demo_show_validation_feedback()}</Button>
            <Input id='g-input-err' value={m.gallery_demo_invalid_content()} error={showInputError ? m.gallery_demo_enter_a_valid_value() : undefined} />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-dis'>{m.gallery_crypto_disabled()}</label>
            <Input id='g-input-dis' value={m.gallery_demo_read_only()} disabled />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-ro'>{m.gallery_demo_read_only_state()}</label>
            <Input id='g-input-ro' value={m.gallery_demo_read_only_content()} readonly />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-pwd'>{m.gallery_demo_password_input()}</label>
            <Input id='g-input-pwd' type='password' placeholder={m.gallery_demo_enter_password()} />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_size_options()}</p>
          <div class='flex flex-wrap items-end gap-3'>
            <Input size='xs' placeholder='xs' />
            <Input size='sm' placeholder='sm' />
            <Input size='md' placeholder={m.gallery_demo_md_default()} />
            <Input size='lg' placeholder='lg' />
          </div>
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-textarea'>{m.gallery_demo_multiline_text_textarea()}</label>
          <Textarea id='g-textarea' bind:value={textareaVal} placeholder={m.gallery_demo_enter_multiline_text()} rows={3} />
          <p class='text-xs text-base-content/50 mt-1'>{m.gallery_demo_entered()} {textareaVal.length} {m.gallery_demo_characters()}</p>
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-textarea-auto'>{m.gallery_demo_automatic_height_autoresize()}</label>
          <Textarea id='g-textarea-auto' placeholder={m.gallery_demo_height_adjusts_as_you_type()} rows={2} autoResize />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Select / Checkbox / Switch / Radio' description={m.gallery_demo_select_checkbox_switch_and_radio()} code={codeFormControls}>
      <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel'>{m.gallery_demo_select()}</label>
          <Select id='g-sel' bind:value={selectVal} options={selectOpts} placeholder={m.gallery_demo_select_a_framework()} />
          <p class='text-xs text-base-content/50 mt-1'>{m.gallery_demo_selected_2()} {selectVal || m.gallery_demo_none()}</p>
        </div>
        <fieldset>
          <legend class='text-sm font-medium mb-3'>{m.gallery_demo_checkbox()}</legend>
          <div class='space-y-2'>
            <Checkbox bind:checked={checkboxVal} label={m.gallery_demo_accept_the_user_agreement()} />
            <Checkbox checked={checkboxIndeterminate} indeterminate label={m.gallery_demo_indeterminate_state()} />
            <Checkbox disabled label={m.gallery_demo_disabled()} />
            <Checkbox checked disabled label={m.gallery_demo_disabled_selected()} />
          </div>
        </fieldset>
        <fieldset>
          <legend class='text-sm font-medium mb-3'>{m.gallery_demo_switch()}</legend>
          <div class='space-y-2'>
            <Switch bind:checked={switchVal} label={m.gallery_demo_enable_notifications()} />
            <Switch checked={false} disabled label={m.gallery_demo_disabled()} />
            <Switch checked disabled label={m.gallery_demo_disabled_on()} />
          </div>
          <p class='text-xs text-base-content/50 mt-2'>{m.gallery_demo_notifications_2()} {switchVal ? m.gallery_demo_on() : m.gallery_demo_off()}</p>
        </fieldset>
        <fieldset>
          <legend class='text-sm font-medium mb-3'>{m.gallery_demo_radio_buttons()}</legend>
          <Radio value={radioVal} options={selectOpts} direction='vertical' onchange={(v: string) => radioVal = v} />
          <p class='text-xs text-base-content/50 mt-2'>{m.gallery_demo_selected_2()} {radioVal}</p>
        </fieldset>
      </div>
      <div class='mt-6'>
        <p class='text-sm font-medium mb-3'>{m.gallery_demo_horizontal_radio_group()}</p>
        <Radio value={radioHorizontal} options={selectOpts} direction='horizontal' onchange={(v: string) => radioHorizontal = v} />
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_select_sizes_and_states()} description={m.gallery_demo_xs_sm_lg_and_error_states()} code={codeSelectSize}>
      <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-xs'>xs</label>
          <Select id='g-sel-xs' options={selectOpts} placeholder={m.gallery_demo_extra_small()} size='xs' />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-sm'>sm</label>
          <Select id='g-sel-sm' options={selectOpts} placeholder={m.gallery_demo_small()} size='sm' />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-lg'>lg</label>
          <Select id='g-sel-lg' options={selectOpts} placeholder={m.gallery_demo_large()} size='lg' />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-err'>{m.gallery_demo_error_state()}</label>
          <Button size='sm' class='mb-2' data-testid='select-error-demo' onclick={() => showSelectError = !showSelectError}>{showSelectError ? m.gallery_demo_clear_validation_feedback() : m.gallery_demo_show_validation_feedback()}</Button>
          <Select id='g-sel-err' options={selectOpts} placeholder={m.gallery_demo_select_an_option()} error={showSelectError ? m.gallery_demo_select_an_option_2() : undefined} />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Select clearable & filterable' description={m.gallery_demo_clearable_and_searchable_select()} code={codeSelectClearFilter}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-clear'>clearable</label>
          <Select id='g-sel-clear' bind:value={selectClearVal} options={selectOpts} placeholder={m.gallery_demo_clearable()} clearable />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-filter'>filterable</label>
          <Select id='g-sel-filter' bind:value={selectFilterVal} options={selectOpts} placeholder={m.gallery_demo_searchable()} filterable />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-both'>clearable + filterable</label>
          <Select id='g-sel-both' bind:value={selectBothVal} options={selectOpts} placeholder={m.gallery_demo_clearable_and_searchable()} clearable filterable />
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_select_layout_and_alignment()} description={m.gallery_demo_compact_filters_match_input_sizes_shrink_with_the()} code={codeSelectLayout}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_aligned_with_input_size_sm()}</p>
          <div class='flex items-center gap-3'>
            <Input size='sm' placeholder={m.modules_vecdb_op_search()} class='w-40' />
            <Select size='sm' options={selectOpts} placeholder={m.gallery_demo_framework()} />
            <Select size='sm' options={selectOpts} placeholder={m.iam_users_form_status()} />
            <Select size='sm' options={selectOpts} placeholder={m.gallery_demo_source()} />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_dropdowns_stay_above_nearby_controls_open_the_first()}</p>
          <div class='flex items-center gap-3'>
            <Select options={selectOpts} placeholder={m.gallery_demo_first()} />
            <Select options={selectOpts} placeholder={m.gallery_demo_second()} />
            <Select options={selectOpts} placeholder={m.gallery_demo_third()} />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_sizes_match_input_heights_xs_sm_md_lg()}</p>
          <div class='space-y-2'>
            <div class='flex items-center gap-3'>
              <Input size='xs' placeholder='xs' class='w-40' />
              <Select size='xs' options={selectOpts} placeholder='xs' />
            </div>
            <div class='flex items-center gap-3'>
              <Input size='sm' placeholder='sm' class='w-40' />
              <Select size='sm' options={selectOpts} placeholder='sm' />
            </div>
            <div class='flex items-center gap-3'>
              <Input size='md' placeholder='md' class='w-40' />
              <Select size='md' options={selectOpts} placeholder='md' />
            </div>
            <div class='flex items-center gap-3'>
              <Input size='lg' placeholder='lg' class='w-40' />
              <Select size='lg' options={selectOpts} placeholder='lg' />
            </div>
            <div class='flex items-center gap-3'>
              <Input size='xl' placeholder='xl' class='w-40' />
              <Select size='xl' options={selectOpts} placeholder='xl' />
            </div>
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_toggle_controls()} description='ToggleCheckbox / ToggleInput / ToggleRadio' code={codeToggle}>
      <div class='space-y-4'>
        <div class='flex flex-wrap items-center gap-8'>
          <label class='flex items-center gap-2 cursor-pointer'>
            <ToggleCheckbox bind:checked={toggleCheck} />
            <span class='text-sm'>ToggleCheckbox: {toggleCheck ? m.gallery_demo_on() : m.gallery_demo_off()}</span>
          </label>
          <label class='flex items-center gap-2 cursor-pointer'>
            <ToggleInput bind:checked={toggleInput} />
            <span class='text-sm'>ToggleInput: {toggleInput ? m.gallery_demo_on() : m.gallery_demo_off()}</span>
          </label>
          <label class='flex items-center gap-2 cursor-pointer'>
            <ToggleRadio bind:checked={toggleRadio} />
            <span class='text-sm'>ToggleRadio: {toggleRadio ? m.gallery_demo_on() : m.gallery_demo_off()}</span>
          </label>
        </div>
        <div class='flex flex-wrap items-center gap-8'>
          <label class='flex items-center gap-2 cursor-not-allowed'>
            <ToggleCheckbox checked disabled />
            <span class='text-sm opacity-50'>{m.gallery_demo_disabled_on()}</span>
          </label>
          <label class='flex items-center gap-2 cursor-not-allowed'>
            <ToggleInput disabled />
            <span class='text-sm opacity-50'>{m.gallery_demo_disabled_off()}</span>
          </label>
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_range_rating()} description={m.gallery_demo_slider_and_rating()} code={codeRangeRating}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div class='space-y-4'>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_basic_slider()} {rangeVal}</p>
            <Range bind:value={rangeVal} min={0} max={100} step={10} variant='primary' />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_with_step_markers()}</p>
            <Range value={30} min={0} max={100} step={25} variant='secondary' showSteps />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_variants_2()}</p>
            <div class='space-y-2'>
              <Range value={60} variant='success' />
              <Range value={40} variant='warning' />
              <Range value={80} variant='error' />
              <Range value={50} variant='info' />
            </div>
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_size()}</p>
            <div class='space-y-2'>
              <Range value={50} size='xs' variant='primary' />
              <Range value={50} size='sm' variant='primary' />
              <Range value={50} size='md' variant='primary' />
              <Range value={50} size='lg' variant='primary' />
            </div>
          </div>
        </div>
        <div class='space-y-4'>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_whole_star_rating()} {ratingVal} / 5</p>
            <Rating bind:value={ratingVal} max={5} size='lg' clearable />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_half_star_rating()} {ratingHalf} / 5</p>
            <Rating bind:value={ratingHalf} max={5} size='lg' half clearable />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_read_only_2()}</p>
            <Rating value={4} max={5} readonly />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_disabled()}</p>
            <Rating value={2} max={5} disabled />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_size()}</p>
            <div class='flex flex-wrap items-center gap-4'>
              <Rating value={3} max={5} size='xs' readonly />
              <Rating value={3} max={5} size='sm' readonly />
              <Rating value={3} max={5} size='md' readonly />
              <Rating value={3} max={5} size='lg' readonly />
              <Rating value={3} max={5} size='xl' readonly />
            </div>
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>{m.gallery_demo_color()}</p>
            <div class='flex flex-wrap items-center gap-4'>
              <Rating value={3} max={5} color='primary' readonly />
              <Rating value={3} max={5} color='secondary' readonly />
              <Rating value={3} max={5} color='success' readonly />
              <Rating value={3} max={5} color='error' readonly />
            </div>
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title={m.gallery_demo_display_and_feedback()}
    subtitle='Badge / Avatar / Tag / Spinner / Progress'
    iconClass='icon-[tabler--mood-smile]'
    tone='success'
  >
    <DemoCard title={m.gallery_demo_badge_avatar_tag()} description={m.gallery_demo_badges_avatars_and_tags()} code={codeBadgeAvatarTag}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_badge_variants()}</p>
          <div class='flex flex-wrap gap-2'>
            <Badge>{m.gallery_demo_default()}</Badge>
            <Badge variant='primary'>primary</Badge>
            <Badge variant='secondary'>secondary</Badge>
            <Badge variant='success'>success</Badge>
            <Badge variant='warning'>warning</Badge>
            <Badge variant='error'>error</Badge>
            <Badge variant='info'>info</Badge>
            <Badge variant='ghost'>ghost</Badge>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_badge_outline_and_sizes()}</p>
          <div class='flex flex-wrap items-center gap-2'>
            <Badge variant='primary' outline size='xs'>{m.gallery_demo_xs_outline()}</Badge>
            <Badge variant='primary' outline size='sm'>{m.gallery_demo_sm_outline()}</Badge>
            <Badge variant='primary' outline>{m.gallery_demo_md_outline()}</Badge>
            <Badge variant='primary' outline size='lg'>{m.gallery_demo_lg_outline()}</Badge>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_avatar()}</p>
          <div class='flex items-end gap-4'>
            <div class='text-center'>
              <Avatar name={m.gallery_demo_zhang_san()} size='xs' />
              <p class='text-xs mt-1'>xs</p>
            </div>
            <div class='text-center'>
              <Avatar name={m.gallery_demo_li_si()} size='sm' />
              <p class='text-xs mt-1'>sm</p>
            </div>
            <div class='text-center'>
              <Avatar name={m.gallery_demo_wang_wu()} size='md' />
              <p class='text-xs mt-1'>md</p>
            </div>
            <div class='text-center'>
              <Avatar name={m.gallery_demo_zhao_liu()} size='lg' />
              <p class='text-xs mt-1'>lg</p>
            </div>
            <div class='text-center'>
              <Avatar name={m.gallery_demo_qian_qi()} size='xl' />
              <p class='text-xs mt-1'>xl</p>
            </div>
            <div class='text-center'>
              <Avatar name={m.gallery_demo_square()} size='lg' shape='square' />
              <p class='text-xs mt-1'>square</p>
            </div>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_tag()}</p>
          <div class='flex flex-wrap gap-2'>
            <Tag>{m.gallery_demo_default()}</Tag>
            <Tag variant='primary'>primary</Tag>
            <Tag variant='secondary'>secondary</Tag>
            <Tag variant='success'>{m.gallery_toast_type_success()}</Tag>
            <Tag variant='warning'>{m.gallery_toast_type_warning()}</Tag>
            <Tag variant='error'>{m.gallery_toast_type_error()}</Tag>
            <Tag variant='info'>{m.audit_info()}</Tag>
            <Tag variant='primary' outline>{m.gallery_demo_outline()}</Tag>
            <Tag closable onclose={() => toast.info(m.gallery_demo_tag_dismissed())}>{m.gallery_demo_dismissible()}</Tag>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_tag_sizes()}</p>
          <div class='flex flex-wrap items-center gap-2'>
            <Tag variant='primary' size='xs'>xs</Tag>
            <Tag variant='primary' size='sm'>sm</Tag>
            <Tag variant='primary' size='md'>md</Tag>
            <Tag variant='primary' size='lg'>lg</Tag>
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title={m.gallery_demo_spinner_progress()} description={m.gallery_demo_loading_indicators_and_progress()} code={codeSpinnerProgress}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_spinner_sizes_and_variants()}</p>
          <div class='flex items-center gap-6'>
            <Spinner size='xs' />
            <Spinner size='sm' variant='primary' />
            <Spinner size='md' variant='secondary' />
            <Spinner size='lg' variant='success' />
            <Spinner size='xl' variant='error' />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_basic_progress()}</p>
          <div class='space-y-3'>
            <Progress value={20} max={100} variant='primary' size='sm' showLabel />
            <Progress value={50} max={100} variant='info' size='md' showLabel />
            <Progress value={75} max={100} variant='success' size='md' showLabel />
            <Progress value={90} max={100} variant='warning' size='lg' showLabel />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>{m.gallery_demo_striped_and_animated_progress()}</p>
          <div class='space-y-3'>
            <Progress value={60} max={100} variant='primary' striped showLabel />
            <Progress value={45} max={100} variant='secondary' striped animated showLabel />
            <Progress value={80} max={100} variant='error' striped animated showLabel />
          </div>
        </div>
      </div>
    </DemoCard>
  </DemoSection>
</div>
