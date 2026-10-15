<script lang='ts'>
  import type { FormLayoutOptions, FormText } from '../../src/lib/types.js'
  import { Form, FormField } from '../../src/lib/components/compounds/index.js'
  import { Button, Input, Select, Textarea } from '../../src/lib/components/primitives/index.js'

  interface Props extends FormLayoutOptions {
    error?: FormText
    onsubmit?: (data: Record<string, unknown>) => void
    onreset?: () => void
  }
  const { columns = 1, labelPosition = 'top', labelWidth, error, onsubmit, onreset }: Props = $props()
  let name = $state('')
  let email = $state('')
  let notes = $state('')
  let role = $state<string>()
</script>

<Form {columns} {labelPosition} {labelWidth} {onsubmit} {onreset}>
  <FormField label='Name' required hint='Your display name' data-field='name'>
    <Input name='name' bind:value={name} required />
  </FormField>
  <FormField label='Email' {error} data-field='email'>
    <Input name='email' type='email' bind:value={email} />
  </FormField>
  <FormField label='Role' data-field='role'>
    <Select name='role' bind:value={role} required options={[{ value: 'admin', label: 'Admin' }]} />
  </FormField>
  <FormField label='Notes' data-field='notes'>
    <Textarea name='notes' bind:value={notes} required validationMessage={() => 'Please add notes'} />
  </FormField>
  <FormField label='Short notes' colSpan={1} data-field='short-notes'>
    <Textarea />
  </FormField>
  <FormField label='Full row' colSpan={2} data-field='full-row'>
    <Input />
  </FormField>
  <Button type='submit'>Save</Button>
  <Button type='reset'>Reset</Button>
</Form>
