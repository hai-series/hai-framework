/**
 * @h-ai/ai — 模型服务构建工具
 *
 * 扫描 `images/*` 下的模型定义（`model.json`），提供列表、校验、权重准备、镜像构建与本地运行能力。
 * 构建工具本身不包含任何模型下载逻辑——权重下载由各模型目录的 `prepare.py` 负责（优先 ModelScope）。
 *
 * 命令：
 *   node models/build.mjs list                          列出全部模型
 *   node models/build.mjs inspect <name>                校验并打印 Manifest
 *   node models/build.mjs prepare <name>                下载权重到 .cache/<name>
 *   node models/build.mjs build <name> --device cpu|gpu 构建镜像（可加 --bundle-model 打包权重）
 *   node models/build.mjs run <name> [--port <p>]       启动服务并做健康检查
 *
 * @module models/build
 */

/* eslint-disable no-console -- 构建工具 CLI 通过 stdout 输出进度与结果 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// 使用 fileURLToPath 保证 Windows `C:\...` 路径正确（不要直接用 URL.pathname）
const CURRENT_FILE = fileURLToPath(import.meta.url)

/** 模型服务根目录 */
export const MODELS_DIR = dirname(CURRENT_FILE)
/** 模型镜像定义目录 */
export const IMAGES_DIR = join(MODELS_DIR, 'images')
/** 权重缓存目录（不进入 git / npm 发布物） */
export const CACHE_DIR = join(MODELS_DIR, '.cache')

/**
 * 模型 Manifest Schema
 *
 * 一个镜像可声明多个 `provides` 能力；`protocol` 决定 Framework 用哪种 Provider 契约调用。
 */
export const ModelManifestSchema = z.object({
  /** Manifest Schema 版本 */
  schemaVersion: z.literal(1),
  /** 镜像定义名称（与目录名一致） */
  name: z.string().min(1),
  /** 镜像版本 */
  version: z.string().min(1),
  /** Docker 仓库名 */
  image: z.string().min(1),
  /** 服务提供的逻辑能力（如 audio.transcribe / audio.synthesize / llm.chat），至少一项 */
  provides: z.array(z.string().min(1)).min(1),
  /** 服务实现的 Provider 契约（如 whisper / indextts / openai） */
  protocol: z.string().min(1),
  /** 支持的运行设备 */
  devices: z.array(z.enum(['cpu', 'gpu'])).min(1),
  /** 容器内服务端口 */
  port: z.number().int().positive(),
  /** 健康检查路径 */
  health: z.string().startsWith('/'),
  /** 模型来源（供 prepare.py 使用） */
  model: z.object({
    /** 模型仓库 ID（ModelScope / HuggingFace 同名仓库） */
    id: z.string().min(1),
    /** 固定的模型版本 / commit */
    revision: z.string().optional(),
  }).optional(),
})

/** 模型 Manifest 类型 */
/** @typedef {z.infer<typeof ModelManifestSchema>} ModelManifest */

/**
 * 校验原始 Manifest 对象
 *
 * @param {unknown} raw - 解析后的 JSON 对象
 * @returns {import('zod').SafeParseReturnType<unknown, ModelManifest>} 校验结果（success + data | error）
 */
export function validateManifest(raw) {
  return ModelManifestSchema.safeParse(raw)
}

/**
 * 列出全部模型镜像名称（含 `model.json` 的子目录）
 *
 * @returns {string[]} 排序后的模型名称列表
 */
export function listImageNames() {
  if (!existsSync(IMAGES_DIR))
    return []
  return readdirSync(IMAGES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(IMAGES_DIR, entry.name, 'model.json')))
    .map(entry => entry.name)
    .sort()
}

/**
 * 读取并校验指定模型的 Manifest
 *
 * @param {string} name - 模型名称（images 下的目录名）
 * @returns {ModelManifest} 校验通过的 Manifest
 * @throws 未找到或校验失败时抛出，供 CLI 以非 0 退出
 */
export function loadManifest(name) {
  const file = join(IMAGES_DIR, name, 'model.json')
  if (!existsSync(file))
    throw new Error(`Model image not found: ${name}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const result = ModelManifestSchema.safeParse(raw)
  if (!result.success)
    throw new Error(`Invalid manifest for ${name}:\n${formatIssues(result.error)}`)
  return result.data
}

/**
 * 加载全部模型 Manifest
 *
 * @returns {ModelManifest[]} 全部校验通过的 Manifest
 */
export function listImages() {
  return listImageNames().map(loadManifest)
}

/** 将 Zod 校验错误格式化为逐行字段错误 */
function formatIssues(error) {
  return error.issues.map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')
}

// ─── CLI ───

/** 解析设备参数（默认 cpu） */
function parseDevice(args) {
  const index = args.indexOf('--device')
  const device = index >= 0 ? args[index + 1] : 'cpu'
  if (device !== 'cpu' && device !== 'gpu')
    throw new Error(`Invalid --device: ${device} (expected cpu | gpu)`)
  return device
}

/** 读取带默认值的字符串参数 */
function parseFlag(args, name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

/** 运行外部命令并透传 stdio；失败抛出（含缺失可执行文件提示） */
function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options })
  if (result.error && result.error.code === 'ENOENT')
    throw new Error(`Command not found: ${command}. Please install it and retry.`)
  if (result.error)
    throw result.error
  if (typeof result.status === 'number' && result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}`)
}

