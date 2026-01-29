/**
 * =============================================================================
 * @hai/ui - 主入口
 * =============================================================================
 * UI 组件库，提供:
 * - 基于 Svelte 5 Runes 的组件
 * - DaisyUI / FlyonUI 风格
 * - 完整的类型定义
 * =============================================================================
 */

// 组件
export {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Drawer,
  Dropdown,
  Input,
  Modal,
  Pagination,
  Progress,
  Select,
  Spinner,
  Switch,
  Table,
  Tabs,
  Textarea,
  ToastContainer,
  Tooltip,
} from './components/index.js'

// Toast 状态
export { toast, type ToastItem } from './toast.svelte.js'

// 类型
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
  DrawerProps,
  DropdownItem,
  DropdownProps,
  InputProps,
  ModalProps,
  PaginationProps,
  Position,
  ProgressProps,
  RadioProps,
  SelectOption,
  SelectProps,
  Size,
  SpinnerProps,
  SwitchProps,
  TabItem,
  TableColumn,
  TableProps,
  TabsProps,
  TextareaProps,
  ToastProps,
  TooltipProps,
  Variant,
} from './types.js'

// 工具
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
