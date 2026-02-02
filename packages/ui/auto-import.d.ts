/**
 * =============================================================================
 * @hai/ui - 自动导入类型声明
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
  const Avatar: typeof import('@hai/ui')['Avatar']
  const Badge: typeof import('@hai/ui')['Badge']
  const BareButton: typeof import('@hai/ui')['BareButton']
  const BareInput: typeof import('@hai/ui')['BareInput']
  const Button: typeof import('@hai/ui')['Button']
  const Checkbox: typeof import('@hai/ui')['Checkbox']
  const IconButton: typeof import('@hai/ui')['IconButton']
  const Input: typeof import('@hai/ui')['Input']
  const Progress: typeof import('@hai/ui')['Progress']
  const Radio: typeof import('@hai/ui')['Radio']
  const Rating: typeof import('@hai/ui')['Rating']
  const Select: typeof import('@hai/ui')['Select']
  const Spinner: typeof import('@hai/ui')['Spinner']
  const Switch: typeof import('@hai/ui')['Switch']
  const Tag: typeof import('@hai/ui')['Tag']
  const Textarea: typeof import('@hai/ui')['Textarea']
  const ToggleCheckbox: typeof import('@hai/ui')['ToggleCheckbox']
  const ToggleRadio: typeof import('@hai/ui')['ToggleRadio']

  // compounds
  const Accordion: typeof import('@hai/ui')['Accordion']
  const Alert: typeof import('@hai/ui')['Alert']
  const Breadcrumb: typeof import('@hai/ui')['Breadcrumb']
  const Card: typeof import('@hai/ui')['Card']
  const Confirm: typeof import('@hai/ui')['Confirm']
  const DataTable: typeof import('@hai/ui')['DataTable']
  const Drawer: typeof import('@hai/ui')['Drawer']
  const Dropdown: typeof import('@hai/ui')['Dropdown']
  const Empty: typeof import('@hai/ui')['Empty']
  const FeedbackModal: typeof import('@hai/ui')['FeedbackModal']
  const Form: typeof import('@hai/ui')['Form']
  const FormField: typeof import('@hai/ui')['FormField']
  const LanguageSwitch: typeof import('@hai/ui')['LanguageSwitch']
  const Modal: typeof import('@hai/ui')['Modal']
  const MultiSelect: typeof import('@hai/ui')['MultiSelect']
  const PageHeader: typeof import('@hai/ui')['PageHeader']
  const Pagination: typeof import('@hai/ui')['Pagination']
  const Popover: typeof import('@hai/ui')['Popover']
  const Result: typeof import('@hai/ui')['Result']
  const ScoreBar: typeof import('@hai/ui')['ScoreBar']
  const SettingsModal: typeof import('@hai/ui')['SettingsModal']
  const SeverityBadge: typeof import('@hai/ui')['SeverityBadge']
  const Skeleton: typeof import('@hai/ui')['Skeleton']
  const Steps: typeof import('@hai/ui')['Steps']
  const Table: typeof import('@hai/ui')['Table']
  const Tabs: typeof import('@hai/ui')['Tabs']
  const TagInput: typeof import('@hai/ui')['TagInput']
  const ThemeSelector: typeof import('@hai/ui')['ThemeSelector']
  const ThemeToggle: typeof import('@hai/ui')['ThemeToggle']
  const Timeline: typeof import('@hai/ui')['Timeline']
  const Toast: typeof import('@hai/ui')['Toast']
  const ToastContainer: typeof import('@hai/ui')['ToastContainer']
  const Tooltip: typeof import('@hai/ui')['Tooltip']

  // scenes - iam
  const ChangePasswordForm: typeof import('@hai/ui')['ChangePasswordForm']
  const ForgotPasswordForm: typeof import('@hai/ui')['ForgotPasswordForm']
  const LoginForm: typeof import('@hai/ui')['LoginForm']
  const PasswordInput: typeof import('@hai/ui')['PasswordInput']
  const RegisterForm: typeof import('@hai/ui')['RegisterForm']
  const ResetPasswordForm: typeof import('@hai/ui')['ResetPasswordForm']
  const UserProfile: typeof import('@hai/ui')['UserProfile']

  // scenes - storage
  const AvatarUpload: typeof import('@hai/ui')['AvatarUpload']
  const FileUpload: typeof import('@hai/ui')['FileUpload']
  const ImageUpload: typeof import('@hai/ui')['ImageUpload']

  // scenes - crypto
  const EncryptedInput: typeof import('@hai/ui')['EncryptedInput']
  const HashDisplay: typeof import('@hai/ui')['HashDisplay']
  const SignatureDisplay: typeof import('@hai/ui')['SignatureDisplay']
}

export {}
