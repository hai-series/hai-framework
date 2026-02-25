/**
 * =============================================================================
 * @h-ai/ui - 自动导入类型声明
 * =============================================================================
 * 让 Svelte/TS 识别通过预处理器自动注入的组件名称。
 * =============================================================================
 */

type AutoImportMarkup = (args: { content: string; filename?: string }) => { code: string }

type AutoImportHaiUiPreprocessor = {
  name: string
  markup: AutoImportMarkup
}

export function autoImportHaiUi(): AutoImportHaiUiPreprocessor

declare global {
  // primitives
  const Avatar: typeof import('@h-ai/ui')['Avatar']
  const Badge: typeof import('@h-ai/ui')['Badge']
  const BareButton: typeof import('@h-ai/ui')['BareButton']
  const BareInput: typeof import('@h-ai/ui')['BareInput']
  const Button: typeof import('@h-ai/ui')['Button']
  const Checkbox: typeof import('@h-ai/ui')['Checkbox']
  const IconButton: typeof import('@h-ai/ui')['IconButton']
  const Input: typeof import('@h-ai/ui')['Input']
  const Progress: typeof import('@h-ai/ui')['Progress']
  const Radio: typeof import('@h-ai/ui')['Radio']
  const Rating: typeof import('@h-ai/ui')['Rating']
  const Select: typeof import('@h-ai/ui')['Select']
  const Spinner: typeof import('@h-ai/ui')['Spinner']
  const Switch: typeof import('@h-ai/ui')['Switch']
  const Tag: typeof import('@h-ai/ui')['Tag']
  const Textarea: typeof import('@h-ai/ui')['Textarea']
  const ToggleCheckbox: typeof import('@h-ai/ui')['ToggleCheckbox']
  const ToggleRadio: typeof import('@h-ai/ui')['ToggleRadio']

  // compounds
  const Accordion: typeof import('@h-ai/ui')['Accordion']
  const Alert: typeof import('@h-ai/ui')['Alert']
  const Breadcrumb: typeof import('@h-ai/ui')['Breadcrumb']
  const Card: typeof import('@h-ai/ui')['Card']
  const Confirm: typeof import('@h-ai/ui')['Confirm']
  const DataTable: typeof import('@h-ai/ui')['DataTable']
  const Drawer: typeof import('@h-ai/ui')['Drawer']
  const Dropdown: typeof import('@h-ai/ui')['Dropdown']
  const Empty: typeof import('@h-ai/ui')['Empty']
  const FeedbackModal: typeof import('@h-ai/ui')['FeedbackModal']
  const Form: typeof import('@h-ai/ui')['Form']
  const FormField: typeof import('@h-ai/ui')['FormField']
  const LanguageSwitch: typeof import('@h-ai/ui')['LanguageSwitch']
  const Modal: typeof import('@h-ai/ui')['Modal']
  const MultiSelect: typeof import('@h-ai/ui')['MultiSelect']
  const PageHeader: typeof import('@h-ai/ui')['PageHeader']
  const Pagination: typeof import('@h-ai/ui')['Pagination']
  const Popover: typeof import('@h-ai/ui')['Popover']
  const Result: typeof import('@h-ai/ui')['Result']
  const ScoreBar: typeof import('@h-ai/ui')['ScoreBar']
  const SettingsModal: typeof import('@h-ai/ui')['SettingsModal']
  const SeverityBadge: typeof import('@h-ai/ui')['SeverityBadge']
  const Skeleton: typeof import('@h-ai/ui')['Skeleton']
  const Steps: typeof import('@h-ai/ui')['Steps']
  const Table: typeof import('@h-ai/ui')['Table']
  const Tabs: typeof import('@h-ai/ui')['Tabs']
  const TagInput: typeof import('@h-ai/ui')['TagInput']
  const ThemeSelector: typeof import('@h-ai/ui')['ThemeSelector']
  const ThemeToggle: typeof import('@h-ai/ui')['ThemeToggle']
  const Timeline: typeof import('@h-ai/ui')['Timeline']
  const Toast: typeof import('@h-ai/ui')['Toast']
  const ToastContainer: typeof import('@h-ai/ui')['ToastContainer']
  const Tooltip: typeof import('@h-ai/ui')['Tooltip']

  // scenes - iam
  const ChangePasswordForm: typeof import('@h-ai/ui')['ChangePasswordForm']
  const ForgotPasswordForm: typeof import('@h-ai/ui')['ForgotPasswordForm']
  const LoginForm: typeof import('@h-ai/ui')['LoginForm']
  const PasswordInput: typeof import('@h-ai/ui')['PasswordInput']
  const RegisterForm: typeof import('@h-ai/ui')['RegisterForm']
  const ResetPasswordForm: typeof import('@h-ai/ui')['ResetPasswordForm']
  const UserProfile: typeof import('@h-ai/ui')['UserProfile']

  // scenes - storage
  const AvatarUpload: typeof import('@h-ai/ui')['AvatarUpload']
  const FileUpload: typeof import('@h-ai/ui')['FileUpload']
  const ImageUpload: typeof import('@h-ai/ui')['ImageUpload']

  // scenes - crypto
  const EncryptedInput: typeof import('@h-ai/ui')['EncryptedInput']
  const HashDisplay: typeof import('@h-ai/ui')['HashDisplay']
  const SignatureDisplay: typeof import('@h-ai/ui')['SignatureDisplay']
}

export {}
