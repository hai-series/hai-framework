import { build } from 'esbuild'

/** 构建时把回放引擎变为包内可信资源，运行时不读取 node_modules 或 CDN。 */
export async function buildFeedbackReplayViewer(): Promise<string> {
  const result = await build({
    stdin: {
      contents: `import { Replayer } from '@rrweb/replay'; import replayCss from '@rrweb/replay/dist/style.css'; const style = document.createElement('style'); style.textContent = replayCss; document.head.append(style); globalThis.__HAI_FEEDBACK_REPLAY__ = (events, root) => new Replayer(events, { root, showWarning: false, showDebug: false, loadTimeout: 1000 });`,
      resolveDir: import.meta.dirname,
      sourcefile: 'feedback-replay-viewer.js',
    },
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    loader: { '.css': 'text' },
    write: false,
    legalComments: 'inline',
  })
  const output = result.outputFiles[0]
  if (!output)
    throw new Error('Feedback replay viewer build produced no output')
  return output.text
}
