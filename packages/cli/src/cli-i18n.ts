/** CLI 用户可见消息；入口环境选择默认语言，后续仍使用 core 全局 locale。 */
import process from 'node:process'
import { core } from '@h-ai/core'
import enUS from '../messages/en-US.json'
import zhCN from '../messages/zh-CN.json'

// 显式框架语言优先；终端地区变体映射到已有字典，不加载或生成另一套翻译。
const environmentLocale = [process.env.HAI_CORE_DEFAULTLOCALE, process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find(value => value?.trim())?.trim()
const language = environmentLocale?.split(/[_.-]/)[0]?.toLowerCase()
if (language === 'en' || language === 'c' || language === 'posix')
  core.i18n.setGlobalLocale('en-US')
else if (language === 'zh')
  core.i18n.setGlobalLocale('zh-CN')

export const cliM = core.i18n.createMessageGetter<keyof typeof zhCN>({ 'en-US': enUS, 'zh-CN': zhCN })
