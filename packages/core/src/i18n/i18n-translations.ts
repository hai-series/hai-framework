/**
 * =============================================================================
 * @hai/core - 核心模块 i18n 翻译
 * =============================================================================
 * 核心模块的国际化翻译资源
 * =============================================================================
 */

import type { ModuleTranslations } from './i18n-types.js'

/**
 * Core 模块翻译资源
 */
export const coreTranslations: ModuleTranslations = {
  module: 'core',
  translations: {
    'zh-CN': {
      error: {
        unknown: '未知错误',
        network: '网络错误',
        timeout: '请求超时',
        notFound: '资源不存在',
        unauthorized: '未授权',
        forbidden: '无权限',
        validation: '验证失败',
        internal: '内部错误',
      },
      action: {
        confirm: '确认',
        cancel: '取消',
        save: '保存',
        delete: '删除',
        edit: '编辑',
        create: '创建',
        update: '更新',
        search: '搜索',
        reset: '重置',
        submit: '提交',
        loading: '加载中...',
        retry: '重试',
      },
      status: {
        success: '成功',
        failed: '失败',
        pending: '等待中',
        processing: '处理中',
        completed: '已完成',
        cancelled: '已取消',
      },
      validation: {
        required: '{field} 不能为空',
        minLength: '{field} 至少需要 {min} 个字符',
        maxLength: '{field} 不能超过 {max} 个字符',
        email: '请输入有效的邮箱地址',
        url: '请输入有效的 URL',
        number: '请输入有效的数字',
        integer: '请输入整数',
        positive: '请输入正数',
        pattern: '{field} 格式不正确',
      },
      time: {
        justNow: '刚刚',
        minutesAgo: '{n} 分钟前',
        hoursAgo: '{n} 小时前',
        daysAgo: '{n} 天前',
        weeksAgo: '{n} 周前',
        monthsAgo: '{n} 个月前',
        yearsAgo: '{n} 年前',
      },
    },
    'en-US': {
      error: {
        unknown: 'Unknown error',
        network: 'Network error',
        timeout: 'Request timeout',
        notFound: 'Resource not found',
        unauthorized: 'Unauthorized',
        forbidden: 'Forbidden',
        validation: 'Validation failed',
        internal: 'Internal error',
      },
      action: {
        confirm: 'Confirm',
        cancel: 'Cancel',
        save: 'Save',
        delete: 'Delete',
        edit: 'Edit',
        create: 'Create',
        update: 'Update',
        search: 'Search',
        reset: 'Reset',
        submit: 'Submit',
        loading: 'Loading...',
        retry: 'Retry',
      },
      status: {
        success: 'Success',
        failed: 'Failed',
        pending: 'Pending',
        processing: 'Processing',
        completed: 'Completed',
        cancelled: 'Cancelled',
      },
      validation: {
        required: '{field} is required',
        minLength: '{field} must be at least {min} characters',
        maxLength: '{field} must not exceed {max} characters',
        email: 'Please enter a valid email address',
        url: 'Please enter a valid URL',
        number: 'Please enter a valid number',
        integer: 'Please enter an integer',
        positive: 'Please enter a positive number',
        pattern: '{field} format is invalid',
      },
      time: {
        justNow: 'Just now',
        minutesAgo: '{n} minutes ago',
        hoursAgo: '{n} hours ago',
        daysAgo: '{n} days ago',
        weeksAgo: '{n} weeks ago',
        monthsAgo: '{n} months ago',
        yearsAgo: '{n} years ago',
      },
    },
  },
}
