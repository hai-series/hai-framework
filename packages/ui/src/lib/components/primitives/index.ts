/**
 * =============================================================================
 * @hai/ui - 原子组件 (Primitives)
 * =============================================================================
 *
 * 不可再分的基础 UI 单元，职责单一，无业务逻辑。
 *
 * 包含：
 * - Button, IconButton - 按钮
 * - Input, Textarea, Select, Checkbox, Switch, Radio - 表单控件
 * - Badge, Avatar, Tag - 展示标签
 * - Spinner, Progress - 状态指示
 * =============================================================================
 */

export { default as Avatar } from './Avatar.svelte'
// 展示标签
export { default as Badge } from './Badge.svelte'

// 按钮
export { default as Button } from './Button.svelte'
export { default as Checkbox } from './Checkbox.svelte'
export { default as IconButton } from './IconButton.svelte'
// 表单控件
export { default as Input } from './Input.svelte'
export { default as Progress } from './Progress.svelte'
export { default as Radio } from './Radio.svelte'

export { default as Select } from './Select.svelte'
// 状态指示
export { default as Spinner } from './Spinner.svelte'
export { default as Switch } from './Switch.svelte'

export { default as Tag } from './Tag.svelte'
export { default as Textarea } from './Textarea.svelte'
