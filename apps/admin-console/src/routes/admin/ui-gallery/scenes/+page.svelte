<!--
  场景组件（Scenes）展示
  IAM: LoginForm / RegisterForm / ForgotPasswordForm / ResetPasswordForm /
       ChangePasswordForm / PasswordInput / UserProfile
  Storage: FileUpload / FileList / ImageUpload / AvatarUpload
  Crypto: EncryptedInput / HashDisplay / SignatureDisplay
-->
<script lang="ts">
  // FileList 与 DOM 全局类型同名，必须显式导入
  import { FileList, toast } from '@h-ai/ui'

  // === 状态 ===
  let pwdVal = $state('')
  let encVal = $state('')

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
