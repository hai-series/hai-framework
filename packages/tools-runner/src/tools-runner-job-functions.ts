import type { RunnerFunctions } from '@h-ai/runner'
import type { Tool } from '@h-ai/tools'
import type { ToolArtifactAccess, ToolArtifactReference } from '@h-ai/tools/server'
import type { RunnerToolServiceContext, RunnerToolSet } from './tools-runner-types.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isIPv4 } from 'node:net'
import { extname } from 'node:path'
import { core } from '@h-ai/core'
import { HaiToolsError, tools } from '@h-ai/tools'
import { z } from 'zod'
import { toolsRunnerM } from './tools-runner-i18n.js'

const jobTitles = {
  'documents.extract': 'tools_job_documents_extract',
  'documents.generate': 'tools_job_documents_generate',
  'office.convert': 'tools_job_office_convert',
  'office.recalculate': 'tools_job_office_recalculate',
  'ocr.recognize': 'tools_job_ocr_recognize',
  'browser.navigate': 'tools_job_browser_navigate',
  'web.capture': 'tools_job_web_capture',
  'preview.build': 'tools_job_preview_build',
  'video.render': 'tools_job_video_render',
} as const
const browserUrlLimit = 2048
const dnsHostname = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{0,61}[A-Za-z0-9]$/u
const localDnsSuffix = /\.(?:localhost|local|internal|test|invalid)$/iu

/**
 * 已登记作业环境；缺失的环境不会出现在工具目录。
 * @example
 * ```ts
 * import type { JobToolOptions } from '@h-ai/tools-runner'
 * function environments(options: JobToolOptions) { return options.environments }
 * ```
 */
export interface JobToolOptions {
  context: RunnerToolServiceContext
  files: ToolArtifactAccess
  runner: RunnerFunctions
  environments: Partial<Record<'documents' | 'office' | 'ocr' | 'browser' | 'web' | 'preview' | 'video', string>>
  /** 部署控制的 HTTP 出网代理；仅支持非本机、非链路本地的 IPv4 和显式端口。 */
  browserProxy?: string
}

/**
 * 构造固定命令的容器工具，复用 Runner 已登记的隔离环境。
 * @example 模块内部上下文
 * ```ts
 * function build(options: JobToolOptions) { return createJobTools(options) }
 * ```
 */
