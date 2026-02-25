<script lang="ts">
  /**
   * 联系我们页面
   */
</script>

<svelte:head>
  <title>联系我们 - 企业名称</title>
  <meta name="description" content="联系企业名称，我们将竭诚为您服务。" />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-5xl mx-auto">
    <h1 class="text-4xl font-bold text-center mb-4">联系我们</h1>
    <p class="text-center text-gray-500 mb-12">如有任何问题或合作需求，欢迎联系我们</p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
      <!-- 联系表单 -->
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h2 class="card-title mb-4">发送消息</h2>
          <form class="space-y-4">
            <div class="form-control">
              <label class="label" for="name">
                <span class="label-text">姓名</span>
              </label>
              <input id="name" type="text" placeholder="请输入您的姓名" class="input input-bordered w-full" />
            </div>
            <div class="form-control">
              <label class="label" for="email">
                <span class="label-text">邮箱</span>
              </label>
              <input id="email" type="email" placeholder="请输入您的邮箱" class="input input-bordered w-full" />
            </div>
            <div class="form-control">
              <label class="label" for="message">
                <span class="label-text">留言</span>
              </label>
              <textarea id="message" placeholder="请输入留言内容" class="textarea textarea-bordered w-full" rows="4"></textarea>
            </div>
            <button type="submit" class="btn btn-primary w-full">提交</button>
          </form>
        </div>
      </div>

      <!-- 联系信息 -->
      <div class="space-y-8">
        <div>
          <h3 class="text-lg font-semibold mb-3">联系方式</h3>
          <div class="space-y-3 text-gray-600">
            <p>📧 邮箱：contact@example.com</p>
            <p>📞 电话：400-000-0000</p>
            <p>📍 地址：北京市海淀区中关村大街 1 号</p>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold mb-3">工作时间</h3>
          <div class="space-y-1 text-gray-600">
            <p>周一至周五：09:00 - 18:00</p>
            <p>周六：10:00 - 16:00</p>
            <p>周日及法定节假日：休息</p>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold mb-3">关注我们</h3>
          <div class="flex gap-3">
            <button class="btn btn-outline btn-sm">微信</button>
            <button class="btn btn-outline btn-sm">微博</button>
            <button class="btn btn-outline btn-sm">GitHub</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
