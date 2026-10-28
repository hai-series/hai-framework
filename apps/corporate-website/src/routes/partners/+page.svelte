<script lang='ts'>
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'
  import { Button, Input, Select, Textarea, toast } from '@h-ai/ui'
  import { errorMessage } from '@h-ai/ui/toast'

  const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

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

  /** 客户端表单校验，返回是否通过 */
  function validateForm(): boolean {
    const e: Record<string, string> = {}
    if (form.companyName.trim().length < 2)
      e.companyName = m.validate_company_min()
    if (form.contactName.trim().length < 2)
      e.contactName = m.validate_contact_min()
    if (!EMAIL_REGEX.test(form.email))
      e.email = m.validate_email_invalid()
    if (form.phone.trim().length < 6)
      e.phone = m.validate_phone_min()
    if (form.message.trim().length < 10)
      e.message = m.validate_message_min()
    errors = e
    return Object.keys(e).length === 0
  }

  async function handleSubmit(event: Event) {
    event.preventDefault()

    if (!validateForm())
      return

    submitting = true

    try {
      // 服务端使用 kit.validate.body(request, PartnerLeadSchema) 解析 JSON，必须以 JSON 提交而非 FormData
      const response = await fetch('/api/partners/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone,
          cooperationType: form.cooperationType,
          budgetRange: form.budgetRange,
          message: form.message,
        }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(m.partner_submit_success())
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
        toast.error(errorMessage(data.error && typeof data.error === 'object' ? { ...data.error, httpStatus: response.status } : undefined, m.partner_submit_failed()))
      }
    }
    catch {
      toast.error(m.partner_network_error())
    }
    finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>{m.nav_partner()} - {m.brand()}</title>
</svelte:head>

<section class='py-14 px-4 lg:px-8'>
  <div class='mx-auto max-w-5xl'>
    <div class='text-center mb-8'>
      <h1 class='text-4xl font-bold tracking-tight text-base-content'>{m.nav_partner()}</h1>
      <p class='text-base-content/50 mt-2'>{m.partner_form_intro()}</p>
    </div>

    <div class='grid gap-6 lg:grid-cols-[1.1fr_0.9fr]'>
      <Card shadow='sm'>
        <form onsubmit={handleSubmit}>
          <FormLayout columns={2}>
            <FormField for='company-name' label={m.partner_form_company()} colSpan={2} required error={errors.companyName}>
              <Input id='company-name' bind:value={form.companyName} required />
            </FormField>

            <FormField for='contact-name' label={m.partner_form_contact()} required error={errors.contactName}>
              <Input id='contact-name' bind:value={form.contactName} required />
            </FormField>

            <FormField for='contact-phone' label={m.partner_form_phone()} required error={errors.phone}>
              <Input id='contact-phone' bind:value={form.phone} required />
            </FormField>

            <FormField for='contact-email' label={m.partner_form_email()} required error={errors.email}>
              <Input id='contact-email' type='email' bind:value={form.email} required />
            </FormField>

            <FormField for='budget-range' label={m.partner_form_budget()}>
              <Select id='budget-range' options={budgetOptions} bind:value={form.budgetRange} />
            </FormField>

            <FormField for='cooperation-type' label={m.partner_form_type()}>
              <Select id='cooperation-type' options={cooperationTypeOptions} bind:value={form.cooperationType} />
            </FormField>

            <FormField for='cooperation-message' label={m.partner_form_message()} required error={errors.message}>
              <Textarea id='cooperation-message' bind:value={form.message} required rows={5} />
            </FormField>

            <Button type='submit' variant='primary' class='mt-2' loading={submitting} disabled={submitting}>
              {#if submitting}
                {m.partner_form_submitting()}
              {:else}
                {m.partner_form_submit()}
              {/if}
            </Button>
          </FormLayout>
        </form>
      </Card>

      <aside class='space-y-4'>
        <Card shadow='sm'>
          <div class='flex items-start gap-3'>
            <div class='w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0'>
              <span class='icon-[tabler--list-numbers] size-5 text-primary'></span>
            </div>
            <div>
              <h2 class='font-semibold text-base-content mb-3'>{m.partner_process_title()}</h2>
              <Steps
                items={[
                  { title: m.partner_process_step_1() },
                  { title: m.partner_process_step_2() },
                  { title: m.partner_process_step_3() },
                  { title: m.partner_process_step_4() },
                ]}
                current={0}
                direction='vertical'
                size='sm'
              />
            </div>
          </div>
        </Card>

        <Card shadow='sm'>
          <div class='flex items-start gap-3'>
            <div class='w-10 h-10 rounded-xl bg-info/8 flex items-center justify-center shrink-0'>
              <span class='icon-[tabler--settings] size-5 text-info'></span>
            </div>
            <div>
              <h2 class='font-semibold text-base-content mb-2'>{m.partner_admin_entry_title()}</h2>
              <p class='text-sm text-base-content/60 mb-3'>{m.partner_admin_entry_desc()}</p>
              <a href={resolve('/partners/admin/login', {})}>
                <Button variant='default' size='sm' outline>{m.partner_admin_entry_cta()}</Button>
              </a>
            </div>
          </div>
        </Card>
      </aside>
    </div>
  </div>
</section>
