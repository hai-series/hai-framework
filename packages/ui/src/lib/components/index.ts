/**
 * =============================================================================
 * @h-ai/ui - 组件导出
 * =============================================================================
 *
 * 组件按三层划分：
 *
 * primitives/ - 原子组件（不可再分的基础 UI 单元）
 * - Button, IconButton - 按钮
 * - Input, Textarea, Select, Checkbox, Switch, Radio - 表单控件
 * - Badge, Avatar, Tag - 展示标签
 * - Spinner, Progress - 状态指示
 *
 * compounds/ - 组合组件（由原子组件组合而成）
 * - Form, FormField, TagInput, MultiSelect - 表单组合
 * - Alert, Toast, ToastContainer - 反馈提示
 * - Modal, Drawer, Confirm, Popover - 弹层容器
 * - Card, Table, DataTable - 数据展示
 * - Tabs, Pagination, Breadcrumb, Steps - 导航控件
 * - Dropdown, Tooltip - 悬浮交互
 * - Skeleton, Empty, Result - 状态占位
 * - PageHeader, ScoreBar, SeverityBadge - 业务展示
 * - FeedbackModal, SettingsModal, LanguageSwitch, ThemeToggle - 应用级组件
 *
 * scenes/ - 场景组件（面向具体业务场景的完整 UI 流程）
 * - iam/ - 身份认证（LoginForm, RegisterForm, PasswordInput 等）
 * - storage/ - 存储管理（FileUpload, FileList, ImageUpload 等）
 * - crypto/ - 加密展示（EncryptedInput, HashDisplay, SignatureDisplay）
 * =============================================================================
 */

// 组合组件
export * from './compounds'

// 原子组件
export * from './primitives'

// 场景组件
export * from './scenes'