export function createJobTools({ context, files, runner, environments, browserProxy }: JobToolOptions): RunnerToolSet {
  const proxy = browserProxy === undefined
    ? undefined
    : browserProxyAddress(browserProxy)
  const definitions: Tool[] = []
  const bindings: Record<string, string> = {}
  const groups = new Map<string, string[]>()
  const fileId = z.string().min(1).max(200).meta({
    format: 'artifact-id',
    title: toolsRunnerM('tools_field_fileId'),
  })
  const url = z.string().refine(isBrowserUrl).meta({
    format: 'uri',
    title: toolsRunnerM('tools_field_url'),
  })
  const safeName = /^[a-z0-9][\w.-]{0,127}$/iu
  const response = z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        text: z.string().max(256 * 1024).optional(),
        artifact: z.object({
          name: z.string().regex(safeName),
          bytes: z.number().int().positive().max(50 * 1024 * 1024),
        }).optional(),
        summary: z.object({
          sourceUrl: z.url(),
          title: z.string().max(2048),
          text: z.string().max(256 * 1024),
        }).passthrough().optional(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.object({
        code: z.string().regex(/^[A-Z_]{1,64}$/u),
        message: z.string().max(2048),
      }),
    }),
  ])
  const command = 'import subprocess,sys\np=subprocess.run(["/usr/local/bin/hai-tool"],input=sys.argv[1].encode("utf-8"))\nif p.returncode: sys.exit(1)\nsys.stdin.buffer.read(1)'
  const logger = core.logger.child({ module: 'tools', scope: 'jobs' })

  function add<TInput>(group: keyof JobToolOptions['environments'], operation: keyof typeof jobTitles, parameters: z.ZodType<TInput>, prepare: (input: TInput) => { request: Record<string, unknown>, source?: string, inline?: string, output?: string, kind?: string, mediaType?: string }) {
    const environmentId = environments[group]
    const networked = group === 'web' || group === 'browser'
    if (!environmentId || (networked && !proxy))
      return
    const name = operation.replaceAll('.', '_')
    bindings[name] = environmentId
    const category = group === 'office' || group === 'ocr'
      ? 'documents'
      : group === 'browser' || group === 'preview'
        ? 'web'
        : group
    groups.set(category, [
      ...(groups.get(category) ?? []),
      name,
    ])
    definitions.push(tools.define<TInput, { text?: string, sourceUrl?: string, title?: string, artifacts?: ToolArtifactReference[] }>({
      name,
      title: toolsRunnerM(jobTitles[operation]),
      description: toolsRunnerM(jobTitles[operation]),
      ...(operation === 'documents.generate'
        ? {
            examples: [
              {
                label: toolsRunnerM('tools_example_report'),
                input: {
                  format: 'docx',
                  title: toolsRunnerM('tools_example_report'),
                  paragraphs: [
                    toolsRunnerM('tools_example_reportContent'),
                  ],
                },
              },
            ],
          }
        : {}),
      parameters,
      timeoutMs: 300_000,
      resultHandler: async (input, { signal }) => {
        const fail = (cause?: unknown) => core.err(HaiToolsError.EXECUTION_FAILED, toolsRunnerM('tools_executionFailed'), cause)
        const execution = context.execution
        const environment = runner.environment(environmentId)
        if (!execution || !environment.success || !environment.data.capabilities.includes(operation)
          || environment.data.networkPolicy !== (group === 'web' || group === 'browser'
            ? 'internal'
            : 'offline')) {
          return core.err(HaiToolsError.FORBIDDEN, toolsRunnerM('tools_forbidden'))
        }
        const spec = prepare(input)
        const inputs: Record<string, string> = {}
        if (spec.source) {
          const file = await files.read({ ...context, signal }, { id: spec.source })
          if (!file.success)
            return file
          const extension = extname(file.data.name).toLowerCase()
          if (!/^\.[a-z0-9]{1,8}$/u.test(extension) || file.data.data.byteLength > 50 * 1024 * 1024)
            return fail()
          if (operation === 'office.recalculate') {
            if (extension !== '.xlsx' && extension !== '.ods')
              return fail()
            spec.output = `result${extension}`
            spec.mediaType = extension === '.ods'
              ? 'application/vnd.oasis.opendocument.spreadsheet'
              : spec.mediaType
          }
          spec.request.input = `source${extension}`
          inputs[`source${extension}`] = Buffer.from(file.data.data).toString('base64')
        }
        if (spec.inline !== undefined) {
          inputs['source.json'] = Buffer.from(spec.inline).toString('base64')
          spec.request.input = 'source.json'
        }
        if (spec.output)
          spec.request.output = spec.output
        const request = JSON.stringify({ operation, ...spec.request })
        if (Buffer.byteLength(request) > 64 * 1024)
          return fail()
        signal.throwIfAborted()
        const started = await execution.start({
          command: '/usr/bin/python3',
          args: ['-I', '-S', '-c', command, request],
          inputs,
          ...(networked
            ? {
                env: { HAI_TOOL_BROWSER_PROXY: proxy! },
              }
            : {}),
        })
        if (!started.success)
          return started
        const process = started.data
        process.stderr.resume()
        // 产物只能从活跃容器读取，先在宿主暂存，确认清理后再发布。
        const outcome = await (async () => {
          const chunks: Buffer[] = []
          let total = 0
          for await (const raw of process.stdout.iterator({ destroyOnReturn: false })) {
            signal.throwIfAborted()
            const chunk = Buffer.from(raw)
            total += chunk.length
            if (total > 2 * 1024 * 1024)
              return fail()
            chunks.push(chunk)
            if (chunk.includes(10))
              break
          }
          const parsed = response.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8').trim()))
          if (!parsed.success)
            return fail()
          if (!parsed.data.success) {
            const toolCode = parsed.data.error.code
            const diagnostic = { operation, toolCode, executionId: execution.id }
            logger.warn('Tool job operation rejected', diagnostic)
            if (toolCode === 'SANDBOX_UNAVAILABLE')
              return core.err(HaiToolsError.EXECUTION_FAILED, toolsRunnerM('tools_sandboxUnavailable'), diagnostic)
            if (toolCode === 'UNSUPPORTED_PROJECT')
              return core.err(HaiToolsError.VALIDATION_FAILED, toolsRunnerM('tools_previewUnsupported'), diagnostic)
            if (toolCode === 'OUTPUT_LIMIT')
              return core.err(HaiToolsError.VALIDATION_FAILED, toolsRunnerM('tools_outputLimit'), diagnostic)
            if (toolCode === 'UNSAFE_DOCUMENT')
              return core.err(HaiToolsError.VALIDATION_FAILED, toolsRunnerM('tools_unsafeDocument'), diagnostic)
            if (toolCode === 'TIMEOUT')
              return core.err(HaiToolsError.TIMEOUT, toolsRunnerM('tools_timeout'), diagnostic)
            // 只把已知输入拒绝归为校验错误，输出损坏和未知工作进程故障仍属服务故障。
            const invalidInput = [
              'INVALID_REQUEST',
              'INVALID_INPUT',
              'INVALID_PROJECT',
              'UNSAFE_PROJECT',
            ].includes(toolCode)
            return core.err(invalidInput
              ? HaiToolsError.VALIDATION_FAILED
              : HaiToolsError.EXECUTION_FAILED, invalidInput
              ? toolsRunnerM('tools_validationFailed')
              : toolsRunnerM('tools_executionFailed'), diagnostic)
          }
          const result = parsed.data.data
          if (result.text !== undefined && !spec.output)
            return core.ok({ text: result.text })
          if (!result.artifact || result.artifact.name !== spec.output)
            return fail()
          const bytes = await process.artifact(spec.output, result.artifact.bytes)
          if (!bytes.success)
            return bytes
          const data = Buffer.from(bytes.data, 'base64')
          if (data.byteLength !== result.artifact.bytes)
            return fail()
          return core.ok({ name: spec.output, data, summary: result.summary })
        })().catch((cause: unknown) => {
          logger.warn('Tool job response failed', { operation })
          return fail(cause)
        })
        const closed = await process.close()
        if (!closed.success) {
          // 保留首次操作错误的安全摘要，避免泄露工作进程原文和私有上下文。
          return outcome.success
            ? closed
            : core.err({
                ...closed.error,
                ext: {
                  ...closed.error.ext,
                  operationError: core.error.toPublic(outcome.error),
                },
              })
        }
        if (!outcome.success)
          return outcome
        const result = outcome.data
        if ('text' in result)
          return core.ok(result)
        signal.throwIfAborted()
        const { name, data, summary } = result
        // 确定性 ID 使执行重试复用相同业务产物；宿主仍核验内容一致。
        const digest = createHash('sha256').update(`${execution.id}:${name}`).digest('hex')
        const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
        try {
          const published = await files.publish({ ...context, signal }, {
            id,
            name,
            kind: spec.kind ?? 'file',
            mediaType: spec.mediaType ?? 'application/octet-stream',
            data,
          })
          if (!published.success)
            return published
          return core.ok({
            artifacts: [published.data],
            ...(summary
              ? { sourceUrl: summary.sourceUrl, title: summary.title, text: summary.text }
              : {}),
          })
        }
        catch (cause) {
          logger.warn('Tool job artifact publication failed', { operation, executionId: execution.id })
          return fail(cause)
        }
      },
    }))
  }
  add('documents', 'documents.extract', z.object({ fileId }), input => ({ source: input.fileId, request: {} }))
  // 与固定 Python 作业保持同一文本、布局与 UTF-8 资料限额，不注入互斥内容的默认空数组。
  const documentText = (maximum: number, required = false) => z.string().refine((value) => {
    const characters = [...value]
    return characters.length <= maximum && (!required || value.trim().length > 0)
      && characters.every((character) => {
        const code = character.codePointAt(0) ?? 0
        return (code >= 32 || '\t\n\r'.includes(character)) && !(code >= 0xD800 && code <= 0xDFFF) && (code & 0xFFFF) < 0xFFFE
      })
  }).meta({
    maxLength: maximum,
    ...(required
      ? { minLength: 1 }
      : {}),
  })
  const documentTable = (slide = false) => z.strictObject({
    headers: z.array(documentText(slide ? 32 : 2000)).min(1).max(slide ? 6 : 20).meta({
      title: toolsRunnerM('tools_field_headers'),
    }),
    rows: z.array(z.array(documentText(slide ? 32 : 2000)).max(slide ? 6 : 20)).max(slide ? 6 : 200).optional().meta({
      title: toolsRunnerM('tools_field_rows'),
    }),
  }).superRefine((table, check) => {
    if (table.rows?.some(row => row.length !== table.headers.length)) {
      check.addIssue({
        code: 'custom',
        message: toolsRunnerM('tools_validationFailed'),
        path: ['rows'],
      })
    }
  }).meta({
    title: toolsRunnerM('tools_field_table'),
  })
  const slide = z.strictObject({
    title: documentText(100, true).meta({
      title: toolsRunnerM('tools_field_title'),
    }),
    paragraphs: z.array(documentText(160)).max(6).optional().meta({
      title: toolsRunnerM('tools_field_paragraphs'),
    }),
    table: documentTable(true).optional(),
  }).superRefine((slide, check) => {
    const paragraphs = slide.paragraphs ?? []
    const length = paragraphs.reduce((total, paragraph) => total + [...paragraph].length, 0)
    if (length > 800 || (slide.table && (paragraphs.length > 1 || length > 120))) {
      check.addIssue({
        code: 'custom',
        message: toolsRunnerM('tools_validationFailed'),
        path: ['paragraphs'],
      })
    }
  }).meta({
    allOf: [
      {
        if: {
          required: ['table'],
        },
        then: {
          properties: {
            paragraphs: {
              maxItems: 1,
              items: { maxLength: 120 },
            },
          },
        },
      },
    ],
  })
  const document = z.strictObject({
    format: z.enum(['docx', 'xlsx', 'pptx']).default('docx').meta({
      title: toolsRunnerM('tools_field_format'),
    }),
    title: documentText(200, true).meta({
      title: toolsRunnerM('tools_field_title'),
    }),
    paragraphs: z.array(documentText(2000)).max(100).optional().meta({
      title: toolsRunnerM('tools_field_paragraphs'),
    }),
    table: documentTable().optional(),
    slides: z.array(slide).min(1).max(20).optional().meta({
      title: toolsRunnerM('tools_field_slides'),
    }),
  }).superRefine(({ format, ...content }, check) => {
    const reject = (path: string) => check.addIssue({
      code: 'custom',
      message: toolsRunnerM('tools_validationFailed'),
      path: [path],
    })
    if (Buffer.byteLength(JSON.stringify(content)) > 256 * 1024)
      reject('title')
    if (content.slides !== undefined) {
      if (format !== 'pptx' || content.paragraphs !== undefined || content.table !== undefined)
        reject('slides')
    }
    else if (format === 'pptx' && !slide.safeParse(content).success) {
      reject('paragraphs')
    }
  }).meta({
    description: toolsRunnerM('tools_documentLimits'),
    allOf: [
      {
        if: {
          required: ['slides'],
        },
        then: {
          required: ['format'],
          properties: {
            format: { const: 'pptx' },
          },
          not: {
            anyOf: [
              {
                required: ['paragraphs'],
              },
              {
                required: ['table'],
              },
            ],
          },
        },
      },
      {
        if: {
          required: ['format'],
          properties: {
            format: { const: 'pptx' },
          },
          not: {
            required: ['slides'],
          },
        },
        then: {
          properties: {
            title: { maxLength: 100 },
            paragraphs: {
              maxItems: 6,
              items: { maxLength: 160 },
            },
            table: {
              properties: {
                headers: {
                  maxItems: 6,
                  items: { maxLength: 32 },
                },
                rows: {
                  maxItems: 6,
                  items: {
                    maxItems: 6,
                    items: { maxLength: 32 },
                  },
                },
              },
            },
          },
        },
      },
    ],
  })
  add('documents', 'documents.generate', document, ({ format, ...input }) => ({
    inline: JSON.stringify(input),
    request: {},
    output: `result.${format}`,
    mediaType: format === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }))
  add('office', 'office.convert', z.object({ fileId }), input => ({
    source: input.fileId,
    request: {},
    output: 'result.pdf',
    mediaType: 'application/pdf',
  }))
  add('office', 'office.recalculate', z.object({ fileId }), input => ({
    source: input.fileId,
    request: {},
    output: 'result.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  add('ocr', 'ocr.recognize', z.object({
    fileId,
    language: z.enum([
      'eng',
      'chi_sim',
      'jpn',
      'eng+chi_sim',
      'eng+jpn',
    ]).default('eng').meta({
      title: toolsRunnerM('tools_field_language'),
    }),
  }), input => ({
    source: input.fileId,
    request: { language: input.language },
  }))
  add('browser', 'browser.navigate', z.object({ url }), input => ({
    request: { url: input.url },
    output: 'screen.png',
    kind: 'image',
    mediaType: 'image/png',
  }))
  add('web', 'web.capture', z.object({
    url,
    maxScreenshots: z.number().int().min(1).max(8).default(4).meta({
      title: toolsRunnerM('tools_field_maxScreenshots'),
    }),
  }), input => ({ request: input, output: 'capture.zip', mediaType: 'application/zip' }))
  add('preview', 'preview.build', z.object({
    fileId: fileId.meta({
      ...fileId.meta(),
      contentMediaType: 'application/zip',
    }),
  }), input => ({
    source: input.fileId,
    request: {},
    output: 'preview.html',
    kind: 'html',
    mediaType: 'text/html',
  }))
  add('video', 'video.render', z.object({
    fileId,
    fps: z.union([
      z.literal(24),
      z.literal(25),
      z.literal(30),
    ]).default(30).meta({
      title: toolsRunnerM('tools_field_fps'),
    }),
  }), input => ({
    source: input.fileId,
    request: { fps: input.fps },
    output: 'video.mp4',
    kind: 'video',
    mediaType: 'video/mp4',
  }))
  return {
    tools: definitions,
    environments: bindings,
    groups: [...groups].map(([id, names]) => ({ id, title: id, tools: names })),
  }
}

