<script lang='ts'>
  import { onMount } from 'svelte'

  interface ApiResponse<T> {
    success: boolean
    data: T
    error?: { code?: string, message?: string }
  }

  interface HealthData {
    status: string
    timestamp: string
    version: string
    checks: Record<string, string>
  }

  interface Item {
    id: string
    name: string
    description: string
    status: 'active' | 'archived'
    created_at?: string
    updated_at?: string
  }

  interface ItemListData {
    items: Item[]
    total: number
    page: number
    pageSize: number
  }

  interface RequestLog {
    id: number
    time: string
    operation: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    url: string
    requestData: unknown
    status: number
    ok: boolean
    durationMs: number
    responseData: unknown
    networkError?: string
  }

  let message = $state('')
  let errorMessage = $state('')
  let busy = $state(false)

  let health = $state<HealthData | null>(null)

  let page = $state(1)
  let pageSize = $state(10)
  let search = $state('')
  let total = $state(0)
  let items = $state<Item[]>([])

  let selectedId = $state('')
  let selectedItem = $state<Item | null>(null)

  let createName = $state('')
  let createDescription = $state('')

  let updateName = $state('')
  let updateDescription = $state('')
  let updateStatus = $state<'active' | 'archived'>('active')
  let requestLogs = $state<RequestLog[]>([])
  let requestSeq = 1

  function toPrettyJson(value: unknown): string {
    if (value === undefined)
      return 'undefined'

    try {
      return JSON.stringify(value, null, 2)
    }
    catch {
      return String(value)
    }
  }

  function pushRequestLog(log: Omit<RequestLog, 'id'>) {
    requestLogs = [{ id: requestSeq++, ...log }, ...requestLogs].slice(0, 30)
  }

  async function requestJson<T>(
    operation: string,
    method: RequestLog['method'],
    url: string,
    requestData?: unknown,
  ): Promise<{ response: Response, body: ApiResponse<T> }> {
    const startedAt = performance.now()

    try {
      const response = await fetch(url, {
        method,
        headers: requestData ? { 'Content-Type': 'application/json' } : undefined,
        body: requestData ? JSON.stringify(requestData) : undefined,
      })

      let parsedBody: unknown = null
      const rawText = await response.text()

      if (rawText) {
        try {
          parsedBody = JSON.parse(rawText) as unknown
        }
        catch {
          parsedBody = rawText
        }
      }

      const durationMs = Math.round(performance.now() - startedAt)

      pushRequestLog({
        time: new Date().toLocaleTimeString(),
        operation,
        method,
        url,
        requestData: requestData ?? null,
        status: response.status,
        ok: response.ok,
        durationMs,
        responseData: parsedBody,
      })

      return {
        response,
        body: parsedBody as ApiResponse<T>,
      }
    }
    catch (error) {
      const durationMs = Math.round(performance.now() - startedAt)
      const message = error instanceof Error ? error.message : '未知网络错误'

      pushRequestLog({
        time: new Date().toLocaleTimeString(),
        operation,
        method,
        url,
        requestData: requestData ?? null,
        status: 0,
        ok: false,
        durationMs,
        responseData: null,
        networkError: message,
      })

      throw error
    }
  }

  function clearFeedback() {
    message = ''
    errorMessage = ''
  }

  async function checkHealth() {
    clearFeedback()

    const { response, body } = await requestJson<HealthData>('健康检查', 'GET', '/api/v1/health')

    if (!response.ok || !body.success) {
      errorMessage = body.error?.message ?? '健康检查失败'
      return
    }

    health = body.data
    message = '健康检查成功'
  }

  async function loadItems() {
    clearFeedback()

    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })
    if (search.trim()) {
      query.set('search', search.trim())
    }

    const url = `/api/v1/items?${query.toString()}`
    const { response, body } = await requestJson<ItemListData>('列表查询', 'GET', url)

    if (!response.ok || !body.success) {
      errorMessage = body.error?.message ?? '加载列表失败'
      return
    }

    items = body.data.items
    total = body.data.total
    message = `已加载 ${items.length} 条记录`
  }

  async function createItem() {
    clearFeedback()
    busy = true

    try {
      const payload = {
        name: createName,
        description: createDescription,
      }

      const { response, body } = await requestJson<Item>('创建 Item', 'POST', '/api/v1/items', payload)

      if (!response.ok || !body.success) {
        errorMessage = body.error?.message ?? '创建失败'
        return
      }

      createName = ''
      createDescription = ''
      message = `创建成功：${body.data.id}`
      await loadItems()
    }
    finally {
      busy = false
    }
  }

  async function readItem(id: string) {
    clearFeedback()
    selectedId = id

    const { response, body } = await requestJson<Item>('读取详情', 'GET', `/api/v1/items/${id}`)

    if (!response.ok || !body.success) {
      errorMessage = body.error?.message ?? '读取详情失败'
      return
    }

    selectedItem = body.data
    updateName = body.data.name
    updateDescription = body.data.description ?? ''
    updateStatus = body.data.status
    message = `已读取详情：${id}`
  }

  async function updateItem() {
    if (!selectedId) {
      errorMessage = '请先选择一条记录再更新'
      return
    }

    clearFeedback()
    busy = true

    try {
      const payload = {
        name: updateName,
        description: updateDescription,
        status: updateStatus,
      }

      const { response, body } = await requestJson<Item>('更新 Item', 'PUT', `/api/v1/items/${selectedId}`, payload)

      if (!response.ok || !body.success) {
        errorMessage = body.error?.message ?? '更新失败'
        return
      }

      selectedItem = body.data
      message = `更新成功：${selectedId}`
      await loadItems()
    }
    finally {
      busy = false
    }
  }

  async function deleteItem(id: string) {
    clearFeedback()

    const { response, body } = await requestJson<{ id: string, deleted: boolean }>('删除 Item', 'DELETE', `/api/v1/items/${id}`)

    if (!response.ok || !body.success) {
      errorMessage = body.error?.message ?? '删除失败'
      return
    }

    if (selectedId === id) {
      selectedId = ''
      selectedItem = null
      updateName = ''
      updateDescription = ''
      updateStatus = 'active'
    }

    message = `删除成功：${id}`
    await loadItems()
  }

  function selectForEdit(item: Item) {
    selectedId = item.id
    selectedItem = item
    updateName = item.name
    updateDescription = item.description ?? ''
    updateStatus = item.status
  }

  onMount(async () => {
    await checkHealth()
    await loadItems()
  })
