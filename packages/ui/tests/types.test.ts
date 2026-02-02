/**
 * =============================================================================
 * @hai/ui - Types 类型测试
 * =============================================================================
 * 使用 TypeScript 类型检查验证类型定义正确性
 */

import type {
  AlertProps,
  AvatarProps,
  BadgeProps,
  BareButtonProps,
  BareInputProps,
  ButtonProps,
  CardProps,
  CheckboxProps,
  ConfirmProps,
  DrawerProps,
  EmptyProps,
  FormFieldProps,
  FormProps,
  InputProps,
  ModalProps,
  PaginationProps,
  PopoverProps,
  ProgressProps,
  RadioProps,
  ResultProps,
  SelectProps,
  Size,
  SkeletonProps,
  SpinnerProps,
  StepsProps,
  SwitchProps,
  TabsProps,
  TagInputProps,
  TagProps,
  ToastProps,
  ToggleCheckboxProps,
  ToggleRadioProps,
  TooltipProps,
  Variant,
} from '../src/lib/types.js'
import { describe, expectTypeOf, it } from 'vitest'

describe('基础类型', () => {
  it('size 类型应该正确', () => {
    expectTypeOf<Size>().toEqualTypeOf<'xs' | 'sm' | 'md' | 'lg' | 'xl'>()
  })

  it('variant 类型应该正确', () => {
    expectTypeOf<Variant>().toEqualTypeOf<
      'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
    >()
  })
})

describe('原子组件 Props', () => {
  it('buttonProps 应该包含正确的属性', () => {
    expectTypeOf<ButtonProps>().toHaveProperty('variant')
    expectTypeOf<ButtonProps>().toHaveProperty('size')
    expectTypeOf<ButtonProps>().toHaveProperty('disabled')
    expectTypeOf<ButtonProps>().toHaveProperty('loading')
    expectTypeOf<ButtonProps>().toHaveProperty('outline')
    expectTypeOf<ButtonProps>().toHaveProperty('onclick')
  })

  it('bareButtonProps 应该包含正确的属性', () => {
    expectTypeOf<BareButtonProps>().toHaveProperty('class')
    expectTypeOf<BareButtonProps>().toHaveProperty('ariaLabel')
    expectTypeOf<BareButtonProps>().toHaveProperty('onclick')
  })

  it('inputProps 应该包含正确的属性', () => {
    expectTypeOf<InputProps>().toHaveProperty('value')
    expectTypeOf<InputProps>().toHaveProperty('type')
    expectTypeOf<InputProps>().toHaveProperty('placeholder')
    expectTypeOf<InputProps>().toHaveProperty('disabled')
    expectTypeOf<InputProps>().toHaveProperty('error')
  })

  it('bareInputProps 应该包含正确的属性', () => {
    expectTypeOf<BareInputProps>().toHaveProperty('type')
    expectTypeOf<BareInputProps>().toHaveProperty('class')
    expectTypeOf<BareInputProps>().toHaveProperty('onchange')
  })

  it('selectProps 应该包含正确的属性', () => {
    expectTypeOf<SelectProps>().toHaveProperty('options')
    expectTypeOf<SelectProps>().toHaveProperty('value')
    expectTypeOf<SelectProps>().toHaveProperty('placeholder')
  })

  it('checkboxProps 应该包含正确的属性', () => {
    expectTypeOf<CheckboxProps>().toHaveProperty('checked')
    expectTypeOf<CheckboxProps>().toHaveProperty('label')
    expectTypeOf<CheckboxProps>().toHaveProperty('disabled')
  })

  it('toggleCheckboxProps 应该包含正确的属性', () => {
    expectTypeOf<ToggleCheckboxProps>().toHaveProperty('checked')
    expectTypeOf<ToggleCheckboxProps>().toHaveProperty('onchange')
  })

  it('switchProps 应该包含正确的属性', () => {
    expectTypeOf<SwitchProps>().toHaveProperty('checked')
    expectTypeOf<SwitchProps>().toHaveProperty('label')
  })

  it('radioProps 应该包含正确的属性', () => {
    expectTypeOf<RadioProps>().toHaveProperty('options')
    expectTypeOf<RadioProps>().toHaveProperty('value')
  })

  it('toggleRadioProps 应该包含正确的属性', () => {
    expectTypeOf<ToggleRadioProps>().toHaveProperty('checked')
    expectTypeOf<ToggleRadioProps>().toHaveProperty('onchange')
  })

  it('badgeProps 应该包含正确的属性', () => {
    expectTypeOf<BadgeProps>().toHaveProperty('variant')
    expectTypeOf<BadgeProps>().toHaveProperty('size')
  })

  it('avatarProps 应该包含正确的属性', () => {
    expectTypeOf<AvatarProps>().toHaveProperty('src')
    expectTypeOf<AvatarProps>().toHaveProperty('alt')
    expectTypeOf<AvatarProps>().toHaveProperty('size')
  })

  it('tagProps 应该包含正确的属性', () => {
    expectTypeOf<TagProps>().toHaveProperty('text')
    expectTypeOf<TagProps>().toHaveProperty('variant')
    expectTypeOf<TagProps>().toHaveProperty('closable')
  })

  it('spinnerProps 应该包含正确的属性', () => {
    expectTypeOf<SpinnerProps>().toHaveProperty('size')
    expectTypeOf<SpinnerProps>().toHaveProperty('variant')
  })

  it('progressProps 应该包含正确的属性', () => {
    expectTypeOf<ProgressProps>().toHaveProperty('value')
    expectTypeOf<ProgressProps>().toHaveProperty('max')
    expectTypeOf<ProgressProps>().toHaveProperty('variant')
  })
})

