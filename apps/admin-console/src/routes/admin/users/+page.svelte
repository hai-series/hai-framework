/**
 * =============================================================================
 * hai Admin Console - 用户列表页面
 * =============================================================================
 */
<script lang="ts">
  import type { PageData } from './$types'
  
  interface Props {
    data: PageData
  }
  
  let { data }: Props = $props()
  
  /**
   * 搜索关键词
   */
  let searchQuery = $state('')
  
  /**
   * 选中的用户
   */
  let selectedUsers = $state<string[]>([])
  
  /**
   * 过滤后的用户列表
   */
  let filteredUsers = $derived(
    data.users.filter(user => 
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  )
  
  /**
   * 全选状态
   */
  let allSelected = $derived(
    filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length
  )
  
  /**
   * 切换全选
   */
  function toggleSelectAll() {
    if (allSelected) {
      selectedUsers = []
    } else {
      selectedUsers = filteredUsers.map(u => u.id)
    }
  }
  
  /**
   * 切换选中
   */
  function toggleSelect(id: string) {
    if (selectedUsers.includes(id)) {
      selectedUsers = selectedUsers.filter(i => i !== id)
    } else {
      selectedUsers = [...selectedUsers, id]
    }
  }
</script>

<svelte:head>
  <title>用户管理 - hai Admin</title>
</svelte:head>

<div class="users-page">
  <div class="page-header">
    <h1 class="page-title">用户管理</h1>
    <a href="/admin/users/new" class="btn btn-primary">
      <span>➕</span>
      添加用户
    </a>
  </div>
  
  <!-- 工具栏 -->
  <div class="toolbar">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        placeholder="搜索用户..."
        bind:value={searchQuery}
        class="search-input"
      />
    </div>
    
    {#if selectedUsers.length > 0}
      <div class="bulk-actions">
        <span class="selected-count">已选 {selectedUsers.length} 项</span>
        <button class="btn btn-danger">删除</button>
      </div>
    {/if}
  </div>
  
  <!-- 用户表格 -->
  <div class="table-container">
    <table class="data-table">
      <thead>
        <tr>
          <th class="checkbox-cell">
            <input
              type="checkbox"
              checked={allSelected}
              onchange={toggleSelectAll}
            />
          </th>
          <th>用户名</th>
          <th>邮箱</th>
          <th>角色</th>
          <th>状态</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredUsers as user}
          <tr>
            <td class="checkbox-cell">
              <input
                type="checkbox"
                checked={selectedUsers.includes(user.id)}
                onchange={() => toggleSelect(user.id)}
              />
            </td>
            <td>
              <div class="user-info">
                <span class="avatar">{user.username.charAt(0).toUpperCase()}</span>
                <span class="username">{user.username}</span>
              </div>
            </td>
            <td>{user.email}</td>
            <td>
              <span class="role-badge">{user.role}</span>
            </td>
            <td>
              <span class="status-badge" class:active={user.status === 'active'}>
                {user.status === 'active' ? '正常' : '禁用'}
              </span>
            </td>
            <td>{user.createdAt}</td>
            <td>
              <div class="actions">
                <a href="/admin/users/{user.id}" class="action-link">编辑</a>
                <button class="action-link danger">删除</button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  
  <!-- 分页 -->
  <div class="pagination">
    <span class="page-info">显示 1-{filteredUsers.length} 共 {data.total} 条</span>
    <div class="page-buttons">
      <button class="page-btn" disabled>上一页</button>
      <button class="page-btn active">1</button>
      <button class="page-btn">2</button>
      <button class="page-btn">3</button>
      <button class="page-btn">下一页</button>
    </div>
  </div>
</div>

<style>
  .users-page {
    max-width: 1400px;
    margin: 0 auto;
  }
  
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .page-title {
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover {
    background: #2563eb;
  }
  
  .btn-danger {
    background: #dc2626;
    color: white;
  }
  
  .btn-danger:hover {
    background: #b91c1c;
  }
  
  /* 工具栏 */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 0.75rem 0.75rem 0 0;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .search-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    border-radius: 0.5rem;
    width: 300px;
  }
  
  .search-icon {
    color: #666;
  }
  
  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    outline: none;
  }
  
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .selected-count {
    font-size: 0.875rem;
    color: #666;
  }
  
  /* 表格 */
  .table-container {
    background: white;
    border-radius: 0 0 0.75rem 0.75rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .data-table {
    width: 100%;
    border-collapse: collapse;
  }
  
  .data-table th,
  .data-table td {
    padding: 0.875rem 1rem;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .data-table th {
    background: #f9fafb;
    font-weight: 500;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #666;
  }
  
  .data-table td {
    font-size: 0.875rem;
  }
  
  .checkbox-cell {
    width: 40px;
  }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .avatar {
    width: 32px;
    height: 32px;
    background: #3b82f6;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    font-size: 0.875rem;
  }
  
  .role-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #fee2e2;
    color: #dc2626;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .status-badge.active {
    background: #dcfce7;
    color: #16a34a;
  }
  
  .actions {
    display: flex;
    gap: 0.75rem;
  }
  
  .action-link {
    color: #3b82f6;
    font-size: 0.875rem;
    background: none;
    border: none;
    cursor: pointer;
  }
  
  .action-link:hover {
    text-decoration: underline;
  }
  
  .action-link.danger {
    color: #dc2626;
  }
  
  /* 分页 */
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 0.75rem;
  }
  
  .page-info {
    font-size: 0.875rem;
    color: #666;
  }
  
  .page-buttons {
    display: flex;
    gap: 0.5rem;
  }
  
  .page-btn {
    padding: 0.5rem 0.875rem;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .page-btn:hover:not(:disabled) {
    background: #f3f4f6;
  }
  
  .page-btn.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }
  
  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
