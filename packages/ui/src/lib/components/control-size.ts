import type { Size } from '../types.js'

interface FormControlSizeClasses {
  /** 固定高度，适用于单行控件 */
  height: string
  /** 最小高度，适用于内容可换行的控件 */
  minHeight: string
  /** 水平内边距与字号 */
  spacing: string
  /** 固定高度、水平内边距与字号的完整组合 */
  control: string
}

const FORM_CONTROL_SIZE_CLASSES: Record<Size, FormControlSizeClasses> = {
  'xs': { height: 'h-8', minHeight: 'min-h-8', spacing: 'px-2.5 text-xs', control: 'h-8 px-2.5 text-xs' },
  'sm': { height: 'h-9', minHeight: 'min-h-9', spacing: 'px-3 text-sm', control: 'h-9 px-3 text-sm' },
  'md': { height: 'h-10', minHeight: 'min-h-10', spacing: 'px-3 text-sm', control: 'h-10 px-3 text-sm' },
  'lg': { height: 'h-12', minHeight: 'min-h-12', spacing: 'px-4 text-base', control: 'h-12 px-4 text-base' },
  'xl': { height: 'h-14', minHeight: 'min-h-14', spacing: 'px-4 text-lg', control: 'h-14 px-4 text-lg' },
  '2xl': { height: 'h-14', minHeight: 'min-h-14', spacing: 'px-4 text-lg', control: 'h-14 px-4 text-lg' },
  '3xl': { height: 'h-14', minHeight: 'min-h-14', spacing: 'px-4 text-lg', control: 'h-14 px-4 text-lg' },
  '4xl': { height: 'h-14', minHeight: 'min-h-14', spacing: 'px-4 text-lg', control: 'h-14 px-4 text-lg' },
}

/**
 * 获取输入类控件的统一尺寸类名。
 *
 * 仅供组件内部复用，确保 Input、Select 与复合输入控件使用同一盒模型。
 */
export function getFormControlSizeClasses(size: Size): FormControlSizeClasses {
  return FORM_CONTROL_SIZE_CLASSES[size]
}
