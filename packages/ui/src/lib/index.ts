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

export { toast, type ToastItem } from './toast.svelte.js'

// =============================================================================
// 类型导出
// =============================================================================

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
// 工具函数
// =============================================================================

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
