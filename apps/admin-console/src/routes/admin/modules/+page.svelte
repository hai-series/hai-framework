<!--
  模块功能示例页面 - 展示 hai-framework 各后端模块的使用方式
-->
<script lang="ts">
  import { toast } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages'

  let activeTab = $state('core')
  const tabs = $derived([
    { key: 'core', label: m.modules_tab_core() },
    { key: 'db', label: m.modules_tab_db() },
    { key: 'cache', label: m.modules_tab_cache() },
    { key: 'storage', label: m.modules_tab_storage() },
    { key: 'ai', label: m.modules_tab_ai() },
    { key: 'crypto', label: m.modules_tab_crypto() },
  ])

  // Core 示例数据
  const coreFeatures = [
    { name: '配置管理', desc: '基于 YAML 配置文件，支持多环境覆盖', api: 'core.config.get(key)' },
    { name: '日志系统', desc: '结构化日志，支持 info/warn/error 级别', api: 'core.logger.info(msg, meta)' },
    { name: 'i18n 国际化', desc: '多语言支持，运行时切换', api: 'core.i18n.setLocale(locale)' },
    { name: '模块生命周期', desc: '统一 init/close 模式', api: 'core.init(config)' },
  ]

  // DB 示例数据
  const dbExamples = [
    { op: 'CREATE TABLE', sql: 'CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE\n)', desc: '创建用户表' },
    { op: 'INSERT', sql: "INSERT INTO users (name, email)\nVALUES ('张三', 'zhang@example.com')", desc: '插入数据' },
    { op: 'SELECT', sql: "SELECT * FROM users WHERE name LIKE '%张%'", desc: '查询数据' },
    { op: 'TRANSACTION', sql: 'await db.transaction(async (tx) => {\n  await tx.insert(users).values(...)\n  await tx.update(accounts)...\n})', desc: '事务处理' },
  ]

  // Cache 示例
  const cacheOps = [
    { op: 'SET', code: "await cache.set('user:1', userData, { ttl: 3600 })", desc: '设置缓存（1小时过期）' },
    { op: 'GET', code: "const user = await cache.get('user:1')", desc: '获取缓存' },
    { op: 'DELETE', code: "await cache.delete('user:1')", desc: '删除缓存' },
    { op: 'CLEAR', code: "await cache.clear()", desc: '清除所有缓存' },
  ]

  // Storage 示例
  const storageOps = [
    { op: '上传文件', code: "await storage.upload('docs/report.pdf', fileBuffer)", desc: '上传文件到存储' },
    { op: '下载文件', code: "const file = await storage.download('docs/report.pdf')", desc: '下载文件' },
    { op: '签名URL', code: "await storage.presign('docs/report.pdf', { expires: 3600 })", desc: '生成预签名访问 URL' },
    { op: '列出文件', code: "const files = await storage.list('docs/')", desc: '列出目录下所有文件' },
  ]

  // AI 示例
  const aiFeatures = [
    { name: '文本生成', desc: '基于 LLM 的文本补全与对话', api: 'ai.chat({ messages: [...] })' },
    { name: '嵌入向量', desc: '文本向量化，用于语义搜索', api: 'ai.embed(text)' },
    { name: '多模型支持', desc: '支持 OpenAI / Azure / 本地模型', api: 'ai.init({ provider, model })' },
    { name: '流式输出', desc: '服务端流式返回生成结果', api: 'ai.stream({ messages: [...] })' },
  ]

  // Crypto 示例状态
  let plainText = $state('Hello, hai-framework!')
  let hashResult = $state('')
  let encryptResult = $state('')

  function mockHash() {
    // 模拟 SM3 哈希
    const hash = Array.from(
      { length: 64 },
      () => '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('')
    hashResult = hash
    toast.success('SM3 哈希计算完成')
  }

  function mockEncrypt() {
    // 模拟 SM4 加密
    const encrypted = btoa(unescape(encodeURIComponent(plainText))).replace(/=/g, '') + Array.from(
      { length: 8 },
      () => '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('')
    encryptResult = encrypted
    toast.success('SM4 加密完成')
  }
</script>

<svelte:head>
  <title>{m.modules_title()} - {m.app_title()}</title>
</svelte:head>

<ToastContainer />

<div class="space-y-4">
  <PageHeader title={m.modules_title()} description={m.modules_desc()} />

  <div role="tablist" class="tabs tabs-box">
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        class="tab {activeTab === tab.key ? 'tab-active' : ''}"
        onclick={() => activeTab = tab.key}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- ===== Core 核心 ===== -->
  {#if activeTab === 'core'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-2">@h-ai/core — 核心基础模块</h3>
        <p class="text-base-content/60 text-sm mb-4">
          提供配置管理、日志、i18n、模块生命周期等基础能力，是所有模块的公共依赖。
        </p>
        <Alert variant="info">core 模块在应用启动时通过 <code class="font-mono">core.init(config)</code> 初始化，所有其他模块均依赖 core 提供的配置与日志。</Alert>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-4">核心功能</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each coreFeatures as feature}
            <div class="p-4 rounded-lg bg-base-200">
              <div class="flex items-center gap-2 mb-2">
                <Badge variant="primary">{feature.name}</Badge>
              </div>
              <p class="text-sm text-base-content/70 mb-2">{feature.desc}</p>
              <code class="text-xs bg-base-300 px-2 py-1 rounded font-mono block">{feature.api}</code>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-3">初始化示例</h3>
        <pre class="bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono"><code>{`import { core } from '@h-ai/core'

// 加载 YAML 配置并初始化
await core.init({
  configDir: './config',  // 配置文件目录
  env: 'development',     // 运行环境
})

// 使用配置
const dbConfig = core.config.get('db')

// 使用日志
core.logger.info('Application started', { port: 3000 })

// 切换语言
core.i18n.setLocale('en-US')

// 关闭时清理资源
await core.close()`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== DB 数据库 ===== -->
  {#if activeTab === 'db'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-2">@h-ai/db — 数据库模块</h3>
        <p class="text-base-content/60 text-sm mb-4">
          支持 SQLite、PostgreSQL、MySQL，提供统一且类型安全的数据库操作能力。
        </p>
        <div class="flex gap-2 mb-4">
          <Badge variant="success">SQLite</Badge>
          <Badge variant="info">PostgreSQL</Badge>
          <Badge variant="warning">MySQL</Badge>
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-4">SQL 操作示例</h3>
        <div class="space-y-4">
          {#each dbExamples as example}
            <div class="bg-base-200/50 rounded-lg overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2 bg-base-200">
                <Badge size="sm">{example.op}</Badge>
                <span class="text-sm text-base-content/70">{example.desc}</span>
              </div>
              <pre class="p-4 text-sm overflow-x-auto font-mono"><code>{example.sql}</code></pre>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-3">数据库操作示例</h3>
        <pre class="bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono"><code>{`import { db } from '@h-ai/db'

// 定义 Schema
const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// CRUD 操作
const allUsers = await db.select().from(users)
await db.insert(users).values({ name: '张三', email: 'z@test.com' })
await db.update(users).set({ name: '李四' }).where(eq(users.id, 1))
await db.delete(users).where(eq(users.id, 1))

// 分页查询
const page = await db.select().from(users).limit(10).offset(0)`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== Cache 缓存 ===== -->
  {#if activeTab === 'cache'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-2">@h-ai/cache — 缓存模块</h3>
        <p class="text-base-content/60 text-sm mb-4">
          提供统一的缓存接口，支持内存缓存和 Redis 缓存，自动过期与命名空间隔离。
        </p>
        <div class="flex gap-2">
          <Badge variant="success">Memory</Badge>
          <Badge variant="error">Redis</Badge>
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-4">缓存操作</h3>
        <div class="space-y-3">
          {#each cacheOps as op}
            <div class="flex items-start gap-4 p-4 bg-base-200 rounded-lg">
              <Badge variant="primary" size="sm" class="shrink-0 mt-0.5">{op.op}</Badge>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-base-content/70 mb-1">{op.desc}</p>
                <code class="text-xs font-mono block overflow-x-auto">{op.code}</code>
              </div>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-3">初始化与使用</h3>
        <pre class="bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono"><code>{`import { cache } from '@h-ai/cache'

// 初始化 (内存缓存)
await cache.init({ provider: 'memory' })

// 初始化 (Redis)
await cache.init({
  provider: 'redis',
  redis: { url: 'redis://localhost:6379' },
})

// 使用命名空间
const userCache = cache.namespace('users')
await userCache.set('profile:1', userData)

// 批量操作
await cache.mset([
  { key: 'a', value: 1 },
  { key: 'b', value: 2 },
])

// 关闭
await cache.close()`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== Storage 存储 ===== -->
  {#if activeTab === 'storage'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-2">@h-ai/storage — 存储模块</h3>
        <p class="text-base-content/60 text-sm mb-4">
          统一文件存储接口，支持本地文件系统和 S3 兼容存储（AWS S3、MinIO、阿里云 OSS 等）。
        </p>
        <div class="flex gap-2">
          <Badge variant="success">Local</Badge>
          <Badge variant="info">S3</Badge>
          <Badge>MinIO</Badge>
          <Badge>OSS</Badge>
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-4">存储操作</h3>
        <div class="space-y-3">
          {#each storageOps as op}
            <div class="flex items-start gap-4 p-4 bg-base-200 rounded-lg">
              <Badge variant="secondary" size="sm" class="shrink-0 mt-0.5">{op.op}</Badge>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-base-content/70 mb-1">{op.desc}</p>
                <code class="text-xs font-mono block overflow-x-auto">{op.code}</code>
              </div>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-3">初始化与配置</h3>
        <pre class="bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono"><code>{`import { storage } from '@h-ai/storage'

// 本地存储
await storage.init({
  provider: 'local',
  local: { rootDir: './uploads' },
})

// S3 存储
await storage.init({
  provider: 's3',
  s3: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.HAI_STORAGE_S3_ACCESS_KEY,
    secretAccessKey: process.env.HAI_STORAGE_S3_SECRET_KEY,
  },
})

// 上传与预签名
const key = await storage.upload('avatars/user1.jpg', buffer)
const url = await storage.presign(key, { expires: 3600 })`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== AI 智能 ===== -->
  {#if activeTab === 'ai'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-2">@h-ai/ai — AI 智能模块</h3>
        <p class="text-base-content/60 text-sm mb-4">
          统一的 AI 接口层，支持多种 LLM 提供商，提供对话、嵌入、流式输出等能力。
        </p>
        <div class="flex gap-2">
          <Badge variant="info">OpenAI</Badge>
          <Badge variant="success">Azure</Badge>
          <Badge variant="warning">本地模型</Badge>
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-4">AI 能力矩阵</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each aiFeatures as feature}
            <div class="p-4 rounded-lg bg-base-200/50">
              <h4 class="font-medium text-base-content mb-1">{feature.name}</h4>
              <p class="text-sm text-base-content/60 mb-2">{feature.desc}</p>
              <code class="text-xs bg-base-200 px-2 py-1 rounded font-mono">{feature.api}</code>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-3">使用示例</h3>
        <pre class="bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono"><code>{`import { ai } from '@h-ai/ai'

// 初始化
await ai.init({
  provider: 'openai',
  apiKey: process.env.HAI_OPENAI_API_KEY,
  model: 'gpt-4',
})

// 对话
const response = await ai.chat({
  messages: [
    { role: 'system', content: '你是一个有帮助的助手' },
    { role: 'user', content: '你好！' },
  ],
})

// 流式输出
const stream = await ai.stream({
  messages: [{ role: 'user', content: '写一首诗' }],
})
for await (const chunk of stream) {
  process.stdout.write(chunk)
}

// 文本嵌入
const embedding = await ai.embed('搜索查询文本')`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== Crypto 加密 ===== -->
  {#if activeTab === 'crypto'}
    <div class="grid gap-6">
      <Card>
        <h3 class="text-lg font-semibold mb-2">@h-ai/crypto — 加密模块</h3>
        <p class="text-base-content/60 text-sm mb-4">
          国密算法支持（SM2/SM3/SM4），提供哈希、对称加密、非对称加密与数字签名。
        </p>
        <div class="flex gap-2">
          <Badge variant="error">SM2 非对称</Badge>
          <Badge variant="warning">SM3 哈希</Badge>
          <Badge variant="success">SM4 对称</Badge>
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-4">在线体验</h3>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium mb-1 block" for="crypto-plain">明文输入</label>
            <Input id="crypto-plain" bind:value={plainText} placeholder="输入要处理的文本" />
          </div>
          <div class="flex gap-3">
            <Button variant="warning" onclick={mockHash}>SM3 哈希</Button>
            <Button variant="success" onclick={mockEncrypt}>SM4 加密</Button>
          </div>
          {#if hashResult}
            <div class="p-3 bg-base-200 rounded-lg">
              <p class="text-xs text-base-content/60 mb-1">SM3 哈希结果：</p>
              <code class="text-xs font-mono break-all">{hashResult}</code>
            </div>
          {/if}
          {#if encryptResult}
            <div class="p-3 bg-base-200 rounded-lg">
              <p class="text-xs text-base-content/60 mb-1">SM4 加密结果：</p>
              <code class="text-xs font-mono break-all">{encryptResult}</code>
            </div>
          {/if}
        </div>
      </Card>
      <Card>
        <h3 class="text-lg font-semibold mb-3">使用示例</h3>
        <pre class="bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono"><code>{`import { crypto } from '@h-ai/crypto'

// 初始化
await crypto.init()

// SM3 哈希
const hash = crypto.sm3.hash('Hello World')

// SM4 对称加密
const key = crypto.sm4.generateKey()
const encrypted = crypto.sm4.encrypt('敏感数据', key)
const decrypted = crypto.sm4.decrypt(encrypted, key)

// SM2 非对称加密
const keypair = crypto.sm2.generateKeyPair()
const ciphertext = crypto.sm2.encrypt('数据', keypair.publicKey)
const plaintext = crypto.sm2.decrypt(ciphertext, keypair.privateKey)

// SM2 数字签名
const signature = crypto.sm2.sign('数据', keypair.privateKey)
const isValid = crypto.sm2.verify('数据', signature, keypair.publicKey)`}</code></pre>
      </Card>
    </div>
  {/if}
</div>
