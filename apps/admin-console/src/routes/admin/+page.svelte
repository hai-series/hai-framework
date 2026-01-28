/**
 * =============================================================================
 * hai Admin Console - 仪表盘
 * =============================================================================
 */
<script lang="ts">
  /**
   * 统计卡片数据
   */
  const stats = [
    { icon: '👥', label: '总用户数', value: '1,234', change: '+12%', positive: true },
    { icon: '📊', label: '今日访问', value: '5,678', change: '+23%', positive: true },
    { icon: '💰', label: '本月收入', value: '¥89,012', change: '+8%', positive: true },
    { icon: '📦', label: '订单数量', value: '456', change: '-3%', positive: false },
  ]
  
  /**
   * 最近活动
   */
  const activities = [
    { time: '10:30', user: '张三', action: '登录系统', type: 'login' },
    { time: '10:25', user: '李四', action: '创建订单 #1234', type: 'order' },
    { time: '10:20', user: '王五', action: '更新用户资料', type: 'update' },
    { time: '10:15', user: '赵六', action: '上传文件', type: 'upload' },
    { time: '10:10', user: '钱七', action: '删除记录', type: 'delete' },
  ]
</script>

<svelte:head>
  <title>仪表盘 - hai Admin</title>
</svelte:head>

<div class="dashboard">
  <h1 class="page-title">仪表盘</h1>
  
  <!-- 统计卡片 -->
  <div class="stats-grid">
    {#each stats as stat}
      <div class="stat-card">
        <div class="stat-icon">{stat.icon}</div>
        <div class="stat-content">
          <div class="stat-value">{stat.value}</div>
          <div class="stat-label">{stat.label}</div>
        </div>
        <div class="stat-change" class:positive={stat.positive} class:negative={!stat.positive}>
          {stat.change}
        </div>
      </div>
    {/each}
  </div>
  
  <!-- 内容区 -->
  <div class="content-grid">
    <!-- 图表占位 -->
    <div class="chart-card">
      <h3 class="card-title">访问趋势</h3>
      <div class="chart-placeholder">
        <p>📈 图表区域</p>
        <p class="placeholder-text">这里可以集成 Chart.js 或 ECharts</p>
      </div>
    </div>
    
    <!-- 最近活动 -->
    <div class="activity-card">
      <h3 class="card-title">最近活动</h3>
      <div class="activity-list">
        {#each activities as activity}
          <div class="activity-item">
            <div class="activity-time">{activity.time}</div>
            <div class="activity-content">
              <span class="activity-user">{activity.user}</span>
              <span class="activity-action">{activity.action}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
  
  <!-- 快速操作 -->
  <div class="quick-actions">
    <h3 class="card-title">快速操作</h3>
    <div class="action-buttons">
      <a href="/admin/users/new" class="action-btn">
        <span class="action-icon">➕</span>
        <span>添加用户</span>
      </a>
      <a href="/admin/roles/new" class="action-btn">
        <span class="action-icon">🔑</span>
        <span>创建角色</span>
      </a>
      <a href="/admin/logs" class="action-btn">
        <span class="action-icon">📋</span>
        <span>查看日志</span>
      </a>
      <a href="/admin/settings" class="action-btn">
        <span class="action-icon">⚙️</span>
        <span>系统设置</span>
      </a>
    </div>
  </div>
</div>

<style>
  .dashboard {
    max-width: 1400px;
    margin: 0 auto;
  }
  
  .page-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
  }
  
  /* 统计卡片 */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .stat-card {
    background: white;
    padding: 1.25rem;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .stat-icon {
    font-size: 2rem;
    background: #f3f4f6;
    padding: 0.75rem;
    border-radius: 0.5rem;
  }
  
  .stat-content {
    flex: 1;
  }
  
  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #333;
  }
  
  .stat-label {
    font-size: 0.875rem;
    color: #666;
  }
  
  .stat-change {
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }
  
  .stat-change.positive {
    background: #dcfce7;
    color: #16a34a;
  }
  
  .stat-change.negative {
    background: #fef2f2;
    color: #dc2626;
  }
  
  /* 内容网格 */
  .content-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  @media (max-width: 1024px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }
  
  .card-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: #333;
  }
  
  /* 图表卡片 */
  .chart-card {
    background: white;
    padding: 1.25rem;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .chart-placeholder {
    height: 300px;
    background: #f9fafb;
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #666;
  }
  
  .chart-placeholder p {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  
  .placeholder-text {
    font-size: 0.875rem !important;
    color: #999;
  }
  
  /* 活动卡片 */
  .activity-card {
    background: white;
    padding: 1.25rem;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .activity-item {
    display: flex;
    gap: 1rem;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 0.5rem;
  }
  
  .activity-time {
    font-size: 0.75rem;
    color: #666;
    min-width: 50px;
  }
  
  .activity-content {
    flex: 1;
    font-size: 0.875rem;
  }
  
  .activity-user {
    font-weight: 500;
    margin-right: 0.5rem;
  }
  
  .activity-action {
    color: #666;
  }
  
  /* 快速操作 */
  .quick-actions {
    background: white;
    padding: 1.25rem;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }
  
  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: #f3f4f6;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
  }
  
  .action-btn:hover {
    background: #e5e7eb;
  }
  
  .action-icon {
    font-size: 1.25rem;
  }
</style>
