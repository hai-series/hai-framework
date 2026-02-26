/**
 * =============================================================================
 * @h-ai/ui - 组件导出
 * =============================================================================
 *
 * 组件按三层划分：
 *
 * primitives/ - 原子组件（不可再分的基础 UI 单元）
 * - Button, IconButton, BareButton - 按钮
 * - Input, BareInput, Textarea, Select, Checkbox, Switch, Radio - 表单控件
 * - ToggleCheckbox, ToggleInput, ToggleRadio - 原生切换控件
 * - Range, Rating - 数值控件
 * - Badge, Avatar, Tag - 展示标签
 * - Spinner, Progress - 状态指示
 *
 * compounds/ - 组合组件（由原子组件 + Bits UI headless 组合而成）
 * - Form, FormField, TagInput - 表单组合
 * - Combobox - 可搜索下拉选择（单选/多选，Bits UI headless）
 * - Calendar, DatePicker - 日历日期（Bits UI headless + @internationalized/date）
 * - Alert, ToastContainer - 反馈提示
 * - Modal, Drawer, Confirm, Popover - 弹层容器
 * - Card, DataTable, Accordion, Timeline - 数据展示
 * - Tabs, Pagination, Breadcrumb, Steps - 导航控件
 * - Dropdown, Tooltip - 悬浮交互
 * - Skeleton, Empty, Result - 状态占位
 * - PageHeader - 页面头部
 *
 * scenes/ - 场景组件（面向具体业务场景的完整 UI 流程）
 * - app/ - 应用级（FeedbackModal, SettingsModal, LanguageSwitch, ThemeToggle, ThemeSelector）
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
