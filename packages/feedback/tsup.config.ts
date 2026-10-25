import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'
import { buildFeedbackReplayViewer } from './feedback-build-viewer'

export default defineConfig(async () => ({
  ...baseConfig,
  entry: { 'index': 'src/index.ts', 'client/index': 'src/client/index.ts', 'bundle/index': 'src/bundle/index.ts', 'tauri': 'src/client/feedback-client-tauri.ts', 'capacitor': 'src/client/feedback-client-capacitor.ts' },
  external: ['@capacitor/filesystem', '@capacitor/share', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-fs', '@h-ai/core', '@h-ai/reldb', '@h-ai/storage', '@h-ai/reach', '@h-ai/api-contract', '@rrweb/record', 'html2canvas', 'fflate', 'zod'],
  define: { __FEEDBACK_REPLAY_SCRIPT__: JSON.stringify(await buildFeedbackReplayViewer()) },
}))
