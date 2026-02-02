<!--
  UI 组件库展示页面 - 使用 @hai/ui 组件
-->
<script lang="ts">
  
  
  // 示例数据
  let inputValue = $state('')
  let textareaValue = $state('')
  let selectValue = $state('')
  let checkboxValue = $state(false)
  let switchValue = $state(false)
  let radioValue = $state('option1')
  let activeTab = $state('buttons')
  
  const tabs = [
    { id: 'buttons', label: '按钮' },
    { id: 'forms', label: '表单' },
    { id: 'feedback', label: '反馈' },
    { id: 'data', label: '数据展示' },
  ]
</script>

<svelte:head>
  <title>UI 组件库 - hai Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- 页面标题 -->
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-base-content">UI 组件库</h1>
    <p class="text-base-content/60 mt-1">基于 @hai/ui 的组件展示，封装自 DaisyUI</p>
  </div>
  
  <!-- 标签切换 -->
  <div class="bg-base-100 rounded-xl border border-base-200 p-1 inline-flex gap-1">
    {#each tabs as tab}
      <Button
        variant={activeTab === tab.id ? 'primary' : 'ghost'}
        size="sm"
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
      </Button>
    {/each}
  </div>

  <!-- 按钮组件 -->
  {#if activeTab === 'buttons'}
    <div class="grid gap-6">
      <!-- 基础按钮 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">基础按钮</h3>
        <div class="flex flex-wrap gap-3">
          <Button variant="primary">主要按钮</Button>
          <Button variant="secondary">次要按钮</Button>
          <Button>默认按钮</Button>
        </div>
      </Card>
      
      <!-- 状态按钮 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">状态按钮</h3>
        <div class="flex flex-wrap gap-3">
          <Button variant="info">信息</Button>
          <Button variant="success">成功</Button>
          <Button variant="warning">警告</Button>
          <Button variant="error">错误</Button>
        </div>
      </Card>
      
      <!-- 按钮变体 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">按钮变体</h3>
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="primary" outline>轮廓按钮</Button>
          <Button variant="primary" size="sm">小按钮</Button>
          <Button variant="primary" size="lg">大按钮</Button>
          <Button variant="primary" loading>加载中</Button>
          <Button variant="primary" disabled>禁用</Button>
        </div>
      </Card>
    </div>
  {/if}
  
  <!-- 表单组件 -->
  {#if activeTab === 'forms'}
    <div class="grid gap-6">
      <!-- 输入框 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">输入框</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-base-content/80 mb-1.5" for="ui-input-default">默认输入框</label>
            <Input id="ui-input-default" bind:value={inputValue} placeholder="请输入内容" />
          </div>
          <div>
            <label class="block text-sm font-medium text-base-content/80 mb-1.5" for="ui-input-disabled">禁用状态</label>
            <Input id="ui-input-disabled" value="禁用内容" disabled />
          </div>
        </div>
      </Card>
      
      <!-- 多行文本 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">多行文本</h3>
        <Textarea bind:value={textareaValue} placeholder="请输入备注信息..." rows={4} />
      </Card>
      
      <!-- 选择控件 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">选择控件</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label class="block text-sm font-medium text-base-content/80 mb-1.5" for="ui-select">下拉选择</label>
            <Select
              id="ui-select"
              bind:value={selectValue}
              options={[
                { value: 'option1', label: '选项一' },
                { value: 'option2', label: '选项二' },
                { value: 'option3', label: '选项三' },
              ]}
              placeholder="请选择"
            />
          </div>
          <fieldset>
            <legend class="block text-sm font-medium text-base-content/80 mb-3">复选框</legend>
            <Checkbox bind:checked={checkboxValue} label="同意条款" />
          </fieldset>
          <fieldset>
            <legend class="block text-sm font-medium text-base-content/80 mb-3">开关</legend>
            <Switch bind:checked={switchValue} label="启用功能" />
          </fieldset>
        </div>
      </Card>
      
      <!-- 单选按钮 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">单选按钮</h3>
        <Radio 
          value={radioValue}
          options={[
            { value: 'option1', label: '选项一' },
            { value: 'option2', label: '选项二' },
            { value: 'option3', label: '选项三' },
          ]}
          direction="horizontal"
          onchange={(v: string) => radioValue = v}
        />
        <p class="text-sm text-base-content/60 mt-2">当前选中: {radioValue}</p>
      </Card>
    </div>
  {/if}
  
  <!-- 反馈组件 -->
  {#if activeTab === 'feedback'}
    <div class="grid gap-6">
      <!-- 警告提示 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">警告提示</h3>
        <div class="space-y-3">
          <Alert variant="info">这是一条信息提示，用于展示一般性信息。</Alert>
          <Alert variant="success">操作成功完成！数据已保存。</Alert>
          <Alert variant="warning">警告：此操作可能影响系统性能。</Alert>
          <Alert variant="error">错误：操作失败，请稍后重试。</Alert>
        </div>
      </Card>
      
      <!-- 加载状态 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">加载状态</h3>
        <div class="flex items-center gap-6">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
      </Card>
      
      <!-- 进度条 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">进度条</h3>
        <div class="space-y-4">
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-base-content/70">上传进度</span>
              <span class="text-base-content/60">40%</span>
            </div>
            <Progress value={40} max={100} variant="primary" />
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-base-content/70">处理进度</span>
              <span class="text-base-content/60">70%</span>
            </div>
            <Progress value={70} max={100} variant="success" />
          </div>
        </div>
      </Card>
    </div>
  {/if}
  
  <!-- 数据展示 -->
  {#if activeTab === 'data'}
    <div class="grid gap-6">
      <!-- 头像 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">头像</h3>
        <div class="flex items-center gap-4">
          <Avatar name="Alice" size="sm" />
          <Avatar name="Bob" size="md" />
          <Avatar name="Charlie" size="lg" />
          <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=John" name="John" size="lg" />
        </div>
      </Card>
      
      <!-- 徽章 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">徽章</h3>
        <div class="flex flex-wrap gap-2">
          <Badge>默认</Badge>
          <Badge variant="primary">主要</Badge>
          <Badge variant="secondary">次要</Badge>
          <Badge variant="info">信息</Badge>
          <Badge variant="success">成功</Badge>
          <Badge variant="warning">警告</Badge>
          <Badge variant="error">错误</Badge>
        </div>
        <div class="flex flex-wrap gap-2 mt-4">
          <Badge variant="primary" outline>轮廓</Badge>
          <Badge variant="primary" size="lg">大徽章</Badge>
          <Badge variant="primary" size="sm">小徽章</Badge>
        </div>
      </Card>
      
      <!-- 标签 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">标签</h3>
        <div class="flex flex-wrap gap-2">
          <Tag>默认标签</Tag>
          <Tag variant="primary">主要标签</Tag>
          <Tag variant="success">成功标签</Tag>
          <Tag variant="warning">警告标签</Tag>
          <Tag variant="error">错误标签</Tag>
          <Tag closable onclose={() => console.log('closed')}>可关闭</Tag>
        </div>
      </Card>
      
      <!-- 统计卡片 -->
      <Card>
        <h3 class="text-lg font-semibold text-base-content mb-4">统计卡片</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 rounded-xl bg-primary/10 border border-primary/20">
            <p class="text-sm text-primary font-medium">总用户数</p>
            <p class="text-3xl font-bold text-primary mt-1">1,234</p>
            <p class="text-xs text-primary/70 mt-1">较上月 +12%</p>
          </div>
          <div class="p-4 rounded-xl bg-success/10 border border-success/20">
            <p class="text-sm text-success font-medium">活跃角色</p>
            <p class="text-3xl font-bold text-success mt-1">56</p>
            <p class="text-xs text-success/70 mt-1">较上月 +5%</p>
          </div>
          <div class="p-4 rounded-xl bg-warning/10 border border-warning/20">
            <p class="text-sm text-warning font-medium">权限条目</p>
            <p class="text-3xl font-bold text-warning mt-1">789</p>
            <p class="text-xs text-warning/70 mt-1">较上月 +8%</p>
          </div>
        </div>
      </Card>
    </div>
  {/if}
</div>
