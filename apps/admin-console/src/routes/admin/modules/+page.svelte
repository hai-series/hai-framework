<!--
  模块功能示例页面 - 展示 hai-framework 各后端模块的使用方式
-->
<script lang='ts'>
  import * as m from '$lib/paraglide/messages'
  import { toast } from '@h-ai/ui'

  let activeTab = $state('core')
  const tabs = $derived([
    { key: 'core', label: m.modules_tab_core() },
    { key: 'db', label: m.modules_tab_db() },
    { key: 'cache', label: m.modules_tab_cache() },
    { key: 'storage', label: m.modules_tab_storage() },
    { key: 'ai', label: m.modules_tab_ai() },
    { key: 'vecdb', label: m.modules_tab_vecdb() },
    { key: 'datapipe', label: m.modules_tab_datapipe() },
    { key: 'crypto', label: m.modules_tab_crypto() },
  ])

  // Core 示例数据
  const coreFeatures = $derived([
    { name: m.modules_core_feat_config_name(), desc: m.modules_core_feat_config_desc(), api: 'core.config.get(key)' },
    { name: m.modules_core_feat_log_name(), desc: m.modules_core_feat_log_desc(), api: 'core.logger.info(msg, meta)' },
    { name: m.modules_core_feat_i18n_name(), desc: m.modules_core_feat_i18n_desc(), api: 'core.i18n.setGlobalLocale(locale)' },
    { name: m.modules_core_feat_lifecycle_name(), desc: m.modules_core_feat_lifecycle_desc(), api: 'core.init(config)' },
  ])

  // DB 示例数据
  const dbExamples = $derived([
    { op: 'CREATE TABLE', sql: 'CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE\n)', desc: m.modules_db_op_create_desc() },
    { op: 'INSERT', sql: 'INSERT INTO users (name, email)\nVALUES (\'张三\', \'zhang@example.com\')', desc: m.modules_db_op_insert_desc() },
    { op: 'SELECT', sql: 'SELECT * FROM users WHERE name LIKE \'%张%\'', desc: m.modules_db_op_select_desc() },
    { op: 'TRANSACTION', sql: 'await reldb.tx.wrap(async (tx) => {\n  await tx.execute(\'INSERT INTO users (name, email) VALUES (?, ?)\', [\'张三\', \'zhang@example.com\'])\n  return await tx.get(\'SELECT * FROM users WHERE email = ?\', [\'zhang@example.com\'])\n})', desc: m.modules_db_op_tx_desc() },
  ])

  // Cache 示例
  const cacheOps = $derived([
    { op: 'SET', code: 'await cache.kv.set(\'user:1\', userData, { ex: 3600 })', desc: m.modules_cache_op_set_desc() },
    { op: 'GET', code: 'const user = await cache.kv.get<User>(\'user:1\')', desc: m.modules_cache_op_get_desc() },
    { op: 'DELETE', code: 'await cache.kv.del(\'user:1\')', desc: m.modules_cache_op_delete_desc() },
    { op: 'SCAN', code: 'const [cursor, keys] = (await cache.kv.scan(0, { match: \'user:*\', count: 100 })).data', desc: m.modules_cache_op_clear_desc() },
  ])

  // Storage 示例
  const storageOps = $derived([
    { op: m.modules_storage_op_upload(), code: 'await storage.file.put(\'docs/report.pdf\', fileBuffer)', desc: m.modules_storage_op_upload_desc() },
    { op: m.modules_storage_op_download(), code: 'const file = await storage.file.get(\'docs/report.pdf\')', desc: m.modules_storage_op_download_desc() },
    { op: m.modules_storage_op_presign(), code: 'await storage.presign.getUrl(\'docs/report.pdf\', { expiresIn: 3600 })', desc: m.modules_storage_op_presign_desc() },
    { op: m.modules_storage_op_list(), code: 'const files = await storage.dir.list({ prefix: \'docs/\' })', desc: m.modules_storage_op_list_desc() },
  ])

  // AI 示例
  const aiFeatures = $derived([
    { name: m.modules_ai_feat_chat_name(), desc: m.modules_ai_feat_chat_desc(), api: 'ai.llm.chat({ messages: [...] })' },
    { name: m.modules_ai_feat_embed_name(), desc: m.modules_ai_feat_embed_desc(), api: 'ai.embedding.embed({ input: text })' },
    { name: m.modules_ai_feat_multi_name(), desc: m.modules_ai_feat_multi_desc(), api: 'ai.init({ llm: { provider, model } })' },
    { name: m.modules_ai_feat_stream_name(), desc: m.modules_ai_feat_stream_desc(), api: 'ai.llm.chatStream({ messages: [...] })' },
    { name: m.modules_ai_feat_image_name(), desc: m.modules_ai_feat_image_desc(), api: 'ai.image.generate({ prompt, size })' },
  ])

  // VecDB 示例
  const vecdbFeatures = $derived([
    { name: m.modules_vecdb_feat_create_name(), desc: m.modules_vecdb_feat_create_desc(), api: 'vecdb.collection.create(name, { dimension })' },
    { name: m.modules_vecdb_feat_insert_name(), desc: m.modules_vecdb_feat_insert_desc(), api: 'vecdb.vector.insert(collection, docs)' },
    { name: m.modules_vecdb_feat_search_name(), desc: m.modules_vecdb_feat_search_desc(), api: 'vecdb.vector.search(collection, query, { topK })' },
    { name: m.modules_vecdb_feat_drop_name(), desc: m.modules_vecdb_feat_drop_desc(), api: 'vecdb.collection.drop(name)' },
  ])

  const vecdbOps = $derived([
    { op: m.modules_vecdb_op_create(), code: 'await vecdb.collection.create(\'docs\', { dimension: 1536 })', desc: m.modules_vecdb_op_create_desc() },
    { op: m.modules_vecdb_op_insert(), code: 'await vecdb.vector.insert(\'docs\', [{ id: \'1\', vector: embedding, metadata: { title: \'文档标题\' } }])', desc: m.modules_vecdb_op_insert_desc() },
    { op: m.modules_vecdb_op_search(), code: 'const results = await vecdb.vector.search(\'docs\', queryVector, { topK: 5 })', desc: m.modules_vecdb_op_search_desc() },
    { op: m.modules_vecdb_op_delete(), code: 'await vecdb.vector.delete(\'docs\', [\'1\', \'2\'])', desc: m.modules_vecdb_op_delete_desc() },
  ])

  // DataPipe 示例
  const datapipeFeatures = $derived([
    { name: m.modules_datapipe_feat_clean_name(), desc: m.modules_datapipe_feat_clean_desc(), api: 'datapipe.clean(text, options)' },
    { name: m.modules_datapipe_feat_chunk_name(), desc: m.modules_datapipe_feat_chunk_desc(), api: 'datapipe.chunk(text, options)' },
    { name: m.modules_datapipe_feat_pipe_name(), desc: m.modules_datapipe_feat_pipe_desc(), api: 'datapipe.pipeline().clean(...).chunk(...).run(input)' },
  ])

  const datapipeOps = $derived([
    { op: 'Clean', code: 'const cleaned = datapipe.clean(htmlContent, {\n  removeHtml: true,\n  normalizeWhitespace: true,\n  removeUrls: true,\n})', desc: m.modules_datapipe_op_clean_desc() },
    { op: 'Chunk', code: 'const chunks = datapipe.chunk(longText, {\n  mode: \'paragraph\',\n  maxSize: 1000,\n  overlap: 200,\n})', desc: m.modules_datapipe_op_chunk_desc() },
    { op: 'Pipeline', code: 'const result = await datapipe.pipeline()\n  .clean({ removeHtml: true })\n  .chunk({ mode: \'paragraph\', maxSize: 500 })\n  .run(rawContent)', desc: m.modules_datapipe_op_pipe_desc() },
  ])

  // Crypto 示例状态
  let plainText = $state('Hello, hai-framework!')
  let hashResult = $state('')
  let encryptResult = $state('')

  function mockHash() {
    // 模拟哈希摘要
    const hash = Array.from(
      { length: 64 },
      () => '0123456789abcdef'[Math.floor(Math.random() * 16)],
    ).join('')
    hashResult = hash
    toast.success(m.modules_crypto_hash_complete())
  }

  function mockEncrypt() {
    // 模拟对称加密输出
    const encrypted = btoa(unescape(encodeURIComponent(plainText))).replace(/=/g, '') + Array.from(
      { length: 8 },
      () => '0123456789abcdef'[Math.floor(Math.random() * 16)],
    ).join('')
    encryptResult = encrypted
    toast.success(m.modules_crypto_encrypt_complete())
  }
