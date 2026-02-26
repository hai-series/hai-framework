/**
 * =============================================================================
 * @h-ai/ui - 自动导入预处理器测试
 * =============================================================================
 * 验证 autoImportHaiUi 预处理器的核心功能：
 * - 组件注册表完整性（与实际导出一致）
 * - 模板中使用的组件自动注入 import
 * - 已有 import 不重复注入
 * - 跳过 @h-ai/ui 包自身文件
 * - 非 Svelte 文件不处理
 */

import { describe, expect, it } from 'vitest'
import { autoImportHaiUi } from '../auto-import.js'

/** 取得预处理器实例 */
const preprocessor = autoImportHaiUi()

/** 调用 markup 的快捷方法 */
function process(content: string, filename = '/app/src/routes/+page.svelte') {
  return preprocessor.markup({ content, filename })
}

// =============================================================================
// 组件注册表完整性
// =============================================================================

describe('组件注册表', () => {
  it('应包含所有 primitives 组件', () => {
    const primitives = [
      'Avatar',
      'Badge',
      'BareButton',
      'BareInput',
      'Button',
      'Checkbox',
      'IconButton',
      'Input',
      'Progress',
      'Radio',
      'Range',
      'Rating',
      'Select',
      'Spinner',
      'Switch',
      'Tag',
      'Textarea',
      'ToggleCheckbox',
      'ToggleInput',
      'ToggleRadio',
    ]
    for (const name of primitives) {
      const result = process(`<script lang="ts"></script>\n<${name} />`, '/app/src/routes/+page.svelte')
      expect(result.code, `${name} 应被自动导入`).toContain(`import { ${name} } from '@h-ai/ui'`)
    }
  })

  it('应包含所有 compounds 组件', () => {
    const compounds = [
      'Accordion',
      'Alert',
      'Breadcrumb',
      'Calendar',
      'Card',
      'Combobox',
      'Confirm',
      'DataTable',
      'DatePicker',
      'Drawer',
      'Dropdown',
      'Empty',
      'Form',
      'FormField',
      'Modal',
      'PageHeader',
      'Pagination',
      'Popover',
      'Result',
      'Skeleton',
      'Steps',
      'Tabs',
      'TagInput',
      'Timeline',
      'ToastContainer',
      'Tooltip',
    ]
    for (const name of compounds) {
      const result = process(`<script lang="ts"></script>\n<${name} />`, '/app/src/routes/+page.svelte')
      expect(result.code, `${name} 应被自动导入`).toContain(`import { ${name} } from '@h-ai/ui'`)
    }
  })

  it('应包含所有 scenes 组件', () => {
    const scenes = [
      // app
      'FeedbackModal',
      'LanguageSwitch',
      'SettingsModal',
      'ThemeSelector',
      'ThemeToggle',
      // iam
      'ChangePasswordForm',
      'ForgotPasswordForm',
      'LoginForm',
      'PasswordInput',
      'RegisterForm',
      'ResetPasswordForm',
      'UserProfile',
      // storage
      'AvatarUpload',
      'FileList',
      'FileUpload',
      'ImageUpload',
      // crypto
      'EncryptedInput',
      'HashDisplay',
      'SignatureDisplay',
    ]
    for (const name of scenes) {
      const result = process(`<script lang="ts"></script>\n<${name} />`, '/app/src/routes/+page.svelte')
      expect(result.code, `${name} 应被自动导入`).toContain(`import { ${name} } from '@h-ai/ui'`)
    }
  })

  it('不应包含已删除的组件', () => {
    const deleted = ['ScoreBar', 'SeverityBadge', 'Table', 'Toast']
    for (const name of deleted) {
      const result = process(`<script lang="ts"></script>\n<${name} />`, '/app/src/routes/+page.svelte')
      expect(result.code, `${name} 不应被自动导入`).not.toContain(`from '@h-ai/ui'`)
    }
  })
})

// =============================================================================
// 自动注入行为
// =============================================================================

