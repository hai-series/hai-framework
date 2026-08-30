/** CLI 用户可见消息；通过 core 的全局 locale 选择语言。 */
import { core } from '@h-ai/core'
import enUS from '../messages/en-US.json'
import zhCN from '../messages/zh-CN.json'

export const cliM = core.i18n.createMessageGetter<keyof typeof zhCN>({ 'en-US': enUS, 'zh-CN': zhCN })
