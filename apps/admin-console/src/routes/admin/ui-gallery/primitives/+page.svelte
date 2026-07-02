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
  import { Range, toast } from '@h-ai/ui'

  // === 表单状态 ===
  let inputVal = $state('')
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
<Input value='无效内容' error='请输入有效内容' />
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
<Select options={selectOpts} placeholder='请选择' error='请选择一项' />`

  const codeSelectClearFilter = `<Select bind:value options={selectOpts} placeholder='可清空' clearable />
<Select bind:value options={selectOpts} placeholder='可筛选' filterable />
<Select bind:value options={selectOpts} placeholder='可清空+可筛选' clearable filterable />`

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
    title='按钮与交互'
    subtitle='Button / BareButton / IconButton'
    iconClass='icon-[tabler--click]'
    tone='primary'
  >
    <DemoCard title='Button 按钮' description='变体 / 轮廓 / 尺寸 / 状态' code={codeButton}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>变体（variant）</p>
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
          <p class='text-sm font-medium mb-2'>轮廓模式（outline）</p>
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
          <p class='text-sm font-medium mb-2'>尺寸（size）</p>
          <div class='flex flex-wrap items-end gap-3'>
            <Button variant='primary' size='xs'>xs 超小</Button>
            <Button variant='primary' size='sm'>sm 小</Button>
            <Button variant='primary' size='md'>md 中（默认）</Button>
            <Button variant='primary' size='lg'>lg 大</Button>
            <Button variant='primary' size='xl'>xl 超大</Button>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>特殊状态</p>
          <div class='flex flex-wrap items-center gap-3'>
            <Button variant='primary' loading>加载中</Button>
            <Button variant='primary' disabled>禁用</Button>
            <Button variant='primary' circle>⚙</Button>
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title='BareButton / IconButton' description='无样式按钮与图标按钮' code={codeBareIconButton}>
      <div class='space-y-4'>
        <div>
          <p class='text-sm font-medium mb-2'>BareButton（无样式按钮）</p>
          <div class='flex items-center gap-4'>
            <BareButton onclick={() => toast.info('裸按钮点击')}>
              <span class='text-primary underline cursor-pointer'>可点击文字</span>
            </BareButton>
            <BareButton disabled>
              <span class='text-base-content/30 cursor-not-allowed'>禁用状态</span>
            </BareButton>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>IconButton（各变体）</p>
          <div class='flex items-center gap-4'>
            <IconButton variant='primary' tooltip='设置' label='设置' onclick={() => toast.info('设置')}>
              {#snippet icon()}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
                  <circle cx='12' cy='12' r='3' />
                  <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
                </svg>
              {/snippet}
            </IconButton>
            <IconButton variant='error' tooltip='删除' label='删除'>
              {#snippet icon()}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
                  <polyline points='3 6 5 6 21 6' />
                  <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
                </svg>
              {/snippet}
            </IconButton>
            <IconButton variant='info' tooltip='信息' label='信息'>
              {#snippet icon()}
                <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
                  <circle cx='12' cy='12' r='10' />
                  <line x1='12' y1='16' x2='12' y2='12' />
                  <line x1='12' y1='8' x2='12.01' y2='8' />
                </svg>
              {/snippet}
            </IconButton>
            <IconButton disabled tooltip='禁用' label='禁用'>
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
    title='输入控件'
    subtitle='Input / BareInput / Textarea / Select / Checkbox / Switch / Radio'
    iconClass='icon-[tabler--forms]'
    tone='info'
  >
    <DemoCard title='Input / BareInput / Textarea' description='输入框、裸输入框与多行文本' code={codeInput}>
      <div class='space-y-4'>
        <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-std'>标准输入框</label>
            <Input id='g-input-std' bind:value={inputVal} placeholder='请输入内容' />
            <p class='text-xs text-base-content/50 mt-1'>当前值: {inputVal || '（空）'}</p>
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-bare'>裸输入框（BareInput）</label>
            <BareInput id='g-input-bare' placeholder='无边框、无样式' />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-err'>错误状态</label>
            <Input id='g-input-err' value='无效内容' error='请输入有效内容' />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-dis'>禁用状态</label>
            <Input id='g-input-dis' value='不可编辑' disabled />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-ro'>只读状态</label>
            <Input id='g-input-ro' value='只读内容' readonly />
          </div>
          <div>
            <label class='text-sm font-medium mb-1 block' for='g-input-pwd'>密码类型</label>
            <Input id='g-input-pwd' type='password' placeholder='输入密码' />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>尺寸（size）</p>
          <div class='flex flex-wrap items-end gap-3'>
            <Input size='xs' placeholder='xs' />
            <Input size='sm' placeholder='sm' />
            <Input size='md' placeholder='md（默认）' />
            <Input size='lg' placeholder='lg' />
          </div>
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-textarea'>多行文本（Textarea）</label>
          <Textarea id='g-textarea' bind:value={textareaVal} placeholder='请输入多行内容...' rows={3} />
          <p class='text-xs text-base-content/50 mt-1'>已输入 {textareaVal.length} 字</p>
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-textarea-auto'>自动高度（autoResize）</label>
          <Textarea id='g-textarea-auto' placeholder='输入后自动调整高度' rows={2} autoResize />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Select / Checkbox / Switch / Radio' description='下拉、复选、开关、单选' code={codeFormControls}>
      <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel'>下拉选择</label>
          <Select id='g-sel' bind:value={selectVal} options={selectOpts} placeholder='请选择框架' />
          <p class='text-xs text-base-content/50 mt-1'>选中: {selectVal || '（无）'}</p>
        </div>
        <fieldset>
          <legend class='text-sm font-medium mb-3'>复选框（Checkbox）</legend>
          <div class='space-y-2'>
            <Checkbox bind:checked={checkboxVal} label='同意用户协议' />
            <Checkbox checked={checkboxIndeterminate} indeterminate label='半选状态' />
            <Checkbox disabled label='禁用' />
            <Checkbox checked disabled label='禁用（已选）' />
          </div>
        </fieldset>
        <fieldset>
          <legend class='text-sm font-medium mb-3'>开关（Switch）</legend>
          <div class='space-y-2'>
            <Switch bind:checked={switchVal} label='启用通知' />
            <Switch checked={false} disabled label='禁用' />
            <Switch checked disabled label='禁用（开）' />
          </div>
          <p class='text-xs text-base-content/50 mt-2'>通知: {switchVal ? '开' : '关'}</p>
        </fieldset>
        <fieldset>
          <legend class='text-sm font-medium mb-3'>单选（Radio）</legend>
          <Radio value={radioVal} options={selectOpts} direction='vertical' onchange={(v: string) => radioVal = v} />
          <p class='text-xs text-base-content/50 mt-2'>选中: {radioVal}</p>
        </fieldset>
      </div>
      <div class='mt-6'>
        <p class='text-sm font-medium mb-3'>Radio 水平排列</p>
        <Radio value={radioHorizontal} options={selectOpts} direction='horizontal' onchange={(v: string) => radioHorizontal = v} />
      </div>
    </DemoCard>

    <DemoCard title='Select 尺寸与状态' description='xs / sm / lg 与错误态' code={codeSelectSize}>
      <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-xs'>xs</label>
          <Select id='g-sel-xs' options={selectOpts} placeholder='超小' size='xs' />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-sm'>sm</label>
          <Select id='g-sel-sm' options={selectOpts} placeholder='小号' size='sm' />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-lg'>lg</label>
          <Select id='g-sel-lg' options={selectOpts} placeholder='大号' size='lg' />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-err'>错误状态</label>
          <Select id='g-sel-err' options={selectOpts} placeholder='请选择' error='请选择一项' />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Select clearable & filterable' description='可清空、可筛选下拉框' code={codeSelectClearFilter}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-clear'>clearable</label>
          <Select id='g-sel-clear' bind:value={selectClearVal} options={selectOpts} placeholder='可清空' clearable />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-filter'>filterable</label>
          <Select id='g-sel-filter' bind:value={selectFilterVal} options={selectOpts} placeholder='可筛选' filterable />
        </div>
        <div>
          <label class='text-sm font-medium mb-1 block' for='g-sel-both'>clearable + filterable</label>
          <Select id='g-sel-both' bind:value={selectBothVal} options={selectOpts} placeholder='可清空+可筛选' clearable filterable />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Toggle 系列' description='ToggleCheckbox / ToggleInput / ToggleRadio' code={codeToggle}>
      <div class='space-y-4'>
        <div class='flex flex-wrap items-center gap-8'>
          <label class='flex items-center gap-2 cursor-pointer'>
            <ToggleCheckbox bind:checked={toggleCheck} />
            <span class='text-sm'>ToggleCheckbox: {toggleCheck ? '开' : '关'}</span>
          </label>
          <label class='flex items-center gap-2 cursor-pointer'>
            <ToggleInput bind:checked={toggleInput} />
            <span class='text-sm'>ToggleInput: {toggleInput ? '开' : '关'}</span>
          </label>
          <label class='flex items-center gap-2 cursor-pointer'>
            <ToggleRadio bind:checked={toggleRadio} />
            <span class='text-sm'>ToggleRadio: {toggleRadio ? '开' : '关'}</span>
          </label>
        </div>
        <div class='flex flex-wrap items-center gap-8'>
          <label class='flex items-center gap-2 cursor-not-allowed'>
            <ToggleCheckbox checked disabled />
            <span class='text-sm opacity-50'>禁用（开）</span>
          </label>
          <label class='flex items-center gap-2 cursor-not-allowed'>
            <ToggleInput disabled />
            <span class='text-sm opacity-50'>禁用（关）</span>
          </label>
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Range 滑块 / Rating 评分' description='滑块与评分控件' code={codeRangeRating}>
      <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div class='space-y-4'>
          <div>
            <p class='text-sm font-medium mb-2'>基础滑块: {rangeVal}</p>
            <Range bind:value={rangeVal} min={0} max={100} step={10} variant='primary' />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>带步骤标记</p>
            <Range value={30} min={0} max={100} step={25} variant='secondary' showSteps />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>各变体</p>
            <div class='space-y-2'>
              <Range value={60} variant='success' />
              <Range value={40} variant='warning' />
              <Range value={80} variant='error' />
              <Range value={50} variant='info' />
            </div>
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>尺寸</p>
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
            <p class='text-sm font-medium mb-2'>整数评分: {ratingVal} / 5</p>
            <Rating bind:value={ratingVal} max={5} size='lg' clearable />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>半星评分: {ratingHalf} / 5</p>
            <Rating bind:value={ratingHalf} max={5} size='lg' half clearable />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>只读</p>
            <Rating value={4} max={5} readonly />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>禁用</p>
            <Rating value={2} max={5} disabled />
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>尺寸</p>
            <div class='flex flex-wrap items-center gap-4'>
              <Rating value={3} max={5} size='xs' readonly />
              <Rating value={3} max={5} size='sm' readonly />
              <Rating value={3} max={5} size='md' readonly />
              <Rating value={3} max={5} size='lg' readonly />
              <Rating value={3} max={5} size='xl' readonly />
            </div>
          </div>
          <div>
            <p class='text-sm font-medium mb-2'>颜色</p>
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
    title='展示与反馈'
    subtitle='Badge / Avatar / Tag / Spinner / Progress'
    iconClass='icon-[tabler--mood-smile]'
    tone='success'
  >
    <DemoCard title='Badge 徽章 / Avatar 头像 / Tag 标签' description='徽章、头像与标签' code={codeBadgeAvatarTag}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>Badge 变体</p>
          <div class='flex flex-wrap gap-2'>
            <Badge>默认</Badge>
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
          <p class='text-sm font-medium mb-2'>Badge 轮廓 + 尺寸</p>
          <div class='flex flex-wrap items-center gap-2'>
            <Badge variant='primary' outline size='xs'>xs 轮廓</Badge>
            <Badge variant='primary' outline size='sm'>sm 轮廓</Badge>
            <Badge variant='primary' outline>md 轮廓</Badge>
            <Badge variant='primary' outline size='lg'>lg 轮廓</Badge>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Avatar 头像</p>
          <div class='flex items-end gap-4'>
            <div class='text-center'>
              <Avatar name='张三' size='xs' />
              <p class='text-xs mt-1'>xs</p>
            </div>
            <div class='text-center'>
              <Avatar name='李四' size='sm' />
              <p class='text-xs mt-1'>sm</p>
            </div>
            <div class='text-center'>
              <Avatar name='王五' size='md' />
              <p class='text-xs mt-1'>md</p>
            </div>
            <div class='text-center'>
              <Avatar name='赵六' size='lg' />
              <p class='text-xs mt-1'>lg</p>
            </div>
            <div class='text-center'>
              <Avatar name='钱七' size='xl' />
              <p class='text-xs mt-1'>xl</p>
            </div>
            <div class='text-center'>
              <Avatar name='方形' size='lg' shape='square' />
              <p class='text-xs mt-1'>square</p>
            </div>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Tag 标签</p>
          <div class='flex flex-wrap gap-2'>
            <Tag>默认</Tag>
            <Tag variant='primary'>primary</Tag>
            <Tag variant='secondary'>secondary</Tag>
            <Tag variant='success'>成功</Tag>
            <Tag variant='warning'>警告</Tag>
            <Tag variant='error'>错误</Tag>
            <Tag variant='info'>信息</Tag>
            <Tag variant='primary' outline>轮廓</Tag>
            <Tag closable onclose={() => toast.info('标签关闭')}>可关闭</Tag>
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Tag 尺寸</p>
          <div class='flex flex-wrap items-center gap-2'>
            <Tag variant='primary' size='xs'>xs</Tag>
            <Tag variant='primary' size='sm'>sm</Tag>
            <Tag variant='primary' size='md'>md</Tag>
            <Tag variant='primary' size='lg'>lg</Tag>
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title='Spinner 加载器 / Progress 进度条' description='加载指示与进度条' code={codeSpinnerProgress}>
      <div class='space-y-6'>
        <div>
          <p class='text-sm font-medium mb-2'>Spinner 尺寸与变体</p>
          <div class='flex items-center gap-6'>
            <Spinner size='xs' />
            <Spinner size='sm' variant='primary' />
            <Spinner size='md' variant='secondary' />
            <Spinner size='lg' variant='success' />
            <Spinner size='xl' variant='error' />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Progress 基础</p>
          <div class='space-y-3'>
            <Progress value={20} max={100} variant='primary' size='sm' showLabel />
            <Progress value={50} max={100} variant='info' size='md' showLabel />
            <Progress value={75} max={100} variant='success' size='md' showLabel />
            <Progress value={90} max={100} variant='warning' size='lg' showLabel />
          </div>
        </div>
        <div>
          <p class='text-sm font-medium mb-2'>Progress 条纹 + 动画</p>
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
