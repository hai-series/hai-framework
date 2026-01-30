/**
 * =============================================================================
 * @hai/ui - UI 模块 i18n 翻译
 * =============================================================================
 * UI 组件的国际化翻译资源
 * =============================================================================
 */

import type { ModuleTranslations } from '@hai/core'

/**
 * UI 模块翻译资源
 */
export const uiTranslations: ModuleTranslations = {
  module: 'ui',
  translations: {
    'zh-CN': {
      button: {
        submit: '提交',
        cancel: '取消',
        confirm: '确认',
        close: '关闭',
        save: '保存',
        delete: '删除',
        edit: '编辑',
        add: '添加',
        remove: '移除',
        clear: '清除',
        reset: '重置',
        back: '返回',
        next: '下一步',
        previous: '上一步',
        finish: '完成',
        upload: '上传',
        download: '下载',
        copy: '复制',
        paste: '粘贴',
        selectAll: '全选',
        more: '更多',
      },
      input: {
        placeholder: '请输入',
        search: '搜索...',
        password: '请输入密码',
        confirmPassword: '请确认密码',
      },
      select: {
        placeholder: '请选择',
        noOptions: '暂无选项',
        noResults: '无匹配结果',
        loading: '加载中...',
      },
      table: {
        empty: '暂无数据',
        loading: '数据加载中...',
        total: '共 {total} 条',
        selected: '已选 {count} 项',
        actions: '操作',
      },
      pagination: {
        total: '共 {total} 条',
        page: '第 {current} 页',
        pageSize: '{size} 条/页',
        goto: '跳至',
        pageUnit: '页',
      },
      modal: {
        confirmTitle: '确认',
        deleteTitle: '删除确认',
        deleteMessage: '确定要删除吗？此操作不可撤销。',
      },
      upload: {
        dragText: '点击或拖拽文件到此处上传',
        sizeLimit: '文件大小不能超过 {size}',
        typeLimit: '仅支持 {types} 格式',
        uploading: '上传中...',
        success: '上传成功',
        failed: '上传失败',
      },
      datetime: {
        today: '今天',
        yesterday: '昨天',
        tomorrow: '明天',
        thisWeek: '本周',
        thisMonth: '本月',
        thisYear: '今年',
      },
      form: {
        required: '必填',
        optional: '选填',
        invalid: '格式不正确',
      },
      empty: {
        noData: '暂无数据',
        noResults: '未找到结果',
        noContent: '暂无内容',
      },
      theme: {
        light: '浅色主题',
        dark: '深色主题',
        system: '跟随系统',
        select: '选择主题',
      },
      language: {
        select: '选择语言',
        current: '当前语言',
      },
    },
    'en-US': {
      button: {
        submit: 'Submit',
        cancel: 'Cancel',
        confirm: 'Confirm',
        close: 'Close',
        save: 'Save',
        delete: 'Delete',
        edit: 'Edit',
        add: 'Add',
        remove: 'Remove',
        clear: 'Clear',
        reset: 'Reset',
        back: 'Back',
        next: 'Next',
        previous: 'Previous',
        finish: 'Finish',
        upload: 'Upload',
        download: 'Download',
        copy: 'Copy',
        paste: 'Paste',
        selectAll: 'Select All',
        more: 'More',
      },
      input: {
        placeholder: 'Please enter',
        search: 'Search...',
        password: 'Enter password',
        confirmPassword: 'Confirm password',
      },
      select: {
        placeholder: 'Please select',
        noOptions: 'No options',
        noResults: 'No results found',
        loading: 'Loading...',
      },
      table: {
        empty: 'No data',
        loading: 'Loading data...',
        total: 'Total {total} items',
        selected: '{count} selected',
        actions: 'Actions',
      },
      pagination: {
        total: 'Total {total}',
        page: 'Page {current}',
        pageSize: '{size} / page',
        goto: 'Go to',
        pageUnit: '',
      },
      modal: {
        confirmTitle: 'Confirm',
        deleteTitle: 'Delete Confirmation',
        deleteMessage: 'Are you sure you want to delete? This action cannot be undone.',
      },
      upload: {
        dragText: 'Click or drag file to upload',
        sizeLimit: 'File size cannot exceed {size}',
        typeLimit: 'Only {types} formats are supported',
        uploading: 'Uploading...',
        success: 'Upload successful',
        failed: 'Upload failed',
      },
      datetime: {
        today: 'Today',
        yesterday: 'Yesterday',
        tomorrow: 'Tomorrow',
        thisWeek: 'This week',
        thisMonth: 'This month',
        thisYear: 'This year',
      },
      form: {
        required: 'Required',
        optional: 'Optional',
        invalid: 'Invalid format',
      },
      empty: {
        noData: 'No data',
        noResults: 'No results found',
        noContent: 'No content',
      },
      theme: {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
        select: 'Select theme',
      },
      language: {
        select: 'Select language',
        current: 'Current language',
      },
    },
  },
}
