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
  // `Range` 与 DOM Range 构造器冲突，保持显式 import。
  const Rating: typeof import('@h-ai/ui')['Rating']
  const Select: typeof import('@h-ai/ui')['Select']
  const Spinner: typeof import('@h-ai/ui')['Spinner']
  const Switch: typeof import('@h-ai/ui')['Switch']
  const Tag: typeof import('@h-ai/ui')['Tag']
  const Textarea: typeof import('@h-ai/ui')['Textarea']
  const ToggleCheckbox: typeof import('@h-ai/ui')['ToggleCheckbox']
  const ToggleInput: typeof import('@h-ai/ui')['ToggleInput']
  const ToggleRadio: typeof import('@h-ai/ui')['ToggleRadio']

  // compounds
  const Accordion: typeof import('@h-ai/ui')['Accordion']
  const ActionSheet: typeof import('@h-ai/ui')['ActionSheet']
  const Alert: typeof import('@h-ai/ui')['Alert']
  const AppBar: typeof import('@h-ai/ui')['AppBar']
  const BottomNav: typeof import('@h-ai/ui')['BottomNav']
  const Breadcrumb: typeof import('@h-ai/ui')['Breadcrumb']
  const Calendar: typeof import('@h-ai/ui')['Calendar']
  const Card: typeof import('@h-ai/ui')['Card']
  const Combobox: typeof import('@h-ai/ui')['Combobox']
  const Confirm: typeof import('@h-ai/ui')['Confirm']
  const DataTable: typeof import('@h-ai/ui')['DataTable']
  const DatePicker: typeof import('@h-ai/ui')['DatePicker']
  const Drawer: typeof import('@h-ai/ui')['Drawer']
  const Dropdown: typeof import('@h-ai/ui')['Dropdown']
  const Empty: typeof import('@h-ai/ui')['Empty']
  const Form: typeof import('@h-ai/ui')['Form']
  const FormField: typeof import('@h-ai/ui')['FormField']
  const InfiniteScroll: typeof import('@h-ai/ui')['InfiniteScroll']
  const Modal: typeof import('@h-ai/ui')['Modal']
  const PageHeader: typeof import('@h-ai/ui')['PageHeader']
  const Pagination: typeof import('@h-ai/ui')['Pagination']
  const Popover: typeof import('@h-ai/ui')['Popover']
  const PullRefresh: typeof import('@h-ai/ui')['PullRefresh']
  const Result: typeof import('@h-ai/ui')['Result']
  const SafeArea: typeof import('@h-ai/ui')['SafeArea']
  const Skeleton: typeof import('@h-ai/ui')['Skeleton']
  const Steps: typeof import('@h-ai/ui')['Steps']
  const SwipeCell: typeof import('@h-ai/ui')['SwipeCell']
  const Tabs: typeof import('@h-ai/ui')['Tabs']
  const TagInput: typeof import('@h-ai/ui')['TagInput']
  const Timeline: typeof import('@h-ai/ui')['Timeline']
  const ToastContainer: typeof import('@h-ai/ui')['ToastContainer']
  const Tooltip: typeof import('@h-ai/ui')['Tooltip']

  // scenes - app
  const FeedbackModal: typeof import('@h-ai/ui')['FeedbackModal']
  const LanguageSwitch: typeof import('@h-ai/ui')['LanguageSwitch']
  const SettingsModal: typeof import('@h-ai/ui')['SettingsModal']
  const ThemeColorPicker: typeof import('@h-ai/ui')['ThemeColorPicker']
  const ThemeSelector: typeof import('@h-ai/ui')['ThemeSelector']
  const ThemeToggle: typeof import('@h-ai/ui')['ThemeToggle']

  // scenes - iam
  const ChangePasswordForm: typeof import('@h-ai/ui')['ChangePasswordForm']
  const ForgotPasswordForm: typeof import('@h-ai/ui')['ForgotPasswordForm']
  const LoginForm: typeof import('@h-ai/ui')['LoginForm']
  const PasswordInput: typeof import('@h-ai/ui')['PasswordInput']
  const PermGuard: typeof import('@h-ai/ui')['PermGuard']
  const RegisterForm: typeof import('@h-ai/ui')['RegisterForm']
  const ResetPasswordForm: typeof import('@h-ai/ui')['ResetPasswordForm']
  const UserProfile: typeof import('@h-ai/ui')['UserProfile']

  // scenes - storage
  const AvatarUpload: typeof import('@h-ai/ui')['AvatarUpload']
  const FileList: typeof import('@h-ai/ui')['FileList']
  const FileUpload: typeof import('@h-ai/ui')['FileUpload']
  const ImageUpload: typeof import('@h-ai/ui')['ImageUpload']

  // scenes - crypto
  const EncryptedInput: typeof import('@h-ai/ui')['EncryptedInput']
  const HashDisplay: typeof import('@h-ai/ui')['HashDisplay']
  const SignatureDisplay: typeof import('@h-ai/ui')['SignatureDisplay']

  // scenes - ai
  const AiDocumentDownloadMenu: typeof import('@h-ai/ui')['AiDocumentDownloadMenu']
  const AiDocumentEditor: typeof import('@h-ai/ui')['AiDocumentEditor']
  const AiTableEditor: typeof import('@h-ai/ui')['AiTableEditor']
  const MarkdownRenderer: typeof import('@h-ai/ui')['MarkdownRenderer']

  // scenes - crud
  const CrudDeleteConfirm: typeof import('@h-ai/ui')['CrudDeleteConfirm']
  const CrudDetailDrawer: typeof import('@h-ai/ui')['CrudDetailDrawer']
  const CrudEditDrawer: typeof import('@h-ai/ui')['CrudEditDrawer']
  const CrudFilterBar: typeof import('@h-ai/ui')['CrudFilterBar']
  const CrudPage: typeof import('@h-ai/ui')['CrudPage']
}

export {}