/** 与 Python parse_url 同步校验原始地址和 Unicode 字符数。 */
function isBrowserUrl(value: string): boolean {
  if (value.slice(0, 8).toLowerCase() !== 'https://')
    return false
  let length = 0
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (++length > browserUrlLimit || code <= 32 || character === '\\' || (code >= 0xD800 && code <= 0xDFFF))
      return false
  }
  // 在 URL 解析器归一化前校验原始主机名，只允许省略端口或显式使用 HTTPS 默认端口。
  const authority = value.slice(8).split(/[/?#]/u, 1)[0]
  const host = authority.replace(/:0*443$/u, '')
  return host.length <= 253 && dnsHostname.test(host) && !localDnsSuffix.test(host)
}

/** 与 Python deployment_proxy 同步校验，不接受 URL 归一化后的十六进制或简写 IP。 */
function browserProxyAddress(value: string): string | undefined {
  const parsed = /^http:\/\/((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})\/?$/iu.exec(value)
  if (!parsed || !isIPv4(parsed[1]))
    return undefined
  const host = parsed[1]
  const port = Number(parsed[2])
  const octets = host.split('.').map(Number)
  if (port < 1 || port > 65535 || host === '0.0.0.0' || octets[0] === 127
    || (octets[0] >= 224 && octets[0] <= 239) || (octets[0] === 169 && octets[1] === 254)) {
    return undefined
  }
  return `http://${host}:${port}`
}
