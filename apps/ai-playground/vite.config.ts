import path from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const HAI_PACKAGE_REGEX = /@h-ai\//

export default defineConfig(({ mode, command }) => {
  const envResult = command === 'build' ? { success: true as const, data: {} as Record<string, string> } : core.config.loadEnvFiles({ mode, envDir: process.cwd() })
  if (!envResult.success)
    throw new Error(envResult.error.message)
  const env = envResult.data
  Object.assign(process.env, env)

  return {
    envDir: false,
    plugins: [
      sveltekit(),
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        strategy: ['cookie', 'baseLocale'],
      }),
    ],
    optimizeDeps: {
      exclude: [...haiOptimizeExclude],
      include: [...haiPrebundledDeps],
    },
    ssr: {
      noExternal: [HAI_PACKAGE_REGEX],
    },
    server: {
      fs: {
        allow: [path.resolve(process.cwd(), '..', '..')],
      },
    },
  }
})
