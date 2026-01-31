/**
 * =============================================================================
 * @hai/ui - 主入口
 * =============================================================================
 * UI 组件库，提供:
 * - 基于 Svelte 5 Runes 的组件
 * - DaisyUI / FlyonUI 风格
 * - 完整的类型定义
 *
 * 组件分类（三层划分）：
 * - primitives/ - 原子组件（不可再分的基础 UI 单元）
 * - compounds/ - 组合组件（由原子组件组合而成）
 * - scenes/    - 场景组件（面向具体业务场景的完整 UI 流程）
 * =============================================================================
 */

// =============================================================================
// 组件导出（从 components/ 统一导出所有三层组件）
// =============================================================================

export * from './components/index.js'

// =============================================================================
// Toast 状态
// =============================================================================

// 场景组件类型
export type {
  AvatarUploadProps,
  ChangePasswordFormData,
  ChangePasswordFormProps,
  EncryptedInputProps,
  FileItem,
  FileListProps,
  FileUploadProps,
  ForgotPasswordFormData,
  ForgotPasswordFormProps,
  HashDisplayProps,
  ImageUploadProps,
  LoginFormData,
  LoginFormProps,
  PasswordInputProps,
  RegisterField,
  RegisterFormData,
  RegisterFormProps,
  ResetPasswordFormData,
  ResetPasswordFormProps,
  SignatureDisplayProps,
  UploadFile,
  UploadState,
  UserProfileData,
  UserProfileField,
  UserProfileProps,
} from './components/scenes/types.js'

// =============================================================================
// i18n 国际化（Paraglide 辅助工具）
// =============================================================================

export {
  createLocaleStore,
  DEFAULT_LOCALE,
  DEFAULT_LOCALES,
  detectBrowserLocale,
  interpolate,
  isLocaleSupported,
  resolveLocale,
} from './i18n.svelte.js'

export type {
  InterpolationParams,
  Locale,
  LocaleInfo,
} from './i18n.svelte.js'

// =============================================================================
// 主题配置
// =============================================================================

export {
  DARK_THEMES,
  getAllFontUrls,
  getThemeFontUrl,
  getThemeInfo,
  isDarkTheme,
  THEME_GROUPS,
  THEMES,
} from './theme-config.js'

export type {
  ThemeGroup,
  ThemeInfo,
} from './theme-config.js'

// =============================================================================
// Toast
// =============================================================================

export { toast, type ToastItem } from './toast.svelte.js'
// 基础类型
export type {
  AlertProps,
  Alignment,
  AvatarProps,
  BadgeProps,
  BreadcrumbItem,
  BreadcrumbProps,
  ButtonProps,
  CardProps,
  CheckboxProps,
  ConfirmProps,
  DrawerProps,
  DropdownItem,
  DropdownProps,
  EmptyProps,
  FormFieldProps,
  FormProps,
  IconButtonProps,
  InputProps,
  ModalProps,
  PaginationProps,
  PopoverProps,
  Position,
  ProgressProps,
  RadioProps,
  ResultProps,
  SelectOption,
  SelectProps,
  Size,
  SkeletonProps,
  SpinnerProps,
  StepItem,
  StepsProps,
  SwitchProps,
  TabItem,
  TableColumn,
  TableProps,
  TabsProps,
  TagInputProps,
  TagProps,
  TextareaProps,
  ToastProps,
  TooltipProps,
  Variant,
} from './types.js'
export {
  cn,
  generateId,
  getAlertVariantClass,
  getBadgeSizeClass,
  getBadgeVariantClass,
  getInputSizeClass,
  getProgressVariantClass,
  getSizeClass,
  getVariantClass,
  sizeClasses,
  variantClasses,
} from './utils.js'
