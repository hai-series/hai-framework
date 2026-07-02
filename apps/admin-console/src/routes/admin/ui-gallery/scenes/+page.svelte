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
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  // FileList 与 DOM 全局类型同名，必须显式导入
  import { AiDocumentEditor, AiTableEditor, ErrorPage, FileList, MarkdownRenderer, toast } from '@h-ai/ui'

  const adminUsersPath = resolve('/admin/iam/users', {})
  const adminRolesPath = resolve('/admin/iam/roles', {})
  const adminPermissionsPath = resolve('/admin/iam/permissions', {})

  // === 状态 ===
  let pwdVal = $state('')
  let encVal = $state('')

  // 错误页预设演示
  const errorPresets = ['401', '403', '404', '500', '503'] as const
  let errorStatus = $state<(typeof errorPresets)[number]>('404')

  // === Markdown 示例内容 ===
  const demoMarkdown = `# Markdown 渲染器演示

这是一个**全功能的 Markdown 渲染器**，专为 AI 输出显示而设计。支持 [GitHub Flavored Markdown](https://github.github.com/gfm/) 全量语法。

## 文本格式化

这段文字包含 **粗体**、*斜体*、~~删除线~~、以及 \`行内代码\` 等格式。\
还可以组合使用：***粗斜体***、**\`粗体代码\`**。

## 列表

### 无序列表

- 第一项内容
- 第二项内容
  - 嵌套子项
  - 另一个子项
    - 更深层嵌套
- 第三项

### 有序列表

1. 安装依赖
2. 配置项目
3. 启动开发服务器
4. 开始编码

### 任务列表

- [x] 项目初始化
- [x] 组件开发
- [ ] 单元测试
- [ ] 文档编写

## 引用

> "好的代码就是最好的文档。当你要为代码写注释的时候，先想想是不是可以改善代码使其不需要注释。"
>
> — Steve McConnell

> **提示：** 这是一个多行引用块。
> 它可以包含 **富文本格式**、\`代码\` 和其他元素。
>
> > 还可以嵌套引用。

## 代码块

### TypeScript

\`\`\`typescript
interface User {
  id: string
  name: string
  email: string
  roles: string[]
}

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(\\\`/api/users/\\\${id}\\\`)
  if (!response.ok) {
    throw new Error(\\\`Failed to fetch user: \\\${response.status}\\\`)
  }
  return response.json()
}
\`\`\`

### Python

\`\`\`python
from dataclasses import dataclass
from typing import Optional

@dataclass
class Config:
    """应用配置"""
    host: str = "localhost"
    port: int = 8080
    debug: bool = False
    secret: Optional[str] = None

def create_app(config: Config) -> "App":
    app = App(config)
    app.register_middleware(auth_middleware)
    app.register_routes(api_routes)
    return app
\`\`\`

### Bash

\`\`\`bash
#!/bin/bash
# 部署脚本
echo "开始部署..."
pnpm install --frozen-lockfile
pnpm build
docker build -t myapp:latest .
docker push myapp:latest
echo "部署完成 ✅"
\`\`\`

### JSON

\`\`\`json
{
  "name": "@h-ai/ui",
  "version": "0.1.0",
  "dependencies": {
    "marked": "^17.0.0",
    "shiki": "^3.2.0"
  }
}
\`\`\`

### SQL

\`\`\`sql
SELECT u.id, u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 5
ORDER BY order_count DESC
LIMIT 10;
\`\`\`

## 表格

| 功能 | 状态 | 说明 |
|------|------|------|
| 标题渲染 | ✅ 已完成 | h1 ~ h6 全支持 |
| 代码高亮 | ✅ 已完成 | 30+ 编程语言 |
| 表格显示 | ✅ 已完成 | 响应式滚动容器 |
| 任务列表 | ✅ 已完成 | GFM 规范 |
| 一键复制 | ✅ 已完成 | 代码块复制按钮 |
| 主题适配 | ✅ 已完成 | DaisyUI 主题 |

## 水平线

上方内容

---

下方内容

## 图片

> 注意：以下为占位图片示例链接

![示例图片](https://placehold.co/600x200/EEE/999?text=Markdown+Image+Demo)

## 综合示例

下面是一个混合了**多种元素**的段落：

在 \`packages/ui\` 模块中，我们使用 [Svelte 5](https://svelte.dev) 的 Runes 语法构建组件。核心依赖包括：

1. **marked** — Markdown 解析引擎
2. **Shiki** — 语法高亮
3. **DaisyUI** — 主题系统

> 所有组件均通过 \`@h-ai/ui\` 统一导出，使用 \`export *\` 聚合模式。
`

  // === 简短 AI 对话示例 ===
  const aiResponseMarkdown = `当然可以！下面是一个使用 TypeScript 创建简单 HTTP 服务器的示例：

\`\`\`typescript
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ message: 'Hello, World!' }))
})

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000')
})
\`\`\`

**关键要点：**
- 使用 \`node:http\` 内置模块，无需安装第三方依赖
- \`createServer\` 接受一个回调函数处理每个请求
- 通过 \`writeHead\` 设置响应状态码和头部
- 调用 \`listen\` 启动服务器

你还可以使用 **Express** 或 **Fastify** 来构建更复杂的应用。`

  const aiDocumentContent = [
    '# 订单智能分析方案',
    '',
    '## 目标',
    '',
    '- 自动汇总订单异常',
    '- 输出可执行建议',
    '',
    '```typescript',
    'const score = order.risk * 0.7 + order.delay * 0.3',
    '```',
    '',
    '> 选中文本后可接入改写、批注等 AI 操作。',
  ].join('\n')

  // === 含 Mermaid 图表的文档示例 ===
  const aiMermaidDocumentContent = [
    '# 订单履约流程设计',
    '',
    '## 流程总览',
    '',
    '下面的流程图展示了订单从创建到履约的关键节点：',
    '',
    '```mermaid',
    'flowchart TD',
    '  A[用户下单] --> B{库存校验}',
    '  B -->|充足| C[锁定库存]',
    '  B -->|不足| D[触发补货]',
    '  C --> E[创建履约单]',
    '  E --> F[仓库拣货]',
    '  F --> G[物流配送]',
    '  G --> H[确认收货]',
    '```',
    '',
    '## 服务交互时序',
    '',
    '核心服务之间的调用顺序如下：',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  participant U as 用户',
    '  participant O as 订单服务',
    '  participant I as 库存服务',
    '  participant P as 支付服务',
    '  U->>O: 提交订单',
    '  O->>I: 校验并锁定库存',
    '  I-->>O: 锁定成功',
    '  O->>P: 发起支付',
    '  P-->>O: 支付完成',
    '  O-->>U: 返回下单结果',
    '```',
    '',
    '> Mermaid 代码块会在阅读态自动渲染为图表。',
  ].join('\n')

  // === Mermaid 代码产物示例（code 模式，支持代码/预览切换） ===
  const aiMermaidCodeContent = [
    'stateDiagram-v2',
    '  [*] --> 待支付',
    '  待支付 --> 已支付: 支付成功',
    '  待支付 --> 已取消: 超时或取消',
    '  已支付 --> 履约中: 仓库接单',
    '  履约中 --> 已完成: 确认收货',
    '  已完成 --> [*]',
    '  已取消 --> [*]',
  ].join('\n')

  const htmlTagMarkdownDemo = [
    '## HTML 标签配置演示',
    '',
    '默认情况下，原始 HTML 会按普通文本显示：',
    '',
    '- <b>粗体强调</b>',
    '- <i>斜体强调</i>',
    '- <u>下划线提示</u>',
    '- <mark>高亮标记</mark>',
    '',
    '开启 `allowHtmlTags` 后，上述标签会按安全白名单解析。',
  ].join('\n')

  const aiHtmlTagDocumentContent = [
    '# 文档展示设置',
    '',
    '这个示例用来演示 `fontSize` 和 `allowHtmlTags`。',
    '',
    '## 支持的内联 HTML',
    '',
    '启用后可解析：<b>重点</b>、<i>强调</i>、<u>下划线</u>、<mark>高亮</mark>。',
    '',
    '> 不安全或不受支持的标签仍会被安全处理。',
  ].join('\n')

  // === 示例数据 ===
  const demoUser = {
    id: '1',
    username: 'zhangsan',
    email: 'zhangsan@example.com',
    nickname: '张三',
    phone: '13800138000',
    avatar: '',
    bio: '全栈开发工程师，专注于 TypeScript 与 Svelte 生态。',
  }

  const demoFiles = [
    { id: '1', name: '设计稿-v3.png', size: 2048000, type: 'image/png', url: '#' },
    { id: '2', name: '需求文档.pdf', size: 512000, type: 'application/pdf', url: '#' },
    { id: '3', name: '数据报表.xlsx', size: 1024000, type: 'application/vnd.ms-excel', url: '#' },
    { id: '4', name: '会议纪要.docx', size: 256000, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', url: '#' },
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
  showRememberMe
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
<PasswordInput value='short' error='密码长度不足 8 位' showToggle />`

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
    title='AI 场景组件'
    subtitle='MarkdownRenderer / AiDocumentEditor / AiTableEditor'
    iconClass='icon-[tabler--sparkles]'
    tone='primary'
  >
    <DemoCard title='MarkdownRenderer · AI 对话回复' description='AI 对话回复的 Markdown 渲染' code={codeMarkdownChat}>
      <div class='bg-base-200/30 rounded-xl p-6'>
        <div class='flex gap-3'>
          <div class='shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content text-sm font-bold'>AI</div>
          <div class='flex-1 min-w-0'>
            <MarkdownRenderer content={aiResponseMarkdown} />
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title='MarkdownRenderer · 全功能演示' description='标题 / 列表 / 任务 / 引用 / 代码高亮 / 表格 / 图片等 GFM 语法' code={codeMarkdownFull} open={false}>
      <MarkdownRenderer content={demoMarkdown} />
    </DemoCard>

    <DemoCard title='MarkdownRenderer · 字号与 HTML 标签' description='通过 fontSize 调整阅读字号；开启 allowHtmlTags 后按安全白名单解析 <b> 等标签' code={codeMarkdownPresentation}>
      <div class='grid grid-cols-1 xl:grid-cols-2 gap-4'>
        <div class='rounded-xl border border-base-300 bg-base-200/30 p-4' data-testid='markdown-html-off-demo'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>默认安全模式（fontSize=14 / allowHtmlTags=false）</p>
          <MarkdownRenderer content={htmlTagMarkdownDemo} fontSize={14} />
        </div>
        <div class='rounded-xl border border-base-300 bg-base-200/30 p-4' data-testid='markdown-html-on-demo'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>开启解析（fontSize=18 / allowHtmlTags=true）</p>
          <MarkdownRenderer content={htmlTagMarkdownDemo} fontSize={18} allowHtmlTags />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='AiDocumentEditor' description='AI 生成文档预览、目录、代码块与下载工具栏' code={codeAiDocEditor}>
      <div class='h-104 min-h-0'>
        <AiDocumentEditor
          title='AI 生成方案文档'
          content={aiDocumentContent}
          showToolbar
          showOutline
          showCopyButton
          class='h-full'
        />
      </div>
    </DemoCard>

    <DemoCard title='AiDocumentEditor · 字号与 HTML 标签' description='文档模式同样支持 fontSize 与 allowHtmlTags，适合 AI 文档阅读面板' code={codeAiDocPresentation}>
      <div class='grid grid-cols-1 xl:grid-cols-2 gap-4'>
        <div class='h-104 min-h-0' data-testid='ai-document-html-off-demo'>
          <AiDocumentEditor
            title='默认安全模式'
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
            title='开启安全 HTML 标签'
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

    <DemoCard title='AiTableEditor' description='AI 结构化表格预览、单元格编辑、复制与 CSV 下载' code={codeAiTableEditor}>
      <div class='h-104 min-h-0'>
        <AiTableEditor
          title='AI 销售摘要'
          statusText='示例数据'
          metaText='table/v1'
          saveState='只读预览'
          editable={false}
          tableData={{
            table_columns: [
              { key: 'metric', label: '指标', type: 'text' },
              { key: 'value', label: '数值', type: 'number' },
              { key: 'trend', label: '趋势', type: 'tag' },
            ],
            table_rows: [
              { row_id: 'r1', metric: '新增客户', value: 128, trend: '增长' },
              { row_id: 'r2', metric: '成交订单', value: 42, trend: '稳定' },
              { row_id: 'r3', metric: '退款率', value: 1.8, trend: '下降' },
            ],
          }}
        />
      </div>
    </DemoCard>

    <DemoCard title='AiDocumentEditor · Mermaid 文档' description='文档中的 Mermaid 代码块在阅读态自动渲染为图表' code={codeMermaidDoc}>
      <div class='h-104 min-h-0' data-testid='mermaid-document-demo'>
        <AiDocumentEditor
          title='订单履约流程设计'
          content={aiMermaidDocumentContent}
          sourceKind='document'
          showToolbar
          showOutline
          showCopyButton
          class='h-full'
        />
      </div>
    </DemoCard>

    <DemoCard title='AiDocumentEditor · Mermaid 代码' description='code 模式下切换“代码 / 预览”查看图表渲染结果' code={codeMermaidCode}>
      <div class='h-104 min-h-0' data-testid='mermaid-code-demo'>
        <AiDocumentEditor
          title='订单状态机'
          content={aiMermaidCodeContent}
          sourceKind='code'
          codeLanguage='mermaid'
          showCodePreviewToggle
          showCopyButton
          showOutline={false}
          codePreviewHint='切换查看图表'
          class='h-full'
        />
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='CRUD 业务页面'
    subtitle='CrudPage / CrudFilterBar / CrudEditPanel / CrudDetailPanel / CrudDeleteConfirm'
    iconClass='icon-[tabler--list-details]'
    tone='info'
  >
    <DemoCard title='CRUD 场景组件' description='已在 IAM 用户 / 角色 / 权限页真实接入' code={codeCrud}>
      <div class='grid grid-cols-1 lg:grid-cols-3 gap-4'>
        <Alert variant='info' class='lg:col-span-2'>
          CRUD 场景组件已经在 IAM 用户、角色、权限页面中真实接入，使用 @h-ai/kit/client 的 SvelteKit 导航适配器完成 URL 同步与 invalidateAll 刷新。
        </Alert>
        <div class='flex flex-col gap-2'>
          <a class='btn btn-primary no-animation font-medium' href={adminUsersPath}>查看用户 CRUD</a>
          <a class='btn btn-secondary btn-outline no-animation font-medium' href={adminRolesPath}>查看角色 CRUD</a>
          <a class='btn btn-info btn-outline no-animation font-medium' href={adminPermissionsPath}>查看权限 CRUD</a>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='Error 错误页'
    subtitle='ErrorPage（内置 401 / 403 / 404 / 500 / 503 预设）'
    iconClass='icon-[tabler--alert-triangle]'
    tone='error'
  >
    <DemoCard title='ErrorPage' description='切换状态码查看不同错误页' code={codeErrorPage}>
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
    title='IAM 身份认证'
    subtitle='LoginForm / RegisterForm / 密码管理 / PasswordInput / UserProfile'
    iconClass='icon-[tabler--shield-lock]'
    tone='primary'
  >
    <DemoCard title='LoginForm' description='用户登录表单' code={codeLoginForm}>
      <div class='flex justify-center'>
        <div class='w-full max-w-sm'>
          <LoginForm
            showTitle
            showRememberMe
            showForgotPassword
            showRegisterLink
            onsubmit={async (data) => { toast.success(`登录: ${data.username}`) }}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='RegisterForm' description='用户注册表单' code={codeRegisterForm}>
      <div class='flex justify-center'>
        <div class='w-full max-w-sm'>
          <RegisterForm
            showTitle
            showLoginLink
            showPasswordStrength
            onsubmit={async (data) => { toast.success(`注册: ${data.username ?? data.email ?? ''}`) }}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='密码管理' description='ForgotPasswordForm / ResetPasswordForm / ChangePasswordForm' code={codePasswordMgmt}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-6'>
        <div class='p-4 rounded-xl bg-base-200/50 border border-base-300'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>ForgotPasswordForm</p>
          <ForgotPasswordForm
            showTitle
            showDescription
            showBackLink
            onsubmit={async () => { toast.info('重置邮件已发送') }}
          />
        </div>
        <div class='p-4 rounded-xl bg-base-200/50 border border-base-300'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>ResetPasswordForm</p>
          <ResetPasswordForm
            showTitle
            showDescription
            showCode
            showPasswordStrength
            onsubmit={async () => { toast.success('密码已重置') }}
          />
        </div>
        <div class='p-4 rounded-xl bg-base-200/50 border border-base-300'>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>ChangePasswordForm</p>
          <ChangePasswordForm
            requireOldPassword
            showPasswordStrength
            onsubmit={async () => { toast.success('密码已修改') }}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='PasswordInput' description='密码输入框组件' code={codePasswordInput}>
      <div class='space-y-5'>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <p class='text-xs font-medium text-base-content/50 mb-2'>含强度指示器</p>
          <PasswordInput bind:value={pwdVal} showToggle showStrength placeholder='请输入密码' />
          <p class='text-xs text-base-content/40 mt-2'>已输入 {pwdVal.length} 字符</p>
        </div>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <p class='text-xs font-medium text-base-content/50 mb-2'>基础模式</p>
          <PasswordInput placeholder='仅密码可见性切换' showToggle />
        </div>
        <div class='grid grid-cols-2 gap-3'>
          <div class='p-4 rounded-lg bg-base-200/30'>
            <p class='text-xs font-medium text-base-content/50 mb-2'>禁用状态</p>
            <PasswordInput value='disabled' disabled />
          </div>
          <div class='p-4 rounded-lg bg-base-200/30'>
            <p class='text-xs font-medium text-base-content/50 mb-2'>错误状态</p>
            <PasswordInput value='short' error='密码长度不足 8 位' showToggle />
          </div>
        </div>
      </div>
    </DemoCard>

    <DemoCard title='UserProfile' description='用户资料编辑' code={codeUserProfile}>
      <UserProfile
        user={demoUser}
        editable
        onsubmit={async () => { toast.success('资料已更新') }}
      />
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='Storage 文件存储'
    subtitle='FileUpload / FileList / ImageUpload / AvatarUpload'
    iconClass='icon-[tabler--folder]'
    tone='success'
  >
    <DemoCard title='FileUpload' description='多文件拖拽上传 / 单文件上传' code={codeFileUpload}>
      <div class='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <div>
          <p class='text-xs font-medium text-base-content/50 mb-2'>多文件拖拽上传</p>
          <FileUpload
            accept='image/*,.pdf,.doc,.docx'
            maxFiles={5}
            multiple
            dragDrop
            autoUpload={false}
          />
        </div>
        <div>
          <p class='text-xs font-medium text-base-content/50 mb-2'>单文件上传</p>
          <FileUpload
            accept='image/*'
            maxFiles={1}
            dragDrop
            autoUpload={false}
          />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='FileList' description='文件列表展示与操作（列表 / 网格 / 加载态）' code={codeFileList}>
      <div class='space-y-6'>
        <div>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>列表布局</p>
          <FileList
            files={demoFiles}
            showPreview
            showDownload
            showDelete
            showSize
            layout='list'
            ondownload={f => toast.info(`下载: ${f.name}`)}
            ondelete={f => toast.warning(`删除: ${f.name}`)}
          />
        </div>
        <div class='divider my-2'></div>
        <div>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>网格布局</p>
          <FileList
            files={demoFiles.slice(0, 3)}
            showPreview
            showDownload
            showDelete
            layout='grid'
            ondownload={f => toast.info(`下载: ${f.name}`)}
            ondelete={f => toast.warning(`删除: ${f.name}`)}
          />
        </div>
        <div class='divider my-2'></div>
        <div>
          <p class='text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3'>加载状态</p>
          <FileList files={[]} loading layout='list' />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='ImageUpload / AvatarUpload' description='图片与头像上传' code={codeImageAvatar}>
      <div class='grid grid-cols-2 lg:grid-cols-4 gap-6'>
        <div class='flex flex-col items-center gap-3'>
          <ImageUpload accept='image/*' width='180px' height='180px' />
          <p class='text-xs text-base-content/50'>正方形图片</p>
        </div>
        <div class='flex flex-col items-center gap-3'>
          <ImageUpload accept='image/*' width='280px' height='158px' aspectRatio='16:9' />
          <p class='text-xs text-base-content/50'>16:9 比例</p>
        </div>
        <div class='flex flex-col items-center gap-3'>
          <AvatarUpload size='lg' fallback='张' />
          <p class='text-xs text-base-content/50'>头像（大）</p>
        </div>
        <div class='flex flex-col items-center gap-3'>
          <AvatarUpload size='md' fallback='李' />
          <p class='text-xs text-base-content/50'>头像（中）</p>
        </div>
      </div>
    </DemoCard>
  </DemoSection>

  <div class='divider'></div>

  <DemoSection
    title='Crypto 加密安全'
    subtitle='EncryptedInput / HashDisplay / SignatureDisplay'
    iconClass='icon-[tabler--lock]'
    tone='error'
  >
    <DemoCard title='EncryptedInput' description='加密输入框（SM4 对称加密）' code={codeEncryptedInput}>
      <div class='space-y-4'>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <p class='text-xs font-medium text-base-content/50 mb-2'>SM4 对称加密</p>
          <EncryptedInput bind:value={encVal} algorithm='SM4' placeholder='输入敏感数据' />
        </div>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <p class='text-xs font-medium text-base-content/50 mb-2'>禁用状态</p>
          <EncryptedInput placeholder='不可编辑的加密输入' algorithm='SM4' disabled />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='HashDisplay' description='哈希值展示（SM3）' code={codeHashDisplay}>
      <div class='space-y-4'>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <HashDisplay value='e3b0c44298fc1c149afbf4c8996fb924' algorithm='SM3' label='文件哈希' copyable truncate />
        </div>
        <div class='p-4 rounded-lg bg-base-200/30'>
          <HashDisplay value='a1b2c3d4e5f60718293a4b5c6d7e8f90' algorithm='SM3' label='SM3 摘要' copyable />
        </div>
      </div>
    </DemoCard>

    <DemoCard title='SignatureDisplay' description='数字签名验证展示（SM2）' code={codeSignatureDisplay}>
      <div class='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <div class='p-4 rounded-xl border-2 border-success/20 bg-success/5'>
          <p class='text-xs font-semibold text-success mb-3'>SM2 - 验证通过</p>
          <SignatureDisplay
            signature='MEUCIQDf4b2e8c7a3f1d5e9b0a2c4d6f8e0a1b3c5d7f9e1a3b5c7d9f1a3=='
            algorithm='SM2'
            verified={true}
            copyable
          />
        </div>
        <div class='p-4 rounded-xl border-2 border-error/20 bg-error/5'>
          <p class='text-xs font-semibold text-error mb-3'>SM2 - 验证失败</p>
          <SignatureDisplay
            signature='MEQCIB2d4f6a8c0e2a4b6c8d0f2a4b6c8d0e2a4b6c8d0f2a4b6c8d0e=='
            algorithm='SM2'
            verified={false}
            copyable
          />
        </div>
        <div class='p-4 rounded-xl border-2 border-base-300 bg-base-200/30'>
          <p class='text-xs font-semibold text-base-content/50 mb-3'>SM2 - 未验证</p>
          <SignatureDisplay
            signature='未验证签名示例数据...'
            algorithm='SM2'
            copyable
          />
        </div>
      </div>
    </DemoCard>
  </DemoSection>
</div>
