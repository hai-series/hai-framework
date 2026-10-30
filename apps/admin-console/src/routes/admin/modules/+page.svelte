<!--
  模块功能示例页面 - 展示 hai-framework 各后端模块的使用方式
-->
<script lang='ts'>
  import aiExample from '$lib/examples/modules/ai.ts?raw'
  import cacheExample from '$lib/examples/modules/cache.ts?raw'
  import coreExample from '$lib/examples/modules/core.ts?raw'
  import cryptoExample from '$lib/examples/modules/crypto.ts?raw'
  import datapipeExample from '$lib/examples/modules/datapipe.ts?raw'
  import reldbExample from '$lib/examples/modules/reldb.ts?raw'
  import storageExample from '$lib/examples/modules/storage.ts?raw'
  import vecdbExample from '$lib/examples/modules/vecdb.ts?raw'
  import * as m from '$lib/paraglide/messages'
  import { crypto } from '@h-ai/crypto'
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
    { op: 'TRANSACTION', sql: 'await reldb.tx.wrap(async (tx) => {\n  const saved = await tx.execute(\'INSERT INTO users (name, email) VALUES (?, ?)\', [\'Alice\', \'alice@example.com\'])\n  if (!saved.success) throw new Error(saved.error.message, { cause: saved.error })\n  const found = await tx.get(\'SELECT * FROM users WHERE email = ?\', [\'alice@example.com\'])\n  if (!found.success) throw new Error(found.error.message, { cause: found.error })\n  return found.data\n})', desc: m.modules_db_op_tx_desc() },
  ])

  // Cache 示例
  const cacheOps = $derived([
    { op: 'SET', code: 'await cache.kv.set(\'user:1\', userData, { ex: 3600 })', desc: m.modules_cache_op_set_desc() },
    { op: 'GET', code: 'const user = await cache.kv.get<User>(\'user:1\')', desc: m.modules_cache_op_get_desc() },
    { op: 'DELETE', code: 'await cache.kv.del(\'user:1\')', desc: m.modules_cache_op_delete_desc() },
    { op: 'SCAN', code: 'const page = await cache.kv.scan(\'0\', { match: \'user:*\', count: 100 })\nif (!page.success) return page\nconst [cursor, keys] = page.data', desc: m.modules_cache_op_clear_desc() },
  ])

  // Storage 示例
  const storageOps = $derived([
    { op: m.modules_storage_op_upload(), code: 'await storage.file.put(\'docs/report.pdf\', fileBuffer)', desc: m.modules_storage_op_upload_desc() },
    { op: m.modules_storage_op_download(), code: 'const file = await storage.file.get(\'docs/report.pdf\')', desc: m.modules_storage_op_download_desc() },
    { op: m.modules_storage_op_presign(), code: 'const url = await storage.presign.getUrl(\'docs/report.pdf\', { expiresIn: 3600 })\nif (!url.success) return url', desc: m.modules_storage_op_presign_desc() },
    { op: m.modules_storage_op_list(), code: 'const files = await storage.dir.list({ prefix: \'docs/\' })', desc: m.modules_storage_op_list_desc() },
  ])

  // AI 示例
  const aiFeatures = $derived([
    { name: m.modules_ai_feat_chat_name(), desc: m.modules_ai_feat_chat_desc(), api: 'ai.llm.chat({ messages: [...] })' },
    { name: m.modules_ai_feat_embed_name(), desc: m.modules_ai_feat_embed_desc(), api: 'ai.embedding.embedText(text)' },
    { name: m.modules_ai_feat_multi_name(), desc: m.modules_ai_feat_multi_desc(), api: 'ai.init({ llm: { protocol, model } })' },
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

  let cryptoBusy = $state(false)
  let decryptedResult = $state('')

  $effect(() => {
    void plainText
    hashResult = ''
    encryptResult = ''
    decryptedResult = ''
  })

  async function runCrypto(operation: 'hash' | 'encrypt') {
    const input = plainText
    cryptoBusy = true
    try {
      if (!crypto.isInitialized) {
        const initialized = await crypto.init()
        if (!initialized.success) {
          toast.error(m.common_error())
          return
        }
      }
      // 初始化等待期间输入变化时，不展示旧输入结果。
      if (input !== plainText)
        return
      if (operation === 'hash') {
        const result = crypto.hash.hash(input)
        if (!result.success) {
          toast.error(m.common_error())
          return
        }
        hashResult = result.data
        toast.success(m.modules_crypto_hash_complete())
      }
      else {
        const key = crypto.symmetric.generateKey()
        const encrypted = crypto.symmetric.encrypt(input, key)
        if (!encrypted.success) {
          toast.error(m.common_error())
          return
        }
        const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
        if (!decrypted.success || decrypted.data !== input) {
          toast.error(m.common_error())
          return
        }
        encryptResult = JSON.stringify(encrypted.data)
        decryptedResult = decrypted.data
        toast.success(m.modules_crypto_encrypt_complete())
      }
    }
    finally {
      cryptoBusy = false
    }
  }
</script>

<svelte:head>
  <title>{m.modules_title()} - {m.app_title()}</title>
</svelte:head>

<div class='space-y-4'>
  <PageHeader title={m.nav_modules()} description={m.modules_desc()} />

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
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{coreExample}</code></pre>
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
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{reldbExample}</code></pre>
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
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{cacheExample}</code></pre>
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
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{storageExample}</code></pre>
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
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{aiExample}</code></pre>
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
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{vecdbExample}</code></pre>
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
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{datapipeExample}</code></pre>
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
            <Button variant='warning' disabled={cryptoBusy} onclick={() => runCrypto('hash')}>{m.modules_crypto_hash_btn()}</Button>
            <Button variant='success' disabled={cryptoBusy} onclick={() => runCrypto('encrypt')}>{m.modules_crypto_encrypt_btn()}</Button>
          </div>
          {#if hashResult}
            <div class='p-3 bg-base-200 rounded-lg'>
              <p class='text-xs text-base-content/60 mb-1'>{m.modules_crypto_hash_result()}</p>
              <code data-testid='crypto-hash' class='text-xs font-mono break-all'>{hashResult}</code>
            </div>
          {/if}
          {#if encryptResult}
            <div class='p-3 bg-base-200 rounded-lg'>
              <p class='text-xs text-base-content/60 mb-1'>{m.modules_crypto_encrypt_result()}</p>
              <code data-testid='crypto-cipher' class='text-xs font-mono break-all'>{encryptResult}</code>
              <p class='text-xs mt-2'>{m.modules_crypto_roundtrip()}</p>
              <code data-testid='crypto-decrypted'>{decryptedResult}</code>
            </div>
          {/if}
        </div>
      </Card>
      <Card>
        <h3 class='text-lg font-semibold mb-3'>{m.modules_crypto_example_title()}</h3>
        <pre class='bg-base-200 p-4 rounded-lg text-sm overflow-x-auto font-mono'><code>{cryptoExample}</code></pre>
      </Card>
    </div>
  {/if}
</div>