</script>

<svelte:head>
  <title>{m.modules_title()} - {m.app_title()}</title>
</svelte:head>

<ToastContainer />

<div class='space-y-4'>
  <PageHeader title={m.modules_title()} description={m.modules_desc()} />

  <div role='tablist' class='tabs tabs-box'>
    {#each tabs as tab (tab.key)}
      <button
        type='button'
        role='tab'
        class="tab {activeTab === tab.key ? 'tab-active' : ''}"
        onclick={() => activeTab = tab.key}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- ===== Core 核心 ===== -->
  {#if activeTab === 'core'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/core — {m.modules_core_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_core_description()}
        </p>
        <Alert variant='info'>{m.modules_core_info()}</Alert>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_core_features_title()}</h3>
        <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {#each coreFeatures as feature (feature.api)}
            <div class='p-4 rounded-lg bg-base-200'>
              <div class='flex items-center gap-2 mb-2'>
                <Badge variant='primary'>{feature.name}</Badge>
              </div>
              <p class='text-sm text-base-content/70 mb-2'>{feature.desc}</p>
              <code class='text-xs bg-base-300 px-2 py-1 rounded font-mono block'>{feature.api}</code>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_core_init_example()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { core } from '@h-ai/core'

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
core.i18n.setGlobalLocale('en-US')

// 关闭时清理资源
await core.close()`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== DB 数据库 ===== -->
  {#if activeTab === 'db'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/reldb — {m.modules_db_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_db_description()}
        </p>
        <div class='flex gap-2 mb-4'>
          <Badge variant='success'>SQLite</Badge>
          <Badge variant='info'>PostgreSQL</Badge>
          <Badge variant='warning'>MySQL</Badge>
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_db_sql_title()}</h3>
        <div class='space-y-4'>
          {#each dbExamples as example (example.op)}
            <div class='bg-base-200/50 rounded-lg overflow-hidden'>
              <div class='flex items-center gap-2 px-4 py-2 bg-base-200'>
                <Badge size='sm'>{example.op}</Badge>
                <span class='text-sm text-base-content/70'>{example.desc}</span>
              </div>
              <pre class='p-4 text-sm overflow-x-auto font-mono'><code>{example.sql}</code></pre>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_db_crud_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { reldb } from '@h-ai/reldb'

await reldb.init({ type: 'sqlite', database: './data/app.db' })

await reldb.ddl.createTable('users', {
  id: { type: 'TEXT', primaryKey: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
  created_at: { type: 'TIMESTAMP' },
})

const users = reldb.crud.table({
  table: 'users',
  idColumn: 'id',
  dbType: reldb.config?.type ?? 'sqlite',
})

await users.create({ id: 'u1', name: '张三', email: 'z@test.com' })
const allUsers = await users.findAll({ where: 'name LIKE ?', params: ['%张%'] })
await users.updateById('u1', { name: '李四' })
await users.deleteById('u1')

// 分页查询
const page = await reldb.sql.queryPage({
  sql: 'SELECT * FROM users ORDER BY created_at DESC',
  pagination: { page: 1, pageSize: 10 },
})`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== Cache 缓存 ===== -->
  {#if activeTab === 'cache'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/cache — {m.modules_cache_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_cache_description()}
        </p>
        <div class='flex gap-2'>
          <Badge variant='success'>Memory</Badge>
          <Badge variant='error'>Redis</Badge>
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_cache_ops_title()}</h3>
        <div class='space-y-3'>
          {#each cacheOps as op (op.op)}
            <div class='flex items-start gap-4 p-4 bg-base-200 rounded-lg'>
              <Badge variant='primary' size='sm' class='shrink-0 mt-0.5'>{op.op}</Badge>
              <div class='flex-1 min-w-0'>
                <p class='text-sm text-base-content/70 mb-1'>{op.desc}</p>
                <code class='text-xs font-mono block overflow-x-auto'>{op.code}</code>
              </div>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_cache_init_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { cache } from '@h-ai/cache'

// 初始化 (内存缓存)
await cache.init({ type: 'memory' })

// 初始化 (Redis)
await cache.init({
  type: 'redis',
  url: 'redis://localhost:6379/0',
})

// KV + TTL
await cache.kv.set('users:profile:1', userData, { ex: 3600 })
const profile = await cache.kv.get('users:profile:1')

// Hash / List / Set / SortedSet
await cache.hash.hset('users:1', { name: '张三', age: 18 })
await cache.list.rpush('jobs', { id: 'job-1' })
await cache.set_.sadd('tags', 'ai', 'svelte')
await cache.zset.zadd('rank', { member: 'player-1', score: 100 })

// 批量操作
await cache.kv.mset([['a', 1], ['b', 2]])

// 关闭
await cache.close()`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== Storage 存储 ===== -->
  {#if activeTab === 'storage'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/storage — {m.modules_storage_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_storage_description()}
        </p>
        <div class='flex gap-2'>
          <Badge variant='success'>Local</Badge>
          <Badge variant='info'>S3</Badge>
          <Badge>MinIO</Badge>
          <Badge>OSS</Badge>
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_storage_ops_title()}</h3>
        <div class='space-y-3'>
          {#each storageOps as op (op.op)}
            <div class='flex items-start gap-4 p-4 bg-base-200 rounded-lg'>
              <Badge variant='secondary' size='sm' class='shrink-0 mt-0.5'>{op.op}</Badge>
              <div class='flex-1 min-w-0'>
                <p class='text-sm text-base-content/70 mb-1'>{op.desc}</p>
                <code class='text-xs font-mono block overflow-x-auto'>{op.code}</code>
              </div>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_storage_init_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { storage } from '@h-ai/storage'

// 本地存储
await storage.init({
  type: 'local',
  root: './uploads',
})

// S3 存储
await storage.init({
  type: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.HAI_STORAGE_S3_ACCESS_KEY,
  secretAccessKey: process.env.HAI_STORAGE_S3_SECRET_KEY,
})

// 上传与预签名
const meta = await storage.file.put('avatars/user1.jpg', buffer, { contentType: 'image/jpeg' })
if (meta.success) {
  const url = await storage.presign.getUrl(meta.data.key, { expiresIn: 3600 })
}`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== AI 智能 ===== -->
  {#if activeTab === 'ai'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/ai — {m.modules_ai_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_ai_description()}
        </p>
        <div class='flex gap-2'>
          <Badge variant='info'>OpenAI</Badge>
          <Badge variant='success'>Gemini</Badge>
          <Badge variant='warning'>Qwen</Badge>
          <Badge>Seedream</Badge>
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_ai_capabilities_title()}</h3>
        <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {#each aiFeatures as feature (feature.api)}
            <div class='p-4 rounded-lg bg-base-200/50'>
              <h4 class='font-medium text-base-content mb-1'>{feature.name}</h4>
              <p class='text-sm text-base-content/60 mb-2'>{feature.desc}</p>
              <code class='text-xs bg-base-200 px-2 py-1 rounded font-mono'>{feature.api}</code>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_ai_example_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { ai } from '@h-ai/ai'

// 初始化
ai.init({
  llm: {
    provider: 'openai',
    apiKey: process.env.HAI_AI_LLM_API_KEY,
    model: 'gpt-4o-mini',
  },
  image: {
    models: [{
      id: 'image',
      provider: 'pollinations',
      model: 'zimage',
      apiKey: process.env.POLLINATIONS_API_KEY,
    }],
    generateModel: 'image',
  },
})

// 对话
const response = await ai.llm.chat({
  messages: [
    { role: 'system', content: '你是一个有帮助的助手' },
    { role: 'user', content: '你好！' },
  ],
})
if (!response.success) throw new Error(response.error.message)

// 流式输出
for await (const chunk of ai.llm.chatStream({
  messages: [{ role: 'user', content: '写一首诗' }],
})) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '')
}

// 文生图（返回标准化图片字节）
const image = await ai.image.generate({
  prompt: '一个正在构建开源框架的机器人',
  size: { width: 1024, height: 1024 },
})

// 文本嵌入
const embedding = await ai.embedding.embedText('搜索查询文本')`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== VecDB 向量数据库 ===== -->
  {#if activeTab === 'vecdb'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/vecdb — {m.modules_vecdb_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_vecdb_description()}
        </p>
        <div class='flex gap-2'>
          <Badge variant='success'>LanceDB</Badge>
          <Badge variant='info'>pgvector</Badge>
          <Badge variant='warning'>Qdrant</Badge>
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_vecdb_capabilities_title()}</h3>
        <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {#each vecdbFeatures as feature (feature.api)}
            <div class='p-4 rounded-lg bg-base-200/50'>
              <h4 class='font-medium text-base-content mb-1'>{feature.name}</h4>
              <p class='text-sm text-base-content/60 mb-2'>{feature.desc}</p>
              <code class='text-xs bg-base-200 px-2 py-1 rounded font-mono'>{feature.api}</code>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_vecdb_ops_title()}</h3>
        <div class='space-y-3'>
          {#each vecdbOps as op (op.op)}
            <div class='flex items-start gap-4 p-4 bg-base-200 rounded-lg'>
              <Badge variant='primary' size='sm' class='shrink-0 mt-0.5'>{op.op}</Badge>
              <div class='flex-1 min-w-0'>
                <p class='text-sm text-base-content/70 mb-1'>{op.desc}</p>
                <code class='text-xs font-mono block overflow-x-auto'>{op.code}</code>
              </div>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_vecdb_rag_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { vecdb } from '@h-ai/vecdb'
import { ai } from '@h-ai/ai'

// 初始化（LanceDB 嵌入式）
await vecdb.init({ type: 'lancedb', path: './data/vecdb' })

// 创建集合
await vecdb.collection.create('knowledge', { dimension: 1536 })

// 文档入库: 嵌入 + 存储
const embedding = await ai.embedding.embedText('hai-framework 是一个 AI 优先的全栈框架')
await vecdb.vector.insert('knowledge', [{
  id: 'doc-1',
  vector: embedding.success ? embedding.data : [],
  content: 'hai-framework 是一个 AI 优先的全栈框架',
  metadata: { title: '框架介绍', source: 'docs' },
}])

// RAG 检索: 查询 → 嵌入 → 搜索
const queryEmbedding = await ai.embedding.embedText('什么是 hai-framework？')
if (!queryEmbedding.success) throw new Error(queryEmbedding.error.message)
const searchResult = await vecdb.vector.search('knowledge', queryEmbedding.data, { topK: 3 })
if (!searchResult.success) throw new Error(searchResult.error.message)

// 将检索结果作为 context 传给 LLM
const context = searchResult.data.map(r => r.content ?? '').join('\\n')
const answer = await ai.llm.chat({
  messages: [
    { role: 'system', content: \`基于以下知识回答:\\n\${context}\` },
    { role: 'user', content: '什么是 hai-framework？' },
  ],
})

// 关闭
await vecdb.close()`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== DataPipe 数据管道 ===== -->
  {#if activeTab === 'datapipe'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/datapipe — {m.modules_datapipe_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_datapipe_description()}
        </p>
        <div class='flex gap-2'>
          <Badge variant='success'>{m.modules_datapipe_clean_badge()}</Badge>
          <Badge variant='info'>{m.modules_datapipe_chunk_badge()}</Badge>
          <Badge variant='warning'>{m.modules_datapipe_pipeline_badge()}</Badge>
        </div>
        <Alert variant='info' class='mt-4'>{m.modules_datapipe_note()}</Alert>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_datapipe_capabilities_title()}</h3>
        <div class='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {#each datapipeFeatures as feature (feature.api)}
            <div class='p-4 rounded-lg bg-base-200/50'>
              <h4 class='font-medium text-base-content mb-1'>{feature.name}</h4>
              <p class='text-sm text-base-content/60 mb-2'>{feature.desc}</p>
              <code class='text-xs bg-base-200 px-2 py-1 rounded font-mono'>{feature.api}</code>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_datapipe_ops_title()}</h3>
        <div class='space-y-3'>
          {#each datapipeOps as op (op.op)}
            <div class='flex items-start gap-4 p-4 bg-base-200 rounded-lg'>
              <Badge variant='secondary' size='sm' class='shrink-0 mt-0.5'>{op.op}</Badge>
              <div class='flex-1 min-w-0'>
                <p class='text-sm text-base-content/70 mb-1'>{op.desc}</p>
                <pre class='text-xs font-mono overflow-x-auto'>{op.code}</pre>
              </div>
            </div>
          {/each}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_datapipe_rag_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { datapipe } from '@h-ai/datapipe'
import { ai } from '@h-ai/ai'
import { vecdb } from '@h-ai/vecdb'

// 1. 清洗原始 HTML 内容
const cleaned = datapipe.clean(rawHtml, {
  removeHtml: true,
  normalizeWhitespace: true,
  removeUrls: true,
})
if (!cleaned.success) throw new Error(cleaned.error.message)

// 2. 分块（段落策略）
const chunks = datapipe.chunk(cleaned.data, {
  mode: 'paragraph',
  maxSize: 1000,
  overlap: 200,
})
if (!chunks.success) throw new Error(chunks.error.message)

// 3. 嵌入并存入向量库
const embeddings = await ai.embedding.embedBatch(chunks.data.map(chunk => chunk.content))
if (!embeddings.success) throw new Error(embeddings.error.message)

await vecdb.vector.insert('knowledge', chunks.data.map((chunk, index) => ({
  id: 'doc-' + chunk.index,
  vector: embeddings.data[index],
  content: chunk.content,
  metadata: { index: chunk.index },
})))

// 也可以使用管道编排
const pipeline = datapipe.pipeline()
  .clean({ removeHtml: true })
  .chunk({ mode: 'sentence', maxSize: 500 })
const result = await pipeline.run(rawContent)`}</code></pre>
      </Card>
    </div>
  {/if}

  <!-- ===== Crypto 加密 ===== -->
  {#if activeTab === 'crypto'}
    <div class='grid gap-6'>
      <Card>
        <h3 class='text-lg font-semibold mb-2'>@h-ai/crypto — {m.modules_crypto_subtitle()}</h3>
        <p class='text-base-content/60 text-sm mb-4'>
          {m.modules_crypto_description()}
        </p>
        <div class='flex gap-2'>
          <Badge variant='error'>{m.modules_crypto_asymmetric()}</Badge>
          <Badge variant='warning'>{m.modules_crypto_hash()}</Badge>
          <Badge variant='success'>{m.modules_crypto_symmetric()}</Badge>
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-4'>{m.modules_crypto_demo_title()}</h3>
        <div class='space-y-4'>
          <div>
            <label class='text-sm font-medium mb-1 block' for='crypto-plain'>{m.modules_crypto_input_label()}</label>
            <Input id='crypto-plain' bind:value={plainText} placeholder={m.modules_crypto_input_placeholder()} />
          </div>
          <div class='flex gap-3'>
            <Button variant='warning' onclick={mockHash}>{m.modules_crypto_hash_btn()}</Button>
            <Button variant='success' onclick={mockEncrypt}>{m.modules_crypto_encrypt_btn()}</Button>
          </div>
          {#if hashResult}
            <div class='p-3 bg-base-200 rounded-lg'>
              <p class='text-xs text-base-content/60 mb-1'>{m.modules_crypto_hash_result()}</p>
              <code class='text-xs font-mono break-all'>{hashResult}</code>
            </div>
          {/if}
          {#if encryptResult}
            <div class='p-3 bg-base-200 rounded-lg'>
              <p class='text-xs text-base-content/60 mb-1'>{m.modules_crypto_encrypt_result()}</p>
              <code class='text-xs font-mono break-all'>{encryptResult}</code>
            </div>
          {/if}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_crypto_example_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{`import { crypto } from '@h-ai/crypto'

// 初始化
await crypto.init()

// 哈希 / HMAC
const hash = crypto.hash.hash('Hello World')
if (!hash.success) throw new Error(hash.error.message)
const hmac = crypto.hash.hmac('Hello World', 'secret')
if (!hmac.success) throw new Error(hmac.error.message)

// 对称加密
const key = crypto.symmetric.generateKey()
const encrypted = crypto.symmetric.encryptWithIV('敏感数据', key)
if (!encrypted.success) throw new Error(encrypted.error.message)
const decrypted = crypto.symmetric.decryptWithIV(
  encrypted.data.ciphertext,
  key,
  encrypted.data.iv,
)

// 非对称加密
const keypair = crypto.asymmetric.generateKeyPair()
if (!keypair.success) throw new Error(keypair.error.message)
const ciphertext = crypto.asymmetric.encrypt('数据', keypair.data.publicKey)
const plaintext = ciphertext.success
  ? crypto.asymmetric.decrypt(ciphertext.data, keypair.data.privateKey)
  : ciphertext

// 数字签名
const signature = crypto.asymmetric.sign('数据', keypair.data.privateKey)
const isValid = signature.success
  ? crypto.asymmetric.verify('数据', signature.data, keypair.data.publicKey)
  : signature`}</code></pre>
      </Card>
    </div>
  {/if}
</div>