</script>

<svelte:head>
  <title>Items API Simulator</title>
</svelte:head>

<main class='container'>
  <header class='hero'>
    <h1>🧪 Items 接口模拟 CRUD 控制台</h1>
    <p>用于快速调试 `/api/v1/items` 与 `/api/v1/health`。</p>
    <a class='back-link' href='/'>← 返回示例首页</a>
  </header>

  {#if message}
    <p class='feedback success'>{message}</p>
  {/if}
  {#if errorMessage}
    <p class='feedback error'>{errorMessage}</p>
  {/if}

  <section class='card'>
    <div class='card-title-row'>
      <h2>健康检查</h2>
      <button type='button' onclick={checkHealth}>刷新</button>
    </div>
    {#if health}
      <p><strong>状态：</strong>{health.status}</p>
      <p><strong>版本：</strong>{health.version}</p>
      <p><strong>时间：</strong>{health.timestamp}</p>
      <p><strong>检查：</strong>{Object.entries(health.checks).map(([k, v]) => `${k}=${v}`).join(', ')}</p>
    {:else}
      <p>暂无健康检查结果</p>
    {/if}
  </section>

  <section class='grid-2'>
    <article class='card'>
      <h2>创建 Item (Create)</h2>
      <label>
        名称
        <input bind:value={createName} placeholder='请输入名称' maxlength='100' />
      </label>
      <label>
        描述
        <textarea bind:value={createDescription} placeholder='请输入描述' maxlength='500'></textarea>
      </label>
      <button type='button' disabled={busy || !createName.trim()} onclick={createItem}>创建</button>
    </article>

    <article class='card'>
      <h2>更新 Item (Update)</h2>
      <p class='hint'>当前选中 ID：<code>{selectedId || '-'}</code></p>
      <label>
        名称
        <input bind:value={updateName} placeholder='请选择记录后再编辑' maxlength='100' />
      </label>
      <label>
        描述
        <textarea bind:value={updateDescription} maxlength='500'></textarea>
      </label>
      <label>
        状态
        <select bind:value={updateStatus}>
          <option value='active'>active</option>
          <option value='archived'>archived</option>
        </select>
      </label>
      <button type='button' disabled={busy || !selectedId} onclick={updateItem}>更新</button>
    </article>
  </section>

  <section class='card'>
    <div class='card-title-row'>
      <h2>列表与查询 (Read/List/Delete)</h2>
      <button type='button' onclick={loadItems}>刷新列表</button>
    </div>

    <div class='toolbar'>
      <label>
        搜索
        <input bind:value={search} placeholder='按名称搜索' />
      </label>
      <label>
        页码
        <input bind:value={page} type='number' min='1' />
      </label>
      <label>
        每页
        <input bind:value={pageSize} type='number' min='1' max='100' />
      </label>
      <button type='button' onclick={loadItems}>查询</button>
    </div>

    <p class='hint'>总数：{total}</p>

    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>名称</th>
          <th>状态</th>
          <th>描述</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {#if items.length === 0}
          <tr>
            <td colspan='5' class='empty'>暂无数据</td>
          </tr>
        {:else}
          {#each items as item}
            <tr class:active-row={selectedId === item.id}>
              <td><code>{item.id}</code></td>
              <td>{item.name}</td>
              <td>{item.status}</td>
              <td>{item.description}</td>
              <td class='ops'>
                <button type='button' onclick={() => readItem(item.id)}>读</button>
                <button type='button' onclick={() => selectForEdit(item)}>选中</button>
                <button type='button' class='danger' onclick={() => deleteItem(item.id)}>删</button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </section>

  {#if selectedItem}
    <section class='card'>
      <h2>当前详情（Read）</h2>
      <pre>{JSON.stringify(selectedItem, null, 2)}</pre>
    </section>
  {/if}

  <section class='card'>
    <div class='card-title-row'>
      <h2>请求记录</h2>
      <button type='button' onclick={() => { requestLogs = [] }}>清空</button>
    </div>

    {#if requestLogs.length === 0}
      <p class='hint'>暂无请求记录，执行上面的 CRUD 操作后会自动展示。</p>
    {:else}
      <div class='logs'>
        {#each requestLogs as log}
          <article class='log-item'>
            <div class='log-head'>
              <strong>{log.operation}</strong>
              <span class:ok={log.ok} class:bad={!log.ok}>{log.method} {log.url} · {log.status} · {log.durationMs}ms · {log.time}</span>
            </div>

            {#if log.networkError}
              <p class='net-error'>网络错误：{log.networkError}</p>
            {/if}

            <div class='log-body'>
              <div>
                <h3>请求数据</h3>
                <pre>{toPrettyJson(log.requestData)}</pre>
              </div>
              <div>
                <h3>响应数据</h3>
                <pre>{toPrettyJson(log.responseData)}</pre>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f7f8fa;
    color: #111827;
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }

  .container {
    max-width: 1080px;
    margin: 0 auto;
    padding: 2rem 1rem 3rem;
    display: grid;
    gap: 1rem;
  }

  .hero {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
  }

  .hero h1 {
    margin: 0;
    font-size: 1.3rem;
  }

  .hero p {
    margin: 0.5rem 0 0;
    color: #6b7280;
  }

  .back-link {
    margin-top: 0.7rem;
    display: inline-block;
    font-size: 0.9rem;
    color: #2563eb;
    text-decoration: none;
  }

  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem;
  }

  .grid-2 {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }

  .card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
  }

  label {
    display: grid;
    gap: 0.3rem;
    margin-bottom: 0.6rem;
    font-size: 0.9rem;
  }

  input,
  textarea,
  select,
  button {
    font: inherit;
  }

  input,
  textarea,
  select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    padding: 0.5rem 0.6rem;
    background: #fff;
  }

  textarea {
    min-height: 84px;
    resize: vertical;
  }

  button {
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    padding: 0.45rem 0.75rem;
    background: #f9fafb;
    cursor: pointer;
  }

  button:hover {
    background: #f3f4f6;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .danger {
    color: #b91c1c;
  }

  .toolbar {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: 2fr 1fr 1fr auto;
    align-items: end;
    margin: 0.5rem 0 0.75rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
  }

  th,
  td {
    border-bottom: 1px solid #f1f5f9;
    text-align: left;
    padding: 0.55rem;
    vertical-align: top;
  }

  th {
    background: #f8fafc;
    font-weight: 600;
  }

  .ops {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .active-row {
    background: #eff6ff;
  }

  .feedback {
    margin: 0;
    border-radius: 0.5rem;
    padding: 0.65rem 0.8rem;
    font-size: 0.9rem;
  }

  .success {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    color: #065f46;
  }

  .error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }

  .hint {
    margin: 0.25rem 0 0.75rem;
    font-size: 0.85rem;
    color: #6b7280;
  }

  .empty {
    text-align: center;
    color: #9ca3af;
    padding: 1rem;
  }

  pre {
    margin: 0;
    font-size: 0.83rem;
    background: #111827;
    color: #e5e7eb;
    border-radius: 0.5rem;
    padding: 0.75rem;
    overflow: auto;
  }

  .logs {
    display: grid;
    gap: 0.75rem;
  }

  .log-item {
    border: 1px solid #e5e7eb;
    border-radius: 0.6rem;
    padding: 0.75rem;
    background: #fbfdff;
  }

  .log-head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.6rem;
    flex-wrap: wrap;
  }

  .log-head span {
    font-size: 0.8rem;
    padding: 0.2rem 0.45rem;
    border-radius: 999px;
  }

  .ok {
    background: #dcfce7;
    color: #166534;
  }

  .bad {
    background: #fee2e2;
    color: #991b1b;
  }

  .net-error {
    margin: 0 0 0.65rem;
    color: #b91c1c;
    font-size: 0.88rem;
  }

  .log-body {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .log-body h3 {
    margin: 0 0 0.35rem;
    font-size: 0.85rem;
    color: #475569;
  }

  @media (max-width: 860px) {
    .toolbar {
      grid-template-columns: 1fr;
    }
  }
</style>
