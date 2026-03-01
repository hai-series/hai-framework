<!--
  场景组件（Scenes）展示
  AI: MarkdownRenderer
  IAM: LoginForm / RegisterForm / ForgotPasswordForm / ResetPasswordForm /
       ChangePasswordForm / PasswordInput / UserProfile
  Storage: FileUpload / FileList / ImageUpload / AvatarUpload
  Crypto: EncryptedInput / HashDisplay / SignatureDisplay
-->
<script lang="ts">
  // FileList 与 DOM 全局类型同名，必须显式导入
  import { FileList, MarkdownRenderer, toast } from '@h-ai/ui'

  // === 状态 ===
  let pwdVal = $state('')
  let encVal = $state('')

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
    "marked": "^15.0.0",
    "highlight.js": "^11.11.0"
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
2. **highlight.js** — 语法高亮
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
</script>

<div class="space-y-10">
  <!-- ====================================================================== -->
  <!-- AI Markdown 渲染                                                       -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4z"/><circle cx="12" cy="14" r="2"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">AI — Markdown 渲染器</h2>
        <p class="text-sm text-base-content/60">用于渲染 AI 输出的 Markdown 内容，支持代码高亮、复制、表格等</p>
      </div>
      <Badge variant="primary" outline size="sm">1 组件</Badge>
    </div>

    <!-- AI 对话场景 -->
    <Card bordered class="mb-6">
      <div class="flex items-center gap-2 mb-5">
        <Badge variant="info" size="sm">MarkdownRenderer</Badge>
        <span class="text-sm text-base-content/60">AI 对话回复示例</span>
      </div>
      <div class="bg-base-200/30 rounded-xl p-6">
        <div class="flex gap-3">
          <div class="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content text-sm font-bold">AI</div>
          <div class="flex-1 min-w-0">
            <MarkdownRenderer content={aiResponseMarkdown} />
          </div>
        </div>
      </div>
    </Card>

    <!-- 全功能演示 -->
    <Card bordered>
      <div class="flex items-center gap-2 mb-5">
        <Badge variant="success" size="sm">全功能演示</Badge>
        <span class="text-sm text-base-content/60">展示所有支持的 Markdown 语法元素</span>
      </div>
      <MarkdownRenderer content={demoMarkdown} />
    </Card>
  </section>

  <!-- ====================================================================== -->
  <!-- IAM 身份认证                                                           -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">IAM 身份认证</h2>
        <p class="text-sm text-base-content/60">登录注册、密码管理、用户资料等完整身份流程组件</p>
      </div>
      <Badge variant="primary" outline size="sm">7 组件</Badge>
    </div>

    <!-- 登录 / 注册 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="info" size="sm">LoginForm</Badge>
          <span class="text-sm text-base-content/60">用户登录表单</span>
        </div>
        <div class="flex justify-center">
          <div class="w-full max-w-sm">
            <LoginForm
              showTitle
              showRememberMe
              showForgotPassword
              showRegisterLink
              onsubmit={async (data) => { toast.success(`登录: ${data.username}`) }}
            />
          </div>
        </div>
      </Card>

      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="info" size="sm">RegisterForm</Badge>
          <span class="text-sm text-base-content/60">用户注册表单</span>
        </div>
        <div class="flex justify-center">
          <div class="w-full max-w-sm">
            <RegisterForm
              showTitle
              showLoginLink
              showPasswordStrength
              onsubmit={async (data) => { toast.success(`注册: ${data.username ?? data.email ?? ''}`) }}
            />
          </div>
        </div>
      </Card>
    </div>

    <!-- 密码管理 -->
    <Card bordered>
      <div class="flex items-center gap-2 mb-6">
        <Badge variant="warning" size="sm">密码管理</Badge>
        <span class="text-sm text-base-content/60">忘记密码 / 重置密码 / 修改密码</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="p-4 rounded-xl bg-base-200/50 border border-base-300">
          <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">ForgotPasswordForm</p>
          <ForgotPasswordForm
            showTitle
            showDescription
            showBackLink
            onsubmit={async () => { toast.info('重置邮件已发送') }}
          />
        </div>
        <div class="p-4 rounded-xl bg-base-200/50 border border-base-300">
          <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">ResetPasswordForm</p>
          <ResetPasswordForm
            showTitle
            showDescription
            showCode
            showPasswordStrength
            onsubmit={async () => { toast.success('密码已重置') }}
          />
        </div>
        <div class="p-4 rounded-xl bg-base-200/50 border border-base-300">
          <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">ChangePasswordForm</p>
          <ChangePasswordForm
            requireOldPassword
            showPasswordStrength
            onsubmit={async () => { toast.success('密码已修改') }}
          />
        </div>
      </div>
    </Card>

    <!-- PasswordInput / UserProfile -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="secondary" size="sm">PasswordInput</Badge>
          <span class="text-sm text-base-content/60">密码输入框组件</span>
        </div>
        <div class="space-y-5">
          <div class="p-4 rounded-lg bg-base-200/30">
            <p class="text-xs font-medium text-base-content/50 mb-2">含强度指示器</p>
            <PasswordInput bind:value={pwdVal} showToggle showStrength placeholder="请输入密码" />
            <p class="text-xs text-base-content/40 mt-2">已输入 {pwdVal.length} 字符</p>
          </div>
          <div class="p-4 rounded-lg bg-base-200/30">
            <p class="text-xs font-medium text-base-content/50 mb-2">基础模式</p>
            <PasswordInput placeholder="仅密码可见性切换" showToggle />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-4 rounded-lg bg-base-200/30">
              <p class="text-xs font-medium text-base-content/50 mb-2">禁用状态</p>
              <PasswordInput value="disabled" disabled />
            </div>
            <div class="p-4 rounded-lg bg-base-200/30">
              <p class="text-xs font-medium text-base-content/50 mb-2">错误状态</p>
              <PasswordInput value="short" error="密码长度不足 8 位" showToggle />
            </div>
          </div>
        </div>
      </Card>

      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="secondary" size="sm">UserProfile</Badge>
          <span class="text-sm text-base-content/60">用户资料编辑</span>
        </div>
        <UserProfile
          user={demoUser}
          editable
          onsubmit={async () => { toast.success('资料已更新') }}
        />
      </Card>
    </div>
  </section>

  <!-- 分隔线 -->
  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- Storage 文件存储                                                        -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-success/10 text-success">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">Storage 文件存储</h2>
        <p class="text-sm text-base-content/60">文件上传、列表管理、图片与头像上传组件</p>
      </div>
      <Badge variant="success" outline size="sm">4 组件</Badge>
    </div>

    <!-- 文件上传 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="info" size="sm">FileUpload</Badge>
          <span class="text-sm text-base-content/60">多文件拖拽上传</span>
        </div>
        <FileUpload
          accept="image/*,.pdf,.doc,.docx"
          maxFiles={5}
          multiple
          dragDrop
          autoUpload={false}
        />
      </Card>
      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="info" size="sm">FileUpload</Badge>
          <span class="text-sm text-base-content/60">单文件上传</span>
        </div>
        <FileUpload
          accept="image/*"
          maxFiles={1}
          dragDrop
          autoUpload={false}
        />
      </Card>
    </div>

    <!-- 文件列表 -->
    <Card bordered>
      <div class="flex items-center gap-2 mb-5">
        <Badge variant="info" size="sm">FileList</Badge>
        <span class="text-sm text-base-content/60">文件列表展示与操作</span>
      </div>
      <div class="space-y-6">
        <div>
          <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">列表布局</p>
          <FileList
            files={demoFiles}
            showPreview
            showDownload
            showDelete
            showSize
            layout="list"
            ondownload={(f) => toast.info(`下载: ${f.name}`)}
            ondelete={(f) => toast.warning(`删除: ${f.name}`)}
          />
        </div>
        <div class="divider my-2"></div>
        <div>
          <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">网格布局</p>
          <FileList
            files={demoFiles.slice(0, 3)}
            showPreview
            showDownload
            showDelete
            layout="grid"
            ondownload={(f) => toast.info(`下载: ${f.name}`)}
            ondelete={(f) => toast.warning(`删除: ${f.name}`)}
          />
        </div>
        <div class="divider my-2"></div>
        <div>
          <p class="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">加载状态</p>
          <FileList files={[]} loading layout="list" />
        </div>
      </div>
    </Card>

    <!-- 图片/头像上传 -->
    <Card bordered class="mt-6">
      <div class="flex items-center gap-2 mb-5">
        <Badge variant="info" size="sm">ImageUpload / AvatarUpload</Badge>
        <span class="text-sm text-base-content/60">图片与头像上传</span>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="flex flex-col items-center gap-3">
          <ImageUpload accept="image/*" width="180px" height="180px" />
          <p class="text-xs text-base-content/50">正方形图片</p>
        </div>
        <div class="flex flex-col items-center gap-3">
          <ImageUpload accept="image/*" width="280px" height="158px" aspectRatio="16:9" />
          <p class="text-xs text-base-content/50">16:9 比例</p>
        </div>
        <div class="flex flex-col items-center gap-3">
          <AvatarUpload size="lg" fallback="张" />
          <p class="text-xs text-base-content/50">头像（大）</p>
        </div>
        <div class="flex flex-col items-center gap-3">
          <AvatarUpload size="md" fallback="李" />
          <p class="text-xs text-base-content/50">头像（中）</p>
        </div>
      </div>
    </Card>
  </section>

  <!-- 分隔线 -->
  <div class="divider"></div>

  <!-- ====================================================================== -->
  <!-- Crypto 加密安全                                                         -->
  <!-- ====================================================================== -->
  <section>
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-error/10 text-error">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <div>
        <h2 class="text-xl font-bold">Crypto 加密安全</h2>
        <p class="text-sm text-base-content/60">加密输入、哈希展示、数字签名验证组件</p>
      </div>
      <Badge variant="error" outline size="sm">3 组件</Badge>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- EncryptedInput -->
      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="warning" size="sm">EncryptedInput</Badge>
          <span class="text-sm text-base-content/60">加密输入框</span>
        </div>
        <div class="space-y-4">
          <div class="p-4 rounded-lg bg-base-200/30">
            <p class="text-xs font-medium text-base-content/50 mb-2">AES-256 加密</p>
            <EncryptedInput bind:value={encVal} algorithm="AES-256" placeholder="输入敏感数据" />
          </div>
          <div class="p-4 rounded-lg bg-base-200/30">
            <p class="text-xs font-medium text-base-content/50 mb-2">SM4 国密算法（禁用）</p>
            <EncryptedInput placeholder="SM4 国密算法" algorithm="SM4" disabled />
          </div>
        </div>
      </Card>

      <!-- HashDisplay -->
      <Card bordered>
        <div class="flex items-center gap-2 mb-5">
          <Badge variant="warning" size="sm">HashDisplay</Badge>
          <span class="text-sm text-base-content/60">哈希值展示</span>
        </div>
        <div class="space-y-4">
          <div class="p-4 rounded-lg bg-base-200/30">
            <HashDisplay value="e3b0c44298fc1c149afbf4c8996fb924" algorithm="SHA256" label="文件哈希" copyable truncate />
          </div>
          <div class="p-4 rounded-lg bg-base-200/30">
            <HashDisplay value="a1b2c3d4e5f60718293a4b5c6d7e8f90" algorithm="SM3" label="SM3 摘要" copyable />
          </div>
        </div>
      </Card>
    </div>

    <!-- SignatureDisplay -->
    <Card bordered class="mt-6">
      <div class="flex items-center gap-2 mb-5">
        <Badge variant="warning" size="sm">SignatureDisplay</Badge>
        <span class="text-sm text-base-content/60">数字签名验证展示</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-4 rounded-xl border-2 border-success/20 bg-success/5">
          <p class="text-xs font-semibold text-success mb-3">ECDSA - 验证通过</p>
          <SignatureDisplay
            signature="MEUCIQDf4b2e8c7a3f1d5e9b0a2c4d6f8e0a1b3c5d7f9e1a3b5c7d9f1a3=="
            algorithm="ECDSA"
            verified={true}
            copyable
          />
        </div>
        <div class="p-4 rounded-xl border-2 border-error/20 bg-error/5">
          <p class="text-xs font-semibold text-error mb-3">SM2 - 验证失败</p>
          <SignatureDisplay
            signature="MEQCIB2d4f6a8c0e2a4b6c8d0f2a4b6c8d0e2a4b6c8d0f2a4b6c8d0e=="
            algorithm="SM2"
            verified={false}
            copyable
          />
        </div>
        <div class="p-4 rounded-xl border-2 border-base-300 bg-base-200/30">
          <p class="text-xs font-semibold text-base-content/50 mb-3">RSA - 未验证</p>
          <SignatureDisplay
            signature="未验证签名示例数据..."
            algorithm="RSA"
            copyable
          />
        </div>
      </div>
    </Card>
  </section>
</div>