/** list：打印模型能力概览 */
function cmdList() {
  const images = listImages()
  if (images.length === 0) {
    console.log('No model images found.')
    return
  }
  console.log('Model images:')
  for (const manifest of images)
    console.log(`  ${manifest.name.padEnd(28)} provides=${manifest.provides.join(',')} protocol=${manifest.protocol} devices=${manifest.devices.join('/')}`)
}

/** inspect：校验并打印单个 Manifest */
function cmdInspect(name) {
  requireName(name, 'inspect')
  const manifest = loadManifest(name)
  console.log(JSON.stringify(manifest, null, 2))
}

/** prepare：调用模型目录的 prepare.py 下载权重（优先 ModelScope） */
function cmdPrepare(name) {
  requireName(name, 'prepare')
  const manifest = loadManifest(name)
  const imageDir = join(IMAGES_DIR, name)
  const outputDir = join(CACHE_DIR, name)
  console.log(`Preparing weights for ${manifest.name} -> ${outputDir}`)
  runCommand('python', ['prepare.py'], {
    cwd: imageDir,
    env: { ...process.env, HAI_MODEL_OUTPUT_DIR: outputDir },
  })
}

/** build：构建 CPU / GPU 镜像（可选打包权重实现离线运行） */
function cmdBuild(name, args) {
  requireName(name, 'build')
  const manifest = loadManifest(name)
  const device = parseDevice(args)
  if (!manifest.devices.includes(device))
    throw new Error(`Model ${name} does not support device ${device}`)
  const bundleModel = args.includes('--bundle-model')
  const tag = `${manifest.image}:${manifest.version}-${device}`
  const imageDir = join(IMAGES_DIR, name)
  // 打包权重时目标为独立的 <device>-bundled 阶段（Dockerfile 无法条件化 COPY）
  const target = bundleModel ? `${device}-bundled` : device

  const buildArgs = ['buildx', 'build', '--target', target, '-t', tag]
  if (bundleModel) {
    const modelDir = join(CACHE_DIR, name)
    if (!existsSync(modelDir))
      throw new Error(`--bundle-model requires prepared weights. Run: node models/build.mjs prepare ${name}`)
    // 以额外构建上下文注入权重；Dockerfile 的 bundled 阶段从 hai_model 复制到 /opt/models
    buildArgs.push('--build-context', `hai_model=${modelDir}`)
  }
  buildArgs.push('--load', imageDir)

  console.log(`Building ${tag} (device=${device}, bundleModel=${bundleModel})`)
  runCommand('docker', buildArgs)
}

/** run：启动服务并做健康检查 */
async function cmdRun(name, args) {
  requireName(name, 'run')
  const manifest = loadManifest(name)
  const device = parseDevice(args)
  const hostPort = Number(parseFlag(args, '--port', String(manifest.port)))
  const tag = `${manifest.image}:${manifest.version}-${device}`

  const runArgs = ['run', '--rm', '-p', `${hostPort}:${manifest.port}`]
  if (device === 'gpu')
    runArgs.push('--gpus', 'all')
  const modelDir = join(CACHE_DIR, name)
  if (existsSync(modelDir))
    runArgs.push('-v', `${modelDir}:/opt/models`)
  runArgs.push('-d', tag)

  console.log(`Starting ${tag} on port ${hostPort}`)
  const started = spawnSync('docker', runArgs, { encoding: 'utf8' })
  if (started.error && started.error.code === 'ENOENT')
    throw new Error('Command not found: docker. Please install it and retry.')
  if (started.status !== 0)
    throw new Error(started.stderr || 'docker run failed')
  const containerId = started.stdout.trim()

  try {
    await waitForHealth(`http://127.0.0.1:${hostPort}${manifest.health}`)
    console.log(`Service healthy: http://127.0.0.1:${hostPort}${manifest.health}`)
    console.log(`Container: ${containerId}`)
  }
  catch (error) {
    spawnSync('docker', ['stop', containerId], { stdio: 'ignore' })
    throw error
  }
}

/** 轮询健康检查端点直至就绪或超时 */
async function waitForHealth(url, attempts = 60, intervalMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url)
      if (response.ok)
        return
    }
    catch {
      // 服务尚未就绪，继续等待
    }
    await delay(intervalMs)
  }
  throw new Error(`Health check timed out: ${url}`)
}

/** 延迟指定毫秒 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 校验命令行提供了模型名称 */
function requireName(name, command) {
  if (!name)
    throw new Error(`Usage: node models/build.mjs ${command} <name>`)
}

/** CLI 入口 */
async function main() {
  const [command, name, ...args] = process.argv.slice(2)
  switch (command) {
    case 'list':
      cmdList()
      break
    case 'inspect':
      cmdInspect(name)
      break
    case 'prepare':
      cmdPrepare(name)
      break
    case 'build':
      cmdBuild(name, args)
      break
    case 'run':
      await cmdRun(name, args)
      break
    default:
      console.log('Usage: node models/build.mjs <list|inspect|prepare|build|run> [name] [options]')
      if (command)
        process.exitCode = 1
  }
}

// 仅作为脚本直接执行时运行 CLI（被测试 import 时不执行）
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
