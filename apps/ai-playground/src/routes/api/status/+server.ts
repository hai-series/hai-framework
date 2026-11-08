/**
 * 能力状态端点：返回模型、音色与初始化状态，供首页展示。
 * @module routes/api/status/+server
 */

import { kit } from '@h-ai/kit'
import { getLabStatus } from '#lib/server/ai-lab.js'

export const GET = kit.handler(() => kit.response.ok(getLabStatus()))