describe('自动注入', () => {
  it('模板中使用的组件应自动注入 import 语句', () => {
    const input = `<script lang="ts">
  let name = $state('')
</script>

<Card title="测试">
  <Input bind:value={name} />
  <Button variant="primary">提交</Button>
</Card>`

    const result = process(input)
    expect(result.code).toContain(`from '@h-ai/ui'`)
    expect(result.code).toContain('Card')
    expect(result.code).toContain('Input')
    expect(result.code).toContain('Button')
  })

  it('已有 @h-ai/ui import 时应合并而非重复', () => {
    const input = `<script lang="ts">
  import { toast } from '@h-ai/ui';
  let val = $state('')
</script>

<Button>点击</Button>
<Input bind:value={val} />`

    const result = process(input)
    // 应在同一行合并
    expect(result.code).toContain('toast')
    expect(result.code).toContain('Button')
    expect(result.code).toContain('Input')
    // 不应有两行独立的 @h-ai/ui import
    const importCount = (result.code.match(/@h-ai\/ui/g) || []).length
    expect(importCount).toBe(1)
  })

  it('已手动 import 的组件不应重复注入', () => {
    const input = `<script lang="ts">
  import { Button } from '@h-ai/ui';
</script>

<Button>点击</Button>`

    const result = process(input)
    // @h-ai/ui 只出现 1 次（不重复注入）
    const importCount = (result.code.match(/@h-ai\/ui/g) || []).length
    expect(importCount).toBe(1)
  })

  it('没有使用任何组件时不应注入 import', () => {
    const input = `<script lang="ts">
  let x = $state(0)
</script>

<div>{x}</div>`

    const result = process(input)
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('没有 script 标签时应自动创建', () => {
    const input = `<Button variant="primary">提交</Button>`

    const result = process(input)
    expect(result.code).toContain(`<script lang="ts">`)
    expect(result.code).toContain(`import { Button } from '@h-ai/ui'`)
  })

  it('多个组件应排序后注入', () => {
    const input = `<script lang="ts"></script>
<Tooltip content="提示">
  <Badge>标签</Badge>
  <Alert variant="info">信息</Alert>
</Tooltip>`

    const result = process(input)
    expect(result.code).toContain(`from '@h-ai/ui'`)
    expect(result.code).toContain('Alert')
    expect(result.code).toContain('Badge')
    expect(result.code).toContain('Tooltip')
  })
})

// =============================================================================
// 跳过规则
// =============================================================================

describe('跳过规则', () => {
  it('应跳过 @h-ai/ui 包自身的文件', () => {
    const input = `<script lang="ts"></script>\n<Button>测试</Button>`
    const result = process(input, '/workspaces/hai-framework/packages/ui/src/lib/components/compounds/Modal.svelte')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('应跳过 node_modules 中的 @h-ai/ui 文件', () => {
    const input = `<script lang="ts"></script>\n<Button>测试</Button>`
    const result = process(input, '/app/node_modules/@h-ai/ui/src/Button.svelte')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('应跳过非 .svelte 文件', () => {
    const input = `<Button>测试</Button>`
    const result = process(input, '/app/src/utils.ts')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('应跳过无文件名的输入', () => {
    const input = `<Button>测试</Button>`
    const result = preprocessor.markup({ content: input })
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('不应识别小写 HTML 标签', () => {
    const input = `<script lang="ts"></script>\n<button>普通按钮</button>\n<div>容器</div>`
    const result = process(input)
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('不应识别非注册的大写组件', () => {
    const input = `<script lang="ts"></script>\n<MyCustomComponent>内容</MyCustomComponent>`
    const result = process(input)
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })
})

// =============================================================================
// Bits UI 新组件
// =============================================================================

describe('bits UI 组件', () => {
  it('calendar 应被自动导入', () => {
    const input = `<script lang="ts">
  import { CalendarDate } from '@internationalized/date'
  let date = $state(new CalendarDate(2026, 1, 1))
</script>

<Calendar bind:value={date} />`

    const result = process(input)
    expect(result.code).toContain(`Calendar`)
    expect(result.code).toContain(`from '@h-ai/ui'`)
  })

  it('combobox 应被自动导入', () => {
    const input = `<script lang="ts"></script>\n<Combobox options={[]} placeholder="搜索..." />`
    const result = process(input)
    expect(result.code).toContain(`import { Combobox } from '@h-ai/ui'`)
  })

  it('datePicker 应被自动导入', () => {
    const input = `<script lang="ts"></script>\n<DatePicker />`
    const result = process(input)
    expect(result.code).toContain(`import { DatePicker } from '@h-ai/ui'`)
  })
})
