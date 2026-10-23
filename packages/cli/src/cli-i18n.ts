/** CLI 用户可见消息；入口环境选择默认语言，后续仍使用 core 全局 locale。 */
import process from 'node:process'
import { core } from '@h-ai/core'
import enUS from '../messages/en-US.json'
import jaJP from '../messages/ja-JP.json'
import zhCN from '../messages/zh-CN.json'

// 显式框架语言优先；终端地区变体映射到已有字典，不加载或生成另一套翻译。
const environmentLocale = [process.env.HAI_CORE_DEFAULTLOCALE, process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find(value => value?.trim())?.trim()
const language = environmentLocale?.split(/[_.-]/)[0]?.toLowerCase()
if (language === 'en' || language === 'c' || language === 'posix')
  core.i18n.setGlobalLocale('en-US')
else if (language === 'ja')
  core.i18n.setGlobalLocale('ja-JP')
else if (language === 'zh')
  core.i18n.setGlobalLocale('zh-CN')

/**
 * CLI 内部的消息获取器；先选取首个非空环境值，再映射语言。未知语言保持 core 当前 locale；后续显式切换 core locale 仍生效。
 * @example 模块内部上下文
 * ```ts
 * core.i18n.setGlobalLocale('en-US')
 * const help = cliM('cli_help_create')
 * // CLI 入口加载前：HAI_CORE_DEFAULTLOCALE=en-US 优先于 LC_ALL=zh_CN.UTF-8。
 * // 未显式指定时依次读取 LC_ALL、LC_MESSAGES、LANG；en/C/POSIX 映射 en-US，zh 映射 zh-CN，ja 映射 ja-JP。
 * ```
 */
export const cliM = core.i18n.createMessageGetter<keyof typeof zhCN>({ 'en-US': enUS, 'ja-JP': jaJP, 'zh-CN': zhCN })
