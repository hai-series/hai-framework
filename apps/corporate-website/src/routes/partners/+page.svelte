<script lang="ts">
  import { Alert, Button, Input, Select, Textarea } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages.js'

  const cooperationTypeOptions = $derived([
    { value: 'channel', label: m.partner_form_type_channel() },
    { value: 'solution', label: m.partner_form_type_solution() },
    { value: 'delivery', label: m.partner_form_type_delivery() },
    { value: 'marketing', label: m.partner_form_type_marketing() },
    { value: 'other', label: m.partner_form_type_other() },
  ])

  const budgetOptions = $derived([
    { value: 'unknown', label: m.partner_form_budget_unknown() },
    { value: 'lt-100k', label: m.partner_form_budget_lt100k() },
    { value: '100k-500k', label: m.partner_form_budget_100k500k() },
    { value: '500k-1m', label: m.partner_form_budget_500k1m() },
    { value: 'gt-1m', label: m.partner_form_budget_gt1m() },
  ])

  let form = $state({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    cooperationType: 'solution',
    budgetRange: 'unknown',
    message: '',
  })

  let errors = $state<Record<string, string>>({})
  let submitting = $state(false)
  let resultMessage = $state<{ success: boolean, text: string } | null>(null)

  /** 客户端表单校验，返回是否通过 */
  function validateForm(): boolean {
    const e: Record<string, string> = {}
    if (form.companyName.trim().length < 2) e.companyName = m.validate_company_min()
    if (form.contactName.trim().length < 2) e.contactName = m.validate_contact_min()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = m.validate_email_invalid()
    if (form.phone.trim().length < 6) e.phone = m.validate_phone_min()
    if (form.message.trim().length < 10) e.message = m.validate_message_min()
    errors = e
    return Object.keys(e).length === 0
  }

  async function handleSubmit(event: Event) {
    event.preventDefault()
    resultMessage = null

    if (!validateForm()) return

    submitting = true

    try {
      const formData = new FormData()
      formData.append('companyName', form.companyName)
      formData.append('contactName', form.contactName)
      formData.append('email', form.email)
      formData.append('phone', form.phone)
      formData.append('cooperationType', form.cooperationType)
      formData.append('budgetRange', form.budgetRange)
      formData.append('message', form.message)

      const response = await fetch('/api/partners/register', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (data.success) {
        resultMessage = { success: true, text: m.partner_submit_success() }
        form = {
          companyName: '',
          contactName: '',
          email: '',
          phone: '',
          cooperationType: 'solution',
          budgetRange: 'unknown',
          message: '',
        }
        errors = {}
      }
      else {
        resultMessage = { success: false, text: data.error?.message ?? m.partner_submit_failed() }
      }
    }
    catch {
      resultMessage = { success: false, text: m.partner_network_error() }
    }
    finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>{m.nav_partner()} - {m.brand()}</title>
</svelte:head>

<section class="py-14 px-4 lg:px-8">
  <div class="mx-auto max-w-5xl">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold tracking-tight text-base-content">{m.nav_partner()}</h1>
      <p class="text-base-content/50 mt-2">{m.partner_form_intro()}</p>
    </div>

    <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card shadow="sm">
        {#if resultMessage}
          <Alert variant={resultMessage.success ? 'success' : 'error'} dismissible class="mb-4">
            {resultMessage.text}
          </Alert>
        {/if}

        <form class="grid gap-4" onsubmit={handleSubmit}>
          <FormField label={m.partner_form_company()} required error={errors.companyName}>
            <Input id="company-name" bind:value={form.companyName} required />
          </FormField>

          <div class="grid gap-4 md:grid-cols-2">
            <FormField label={m.partner_form_contact()} required error={errors.contactName}>
              <Input id="contact-name" bind:value={form.contactName} required />
            </FormField>

            <FormField label={m.partner_form_phone()} required error={errors.phone}>
              <Input id="contact-phone" bind:value={form.phone} required />
            </FormField>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <FormField label={m.partner_form_email()} required error={errors.email}>
              <Input id="contact-email" type="email" bind:value={form.email} required />
            </FormField>

            <FormField label={m.partner_form_budget()}>
              <Select id="budget-range" options={budgetOptions} bind:value={form.budgetRange} />
            </FormField>
          </div>

          <FormField label={m.partner_form_type()}>
            <Select id="cooperation-type" options={cooperationTypeOptions} bind:value={form.cooperationType} />
          </FormField>

          <FormField label={m.partner_form_message()} required error={errors.message}>
            <Textarea id="cooperation-message" bind:value={form.message} required rows={5} />
          </FormField>

          <Button type="submit" variant="primary" class="mt-2" loading={submitting} disabled={submitting}>
            {#if submitting}
              {m.partner_form_submitting()}
            {:else}
              {m.partner_form_submit()}
            {/if}
          </Button>
        </form>
      </Card>

      <aside class="space-y-4">
        <Card shadow="sm">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--list-numbers] size-5 text-primary"></span>
            </div>
            <div>
              <h2 class="font-semibold text-base-content mb-3">{m.partner_process_title()}</h2>
              <Steps
                items={[
                  { title: m.partner_process_step_1() },
                  { title: m.partner_process_step_2() },
                  { title: m.partner_process_step_3() },
                  { title: m.partner_process_step_4() },
                ]}
                current={0}
                direction="vertical"
                size="sm"
              />
            </div>
          </div>
        </Card>

        <Card shadow="sm">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-info/8 flex items-center justify-center shrink-0">
              <span class="icon-[tabler--settings] size-5 text-info"></span>
            </div>
            <div>
              <h2 class="font-semibold text-base-content mb-2">{m.partner_admin_entry_title()}</h2>
              <p class="text-sm text-base-content/60 mb-3">{m.partner_admin_entry_desc()}</p>
              <a href="/partners/admin/login">
                <Button variant="default" size="sm" outline>{m.partner_admin_entry_cta()}</Button>
              </a>
            </div>
          </div>
        </Card>
      </aside>
    </div>
  </div>
</section>
