<script lang="ts">
  /**
   * 联系我们页面 — 表单通过 API 提交，使用 @h-ai/reach 发送邮件
   */
  import { Alert, Button, Input, Spinner, Textarea } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages.js'

  let name = $state('')
  let email = $state('')
  let message = $state('')
  let submitting = $state(false)
  let submitResult = $state<{ success: boolean, message: string } | null>(null)

  async function handleSubmit(e: Event) {
    e.preventDefault()
    submitting = true
    submitResult = null

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      const data = await res.json()

      if (data.success) {
        submitResult = { success: true, message: m.contact_submit_success() }
        name = ''
        email = ''
        message = ''
      }
      else {
        submitResult = { success: false, message: data.error?.message ?? m.contact_submit_failed() }
      }
    }
    catch {
      submitResult = { success: false, message: m.contact_network_error() }
    }
    finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>{m.contact_page_title()} - {m.brand()}</title>
  <meta name="description" content={m.contact_page_description()} />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold tracking-tight text-base-content">{m.contact_page_title()}</h1>
      <p class="text-base-content/50 mt-2">{m.contact_page_subtitle()}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- 联系表单 -->
      <Card shadow="sm">
        <h2 class="text-lg font-semibold text-base-content mb-4">{m.contact_form_title()}</h2>

        {#if submitResult}
          <Alert variant={submitResult.success ? 'success' : 'error'} dismissible class="mb-4">
            {submitResult.message}
          </Alert>
        {/if}

        <form class="space-y-4" onsubmit={handleSubmit}>
          <FormField label={m.contact_form_name_label()} required>
            <Input
              id="name"
              placeholder={m.contact_form_name_placeholder()}
              bind:value={name}
              required
            />
          </FormField>

          <FormField label={m.contact_form_email_label()} required>
            <Input
              id="email"
              type="email"
              placeholder={m.contact_form_email_placeholder()}
              bind:value={email}
              required
            />
          </FormField>

          <FormField label={m.contact_form_message_label()} required>
            <Textarea
              id="message"
              placeholder={m.contact_form_message_placeholder()}
              rows={4}
              bind:value={message}
              required
            />
          </FormField>

          <Button type="submit" variant="primary" class="w-full" loading={submitting} disabled={submitting}>
            {#if submitting}
              {m.contact_form_submitting()}
            {:else}
              {m.contact_form_submit()}
            {/if}
          </Button>
        </form>
      </Card>

      <!-- 联系信息 -->
      <div class="space-y-6">
        <Card shadow="sm">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--address-book] size-5 text-primary"></span>
            </div>
            <div>
              <h3 class="font-semibold text-base-content mb-3">{m.contact_info_title()}</h3>
              <div class="space-y-2 text-sm text-base-content/60">
                <div class="flex items-center gap-2">
                  <span class="icon-[tabler--mail] size-4 text-base-content/40"></span>
                  {m.contact_info_email_value()}
                </div>
                <div class="flex items-center gap-2">
                  <span class="icon-[tabler--phone] size-4 text-base-content/40"></span>
                  {m.contact_info_phone_value()}
                </div>
                <div class="flex items-center gap-2">
                  <span class="icon-[tabler--map-pin] size-4 text-base-content/40"></span>
                  {m.contact_info_address_value()}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card shadow="sm">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-info/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--clock] size-5 text-info"></span>
            </div>
            <div>
              <h3 class="font-semibold text-base-content mb-3">{m.contact_hours_title()}</h3>
              <div class="space-y-1 text-sm text-base-content/60">
                <p>{m.contact_hours_weekdays()}</p>
                <p>{m.contact_hours_saturday()}</p>
                <p>{m.contact_hours_holiday()}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card shadow="sm">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-success/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--share] size-5 text-success"></span>
            </div>
            <div>
              <h3 class="font-semibold text-base-content mb-3">{m.contact_social_title()}</h3>
              <div class="flex gap-2">
                <Button variant="default" size="sm" outline>{m.contact_social_wechat()}</Button>
                <Button variant="default" size="sm" outline>{m.contact_social_weibo()}</Button>
                <Button variant="default" size="sm" outline>{m.contact_social_github()}</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</section>
