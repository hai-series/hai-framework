import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'
import { buildFeedbackReplayViewer } from './feedback-build-viewer'

export default defineConfig(async () => ({
  ...baseConfig,
  entry: { 'index': 'src/index.ts', 'client/index': 'src/client/index.ts', 'bundle/index': 'src/bundle/index.ts' },
  external: ['@h-ai/core', '@h-ai/reldb', '@h-ai/storage', '@h-ai/reach', '@h-ai/api-contract', '@rrweb/record', 'html2canvas', 'fflate', 'zod'],
  define: { __FEEDBACK_REPLAY_SCRIPT__: JSON.stringify(await buildFeedbackReplayViewer()) },
}))