describe('组合组件 Props', () => {
  it('modalProps 应该包含正确的属性', () => {
    expectTypeOf<ModalProps>().toHaveProperty('open')
    expectTypeOf<ModalProps>().toHaveProperty('title')
    expectTypeOf<ModalProps>().toHaveProperty('size')
    expectTypeOf<ModalProps>().toHaveProperty('onclose')
  })

  it('drawerProps 应该包含正确的属性', () => {
    expectTypeOf<DrawerProps>().toHaveProperty('open')
    expectTypeOf<DrawerProps>().toHaveProperty('position')
    expectTypeOf<DrawerProps>().toHaveProperty('size')
  })

  it('alertProps 应该包含正确的属性', () => {
    expectTypeOf<AlertProps>().toHaveProperty('variant')
    expectTypeOf<AlertProps>().toHaveProperty('closable')
  })

  it('toastProps 应该包含正确的属性', () => {
    expectTypeOf<ToastProps>().toHaveProperty('message')
    expectTypeOf<ToastProps>().toHaveProperty('variant')
    expectTypeOf<ToastProps>().toHaveProperty('duration')
    expectTypeOf<ToastProps>().toHaveProperty('position')
  })

  it('cardProps 应该包含正确的属性', () => {
    expectTypeOf<CardProps>().toHaveProperty('title')
    expectTypeOf<CardProps>().toHaveProperty('padding')
    expectTypeOf<CardProps>().toHaveProperty('bordered')
  })

  it('formProps 应该包含正确的属性', () => {
    expectTypeOf<FormProps>().toHaveProperty('loading')
    expectTypeOf<FormProps>().toHaveProperty('onsubmit')
  })

  it('formFieldProps 应该包含正确的属性', () => {
    expectTypeOf<FormFieldProps>().toHaveProperty('label')
    expectTypeOf<FormFieldProps>().toHaveProperty('error')
    expectTypeOf<FormFieldProps>().toHaveProperty('required')
  })

  it('tabsProps 应该包含正确的属性', () => {
    expectTypeOf<TabsProps>().toHaveProperty('items')
    expectTypeOf<TabsProps>().toHaveProperty('active')
  })

  it('paginationProps 应该包含正确的属性', () => {
    expectTypeOf<PaginationProps>().toHaveProperty('currentPage')
    expectTypeOf<PaginationProps>().toHaveProperty('totalPages')
    expectTypeOf<PaginationProps>().toHaveProperty('onchange')
  })

  it('tooltipProps 应该包含正确的属性', () => {
    expectTypeOf<TooltipProps>().toHaveProperty('content')
    expectTypeOf<TooltipProps>().toHaveProperty('position')
  })

  it('popoverProps 应该包含正确的属性', () => {
    expectTypeOf<PopoverProps>().toHaveProperty('open')
    expectTypeOf<PopoverProps>().toHaveProperty('position')
    expectTypeOf<PopoverProps>().toHaveProperty('trigger')
  })

  it('confirmProps 应该包含正确的属性', () => {
    expectTypeOf<ConfirmProps>().toHaveProperty('open')
    expectTypeOf<ConfirmProps>().toHaveProperty('title')
    expectTypeOf<ConfirmProps>().toHaveProperty('message')
    expectTypeOf<ConfirmProps>().toHaveProperty('onconfirm')
  })

  it('skeletonProps 应该包含正确的属性', () => {
    expectTypeOf<SkeletonProps>().toHaveProperty('variant')
    expectTypeOf<SkeletonProps>().toHaveProperty('width')
    expectTypeOf<SkeletonProps>().toHaveProperty('height')
  })

  it('emptyProps 应该包含正确的属性', () => {
    expectTypeOf<EmptyProps>().toHaveProperty('title')
    expectTypeOf<EmptyProps>().toHaveProperty('description')
    expectTypeOf<EmptyProps>().toHaveProperty('icon')
  })

  it('resultProps 应该包含正确的属性', () => {
    expectTypeOf<ResultProps>().toHaveProperty('status')
    expectTypeOf<ResultProps>().toHaveProperty('title')
    expectTypeOf<ResultProps>().toHaveProperty('description')
  })

  it('stepsProps 应该包含正确的属性', () => {
    expectTypeOf<StepsProps>().toHaveProperty('items')
    expectTypeOf<StepsProps>().toHaveProperty('current')
    expectTypeOf<StepsProps>().toHaveProperty('direction')
  })

  it('tagInputProps 应该包含正确的属性', () => {
    expectTypeOf<TagInputProps>().toHaveProperty('tags')
    expectTypeOf<TagInputProps>().toHaveProperty('maxTags')
    expectTypeOf<TagInputProps>().toHaveProperty('placeholder')
  })
})
